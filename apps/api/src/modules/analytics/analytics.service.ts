import { prisma } from '@fieldio/database';

export const analyticsService = {
    getDashboardStats: async (
        companyId: string,
        range?: {
            from?: Date;
            to?: Date;
        }
    ) => {
        const now = new Date();
        const from = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const to = range?.to ?? now;

        const invoiceRangeWhere = {
            companyId,
            createdAt: { gte: from, lte: to },
        };

        // 1. Revenue Stats
        const totalRevenue = await prisma.invoice.aggregate({
            where: invoiceRangeWhere,
            _sum: { total: true }
        });

        const outstandingRevenue = await prisma.invoice.aggregate({
            where: { companyId, status: { not: 'PAID' } },
            _sum: { balance: true }
        });

        // 2. Job Stats
        const jobsCount = await prisma.job.groupBy({
            by: ['status'],
            where: {
                companyId,
                createdAt: { gte: from, lte: to },
            },
            _count: { id: true }
        });

        const totalJobs = jobsCount.reduce((acc, curr) => acc + curr._count.id, 0);
        const completedJobs = jobsCount.find(j => j.status === 'COMPLETED')?._count.id || 0;
        const activeJobs = totalJobs - completedJobs;

        // 3. Customer Count
        const totalCustomers = await prisma.customer.count({ where: { companyId } });

        // 4. Recent Activity (Latest 5 Jobs)
        const recentJobs = await prisma.job.findMany({
            where: { companyId },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: { customer: true, tech: true }
        });

        // 5. Tech Status (Who is working right now?)
        const activeTechs = await prisma.job.findMany({
            where: {
                companyId,
                status: { in: ['EN_ROUTE', 'ON_SITE'] }
            },
            select: { tech: true, status: true, id: true, title: true }
        });

        const [estimateStats, overdueInvoices, totalTechnicians, utilizedTechnicians] = await Promise.all([
            prisma.estimate.groupBy({
                by: ['status'],
                where: {
                    companyId,
                    createdAt: { gte: from, lte: to },
                },
                _count: { id: true },
            }),
            prisma.invoice.count({
                where: {
                    companyId,
                    status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: now },
                },
            }),
            prisma.user.count({
                where: {
                    companyId,
                    role: 'TECHNICIAN',
                    status: 'ACTIVE',
                },
            }),
            prisma.job.findMany({
                where: {
                    companyId,
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
                outstanding: outstandingRevenue._sum.balance || 0
            },
            jobs: {
                total: totalJobs,
                completed: completedJobs,
                active: activeJobs,
                breakdown: jobsCount
            },
            customers: {
                total: totalCustomers
            },
            estimates: {
                sent: sentEstimates,
                approved: approvedEstimates,
                conversionRate,
            },
            technicians: {
                total: totalTechnicians,
                active: activeTechs.length,
                utilizationRate,
            },
            invoices: {
                overdue: overdueInvoices,
            },
            recentJobs,
            activeTechs
        };
    }
};
