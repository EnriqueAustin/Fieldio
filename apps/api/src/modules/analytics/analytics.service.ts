import { prisma } from '@fieldio/database';

export const analyticsService = {
    getDashboardStats: async (
        companyId: string,
        range?: { from?: Date; to?: Date }
    ) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const invoiceRangeWhere = {
            companyId,
            deletedAt: null,
            createdAt: { gte: from, lte: to },
        };

        const totalRevenue = await prisma.invoice.aggregate({
            where: invoiceRangeWhere,
            _sum: { total: true },
        });

        const outstandingRevenue = await prisma.invoice.aggregate({
            where: { companyId, deletedAt: null, status: { not: 'PAID' } },
            _sum: { balance: true },
        });

        const jobsCount = await prisma.job.groupBy({
            by: ['status'],
            where: { companyId, deletedAt: null, createdAt: { gte: from, lte: to } },
            _count: { id: true },
        });

        const totalJobs = jobsCount.reduce((acc, curr) => acc + curr._count.id, 0);
        const completedJobs = jobsCount.find((j) => j.status === 'COMPLETED')?._count.id || 0;
        const activeJobs = totalJobs - completedJobs;

        const totalCustomers = await prisma.customer.count({
            where: { companyId, deletedAt: null },
        });

        const recentJobs = await prisma.job.findMany({
            where: { companyId, deletedAt: null },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: {
                customer: true,
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });

        const activeTechs = await prisma.job.findMany({
            where: { companyId, deletedAt: null, status: { in: ['EN_ROUTE', 'ON_SITE'] } },
            select: {
                id: true,
                title: true,
                status: true,
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });

        const [estimateStats, overdueInvoices, totalTechnicians, utilizedTechnicians] = await Promise.all([
            prisma.estimate.groupBy({
                by: ['status'],
                where: { companyId, createdAt: { gte: from, lte: to } },
                _count: { id: true },
            }),
            prisma.invoice.count({
                where: {
                    companyId,
                    deletedAt: null,
                    status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: now },
                },
            }),
            prisma.user.count({
                where: { companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            }),
            prisma.job.findMany({
                where: {
                    companyId,
                    deletedAt: null,
                    techId: { not: null },
                    status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'] },
                    scheduledStart: { gte: from, lte: to },
                },
                select: { techId: true },
                distinct: ['techId'],
            }),
        ]);

        const sentEstimates =
            estimateStats.find((item) => ['SENT', 'APPROVED', 'DECLINED'].includes(item.status))?._count.id ?? 0;
        const approvedEstimates =
            estimateStats.find((item) => item.status === 'APPROVED')?._count.id ?? 0;
        const conversionRate = sentEstimates ? Math.round((approvedEstimates / sentEstimates) * 100) : 0;
        const utilizationRate = totalTechnicians
            ? Math.round((utilizedTechnicians.length / totalTechnicians) * 100)
            : 0;

        return {
            range: { from, to },
            revenue: {
                total: totalRevenue._sum.total || 0,
                outstanding: outstandingRevenue._sum.balance || 0,
            },
            jobs: { total: totalJobs, completed: completedJobs, active: activeJobs, breakdown: jobsCount },
            customers: { total: totalCustomers },
            estimates: { sent: sentEstimates, approved: approvedEstimates, conversionRate },
            technicians: { total: totalTechnicians, active: activeTechs.length, utilizationRate },
            invoices: { overdue: overdueInvoices },
            recentJobs,
            activeTechs,
        };
    },

    getJobCostingReport: async (companyId: string, range?: { from?: Date; to?: Date }) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: 'COMPLETED',
                actualEnd: { gte: from, lte: to },
            },
            include: {
                lineItems: true,
                expenses: true,
                invoice: { select: { total: true, balance: true, status: true } },
                customer: { select: { name: true } },
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                purchaseOrders: { select: { total: true, status: true } },
            },
        });

        const report = jobs.map((job) => {
            const laborCost = job.lineItems
                .filter((li) => li.type === 'LABOR')
                .reduce((sum, li) => sum + Number(li.total), 0);
            const materialCost = job.lineItems
                .filter((li) => li.type === 'MATERIAL')
                .reduce((sum, li) => sum + Number(li.total), 0);
            const serviceCost = job.lineItems
                .filter((li) => li.type === 'SERVICE')
                .reduce((sum, li) => sum + Number(li.total), 0);
            const expenseTotal = job.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
            const poTotal = job.purchaseOrders
                .filter((po) => po.status !== 'CANCELED')
                .reduce((sum, po) => sum + Number(po.total), 0);
            const totalCost = laborCost + materialCost + expenseTotal + poTotal;
            const invoiceTotal = job.invoice ? Number(job.invoice.total) : 0;
            const profit = invoiceTotal - totalCost;
            const margin = invoiceTotal > 0 ? Math.round((profit / invoiceTotal) * 100) : 0;

            const durationHours = job.actualStart && job.actualEnd
                ? (job.actualEnd.getTime() - job.actualStart.getTime()) / (1000 * 60 * 60)
                : 0;

            return {
                jobId: job.id,
                title: job.title,
                customer: job.customer.name,
                tech: job.tech
                    ? [job.tech.firstName, job.tech.lastName].filter(Boolean).join(' ') || job.tech.email
                    : null,
                completedAt: job.actualEnd,
                durationHours: Math.round(durationHours * 100) / 100,
                costs: { labor: laborCost, material: materialCost, service: serviceCost, expenses: expenseTotal, purchaseOrders: poTotal, total: totalCost },
                invoiceTotal,
                profit,
                margin,
            };
        });

        const summary = {
            totalJobs: report.length,
            totalRevenue: report.reduce((s, r) => s + r.invoiceTotal, 0),
            totalCosts: report.reduce((s, r) => s + r.costs.total, 0),
            totalProfit: report.reduce((s, r) => s + r.profit, 0),
            avgMargin: report.length
                ? Math.round(report.reduce((s, r) => s + r.margin, 0) / report.length)
                : 0,
            avgDurationHours: report.length
                ? Math.round((report.reduce((s, r) => s + r.durationHours, 0) / report.length) * 100) / 100
                : 0,
        };

        return { range: { from, to }, summary, jobs: report };
    },

    getTimesheetReport: async (companyId: string, range?: { from?: Date; to?: Date }) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                techId: { not: null },
                actualStart: { not: null },
                actualEnd: { not: null, gte: from, lte: to },
            },
            select: {
                id: true,
                title: true,
                actualStart: true,
                actualEnd: true,
                scheduledStart: true,
                scheduledEnd: true,
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                customer: { select: { name: true } },
            },
            orderBy: { actualStart: 'asc' },
        });

        const techMap = new Map<string, {
            tech: { id: string; name: string; email: string };
            entries: Array<{
                jobId: string;
                title: string;
                customer: string;
                date: string;
                startTime: string;
                endTime: string;
                hours: number;
            }>;
            totalHours: number;
        }>();

        for (const job of jobs) {
            if (!job.tech || !job.actualStart || !job.actualEnd) continue;
            const techId = job.tech.id;
            const techName = [job.tech.firstName, job.tech.lastName].filter(Boolean).join(' ') || job.tech.email;

            if (!techMap.has(techId)) {
                techMap.set(techId, {
                    tech: { id: techId, name: techName, email: job.tech.email },
                    entries: [],
                    totalHours: 0,
                });
            }

            const hours = (job.actualEnd.getTime() - job.actualStart.getTime()) / (1000 * 60 * 60);
            const rounded = Math.round(hours * 100) / 100;

            const record = techMap.get(techId)!;
            record.entries.push({
                jobId: job.id,
                title: job.title,
                customer: job.customer.name,
                date: job.actualStart.toISOString().split('T')[0],
                startTime: job.actualStart.toISOString(),
                endTime: job.actualEnd.toISOString(),
                hours: rounded,
            });
            record.totalHours += rounded;
        }

        const technicians = Array.from(techMap.values()).map((t) => ({
            ...t,
            totalHours: Math.round(t.totalHours * 100) / 100,
        }));

        return {
            range: { from, to },
            technicians,
            totalHours: Math.round(technicians.reduce((s, t) => s + t.totalHours, 0) * 100) / 100,
            totalEntries: jobs.length,
        };
    },

    getTechEarningsReport: async (
        companyId: string,
        range?: { from?: Date; to?: Date }
    ) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: 'COMPLETED',
                techId: { not: null },
                actualEnd: { gte: from, lte: to },
            },
            include: {
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                invoice: { select: { total: true, status: true } },
                lineItems: true,
            },
        });

        const techMap = new Map<string, {
            tech: { id: string; name: string; email: string };
            jobCount: number;
            totalRevenue: number;
            totalLaborValue: number;
            jobs: Array<{ id: string; title: string; revenue: number; laborValue: number; completedAt: Date | null }>;
        }>();

        for (const job of jobs) {
            if (!job.tech) continue;
            const techId = job.tech.id;
            const techName = [job.tech.firstName, job.tech.lastName].filter(Boolean).join(' ') || job.tech.email;

            if (!techMap.has(techId)) {
                techMap.set(techId, {
                    tech: { id: techId, name: techName, email: job.tech.email },
                    jobCount: 0,
                    totalRevenue: 0,
                    totalLaborValue: 0,
                    jobs: [],
                });
            }

            const revenue = job.invoice ? Number(job.invoice.total) : 0;
            const laborValue = job.lineItems
                .filter((li) => li.type === 'LABOR')
                .reduce((sum, li) => sum + Number(li.total), 0);

            const record = techMap.get(techId)!;
            record.jobCount++;
            record.totalRevenue += revenue;
            record.totalLaborValue += laborValue;
            record.jobs.push({
                id: job.id,
                title: job.title,
                revenue,
                laborValue,
                completedAt: job.actualEnd,
            });
        }

        return {
            range: { from, to },
            technicians: Array.from(techMap.values()),
            totals: {
                jobs: jobs.length,
                revenue: Array.from(techMap.values()).reduce((s, t) => s + t.totalRevenue, 0),
                laborValue: Array.from(techMap.values()).reduce((s, t) => s + t.totalLaborValue, 0),
            },
        };
    },
};
