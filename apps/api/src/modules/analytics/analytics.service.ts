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

    getTechScorecards: async (companyId: string, range?: { from?: Date; to?: Date }) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const technicians = await prisma.user.findMany({
            where: { companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true, email: true },
        });

        const scorecards = [];

        for (const tech of technicians) {
            const [completedJobs, allAssigned, estimates, callbacks, timeEntries] = await Promise.all([
                prisma.job.findMany({
                    where: { companyId, techId: tech.id, status: 'COMPLETED', deletedAt: null, actualEnd: { gte: from, lte: to } },
                    include: {
                        invoice: { select: { total: true, status: true } },
                        lineItems: true,
                    },
                }),
                prisma.job.count({
                    where: { companyId, techId: tech.id, deletedAt: null, createdAt: { gte: from, lte: to } },
                }),
                prisma.estimate.findMany({
                    where: { companyId, createdAt: { gte: from, lte: to }, job: { techId: tech.id } },
                    select: { status: true, total: true },
                }),
                prisma.job.count({
                    where: {
                        companyId, techId: tech.id, deletedAt: null,
                        createdAt: { gte: from, lte: to },
                        description: { contains: 'callback', mode: 'insensitive' },
                    },
                }),
                prisma.timeEntry.findMany({
                    where: { companyId, userId: tech.id, startTime: { gte: from, lte: to }, endTime: { not: null } },
                }),
            ]);

            const revenue = completedJobs.reduce((sum, j) => sum + (j.invoice ? Number(j.invoice.total) : 0), 0);
            const avgTicket = completedJobs.length > 0 ? revenue / completedJobs.length : 0;

            const sentEstimates = estimates.filter((e) => ['SENT', 'APPROVED', 'DECLINED'].includes(e.status));
            const approvedEstimates = estimates.filter((e) => e.status === 'APPROVED');
            const conversionRate = sentEstimates.length > 0
                ? Math.round((approvedEstimates.length / sentEstimates.length) * 100) : 0;

            const callbackRate = completedJobs.length > 0
                ? Math.round((callbacks / completedJobs.length) * 100) : 0;

            const onTimeJobs = completedJobs.filter((j) => {
                if (!j.scheduledStart || !j.actualStart) return false;
                const diff = (j.actualStart.getTime() - j.scheduledStart.getTime()) / 60000;
                return diff <= 15;
            });
            const onTimeRate = completedJobs.length > 0
                ? Math.round((onTimeJobs.length / completedJobs.length) * 100) : 0;

            const totalWrenchMinutes = timeEntries
                .filter((t) => t.type === 'WRENCH')
                .reduce((sum, t) => sum + (t.duration ?? 0), 0) / 60;
            const totalTravelMinutes = timeEntries
                .filter((t) => t.type === 'TRAVEL')
                .reduce((sum, t) => sum + (t.duration ?? 0), 0) / 60;
            const totalHours = timeEntries
                .reduce((sum, t) => sum + (t.duration ?? 0), 0) / 3600;

            scorecards.push({
                tech: {
                    id: tech.id,
                    name: [tech.firstName, tech.lastName].filter(Boolean).join(' ') || tech.email,
                },
                jobsCompleted: completedJobs.length,
                jobsAssigned: allAssigned,
                revenue: Math.round(revenue * 100) / 100,
                avgTicketSize: Math.round(avgTicket * 100) / 100,
                estimateConversionRate: conversionRate,
                callbackRate,
                onTimeArrivalRate: onTimeRate,
                totalHoursWorked: Math.round(totalHours * 100) / 100,
                wrenchTimeMinutes: Math.round(totalWrenchMinutes),
                travelTimeMinutes: Math.round(totalTravelMinutes),
                efficiency: totalHours > 0 ? Math.round((totalWrenchMinutes / 60 / totalHours) * 100) : 0,
            });
        }

        return { range: { from, to }, scorecards };
    },

    getRevenueByServiceType: async (companyId: string, range?: { from?: Date; to?: Date }) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const jobs = await prisma.job.findMany({
            where: { companyId, deletedAt: null, status: 'COMPLETED', actualEnd: { gte: from, lte: to } },
            include: {
                lineItems: true,
                invoice: { select: { total: true } },
            },
        });

        const byCategory = new Map<string, { revenue: number; jobCount: number; avgTicket: number }>();
        for (const job of jobs) {
            for (const item of job.lineItems) {
                const cat = item.type || 'SERVICE';
                if (!byCategory.has(cat)) byCategory.set(cat, { revenue: 0, jobCount: 0, avgTicket: 0 });
                const entry = byCategory.get(cat)!;
                entry.revenue += Number(item.total);
            }
        }

        const totalRevenue = Array.from(byCategory.values()).reduce((s, e) => s + e.revenue, 0);

        return {
            range: { from, to },
            categories: Array.from(byCategory.entries()).map(([type, data]) => ({
                type,
                revenue: Math.round(data.revenue * 100) / 100,
                percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
            })),
            totalRevenue: Math.round(totalRevenue * 100) / 100,
        };
    },

    getEstimateConversionReport: async (companyId: string, range?: { from?: Date; to?: Date }) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const estimates = await prisma.estimate.findMany({
            where: { companyId, createdAt: { gte: from, lte: to } },
            include: {
                job: { select: { techId: true, tech: { select: { id: true, firstName: true, lastName: true, email: true } } } },
            },
        });

        const byEstimator = new Map<string, { name: string; total: number; approved: number; declined: number; pending: number; totalValue: number; approvedValue: number }>();

        for (const est of estimates) {
            const techId = est.job?.techId ?? 'unassigned';
            const techName = est.job?.tech
                ? [est.job.tech.firstName, est.job.tech.lastName].filter(Boolean).join(' ') || est.job.tech.email
                : 'Unassigned';

            if (!byEstimator.has(techId)) {
                byEstimator.set(techId, { name: techName, total: 0, approved: 0, declined: 0, pending: 0, totalValue: 0, approvedValue: 0 });
            }

            const entry = byEstimator.get(techId)!;
            entry.total++;
            entry.totalValue += Number(est.total);
            if (est.status === 'APPROVED') { entry.approved++; entry.approvedValue += Number(est.total); }
            else if (est.status === 'DECLINED') entry.declined++;
            else if (['DRAFT', 'SENT'].includes(est.status)) entry.pending++;
        }

        return {
            range: { from, to },
            estimators: Array.from(byEstimator.entries()).map(([id, data]) => ({
                id,
                ...data,
                closeRate: data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0,
            })),
        };
    },

    getAvgTicketTrend: async (companyId: string, months = 6) => {
        const now = new Date();
        const trends = [];

        for (let i = months - 1; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

            const invoices = await prisma.invoice.aggregate({
                where: { companyId, deletedAt: null, createdAt: { gte: monthStart, lte: monthEnd } },
                _avg: { total: true },
                _count: { id: true },
                _sum: { total: true },
            });

            trends.push({
                month: monthStart.toISOString().slice(0, 7),
                avgTicket: Math.round(Number(invoices._avg.total ?? 0) * 100) / 100,
                totalRevenue: Math.round(Number(invoices._sum.total ?? 0) * 100) / 100,
                invoiceCount: invoices._count.id,
            });
        }

        return { trends };
    },
};
