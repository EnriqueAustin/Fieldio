import { prisma } from '@fieldio/database';

const startOf = (offsetDays = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offsetDays);
    return d;
};

export const kpiService = {
    /** Owner-view KPI snapshot. Accepts either a `days` preset or an explicit from/to range. */
    snapshot: async (
        companyId: string,
        opts: number | { days?: number; from?: Date; to?: Date } = 30
    ) => {
        const cfg = typeof opts === 'number' ? { days: opts } : opts;
        const days = cfg.days ?? 30;
        const to = cfg.to ?? new Date();
        const since = cfg.from ?? startOf(days);
        // Equal-length immediately-preceding window for vs-previous comparisons.
        const spanMs = Math.max(to.getTime() - since.getTime(), 86_400_000);
        const prevSince = new Date(since.getTime() - spanMs);

        const [thisRevenue, prevRevenue] = await Promise.all([
            prisma.invoice.aggregate({
                _sum: { total: true },
                _count: true,
                where: { companyId, deletedAt: null, createdAt: { gte: since, lte: to }, status: { in: ['SENT', 'PAID', 'PARTIAL', 'OVERDUE'] } },
            }),
            prisma.invoice.aggregate({
                _sum: { total: true },
                _count: true,
                where: { companyId, deletedAt: null, createdAt: { gte: prevSince, lt: since }, status: { in: ['SENT', 'PAID', 'PARTIAL', 'OVERDUE'] } },
            }),
        ]);

        const [estSent, estApproved, prevEstSent, prevEstApproved] = await Promise.all([
            prisma.estimate.count({ where: { companyId, createdAt: { gte: since, lte: to }, status: { in: ['SENT', 'APPROVED', 'DECLINED'] } } }),
            prisma.estimate.count({ where: { companyId, createdAt: { gte: since, lte: to }, status: 'APPROVED' } }),
            prisma.estimate.count({ where: { companyId, createdAt: { gte: prevSince, lt: since }, status: { in: ['SENT', 'APPROVED', 'DECLINED'] } } }),
            prisma.estimate.count({ where: { companyId, createdAt: { gte: prevSince, lt: since }, status: 'APPROVED' } }),
        ]);

        const [jobsCompleted, prevJobsCompleted] = await Promise.all([
            prisma.job.count({ where: { companyId, deletedAt: null, status: 'COMPLETED', actualEnd: { gte: since, lte: to } } }),
            prisma.job.count({ where: { companyId, deletedAt: null, status: 'COMPLETED', actualEnd: { gte: prevSince, lt: since } } }),
        ]);

        const arBuckets = await prisma.invoice.findMany({
            where: { companyId, deletedAt: null, balance: { gt: 0 }, status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } },
            select: { balance: true, dueDate: true },
        });
        const now = Date.now();
        let arOpen = 0, ar30 = 0, ar60 = 0, ar90 = 0;
        for (const inv of arBuckets) {
            const bal = Number(inv.balance);
            arOpen += bal;
            if (!inv.dueDate) continue;
            const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86_400_000);
            if (days > 90) ar90 += bal;
            else if (days > 60) ar60 += bal;
            else if (days > 30) ar30 += bal;
        }

        const membersActive = await prisma.membership.count({ where: { companyId, status: 'ACTIVE' } });
        const membersChurned = await prisma.membership.count({
            where: { companyId, canceledAt: { gte: since, lte: to } },
        });

        const pctChange = (curr: number, prev: number) => (prev > 0 ? (curr - prev) / prev : 0);

        const totalRevenue = Number(thisRevenue._sum.total ?? 0);
        const invoiceCount = thisRevenue._count;
        const avgTicket = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;
        const closeRate = estSent > 0 ? estApproved / estSent : 0;
        const revenueChange = pctChange(totalRevenue, Number(prevRevenue._sum.total ?? 0));

        const prevInvoiceCount = prevRevenue._count;
        const prevAvgTicket = prevInvoiceCount > 0 ? Number(prevRevenue._sum.total ?? 0) / prevInvoiceCount : 0;
        const prevCloseRate = prevEstSent > 0 ? prevEstApproved / prevEstSent : 0;
        const avgTicketChange = pctChange(avgTicket, prevAvgTicket);
        const closeRateChange = pctChange(closeRate, prevCloseRate);
        const jobsCompletedChange = pctChange(jobsCompleted, prevJobsCompleted);

        // Sales by tech (top 5)
        const salesByTech = await prisma.$queryRaw<Array<{ techId: string; name: string; revenue: number; jobs: bigint }>>`
            SELECT j."techId" as "techId",
                   COALESCE(u."firstName" || ' ' || u."lastName", u.email) as name,
                   COALESCE(SUM(i.total), 0)::float as revenue,
                   COUNT(j.id) as jobs
            FROM "Job" j
            JOIN "User" u ON u.id = j."techId"
            LEFT JOIN "Invoice" i ON i."jobId" = j.id AND i.status IN ('PAID', 'PARTIAL', 'SENT', 'OVERDUE')
            WHERE j."companyId" = ${companyId}
              AND j."deletedAt" IS NULL
              AND j."actualEnd" >= ${since}
              AND j."actualEnd" <= ${to}
              AND j."techId" IS NOT NULL
            GROUP BY j."techId", u."firstName", u."lastName", u.email
            ORDER BY revenue DESC
            LIMIT 5
        `;

        // Capture snapshot for historical comparison
        await prisma.kpiSnapshot.create({
            data: {
                companyId,
                periodStart: since,
                periodEnd: to,
                revenue: totalRevenue,
                invoicesCount: invoiceCount,
                avgTicket,
                closeRate,
                arOpenTotal: arOpen,
                arOver30: ar30,
                arOver60: ar60,
                arOver90: ar90,
                membersActive,
                membersChurned,
                jobsCompleted,
            },
        }).catch(() => undefined);

        return {
            periodDays: days,
            range: { from: since, to },
            revenue: totalRevenue,
            revenueChange,
            invoices: invoiceCount,
            avgTicket,
            avgTicketChange,
            closeRate,
            closeRateChange,
            estimatesSent: estSent,
            estimatesApproved: estApproved,
            jobsCompleted,
            jobsCompletedChange,
            ar: { open: arOpen, over30: ar30, over60: ar60, over90: ar90 },
            members: { active: membersActive, churned: membersChurned },
            topTechs: salesByTech.map((t) => ({ ...t, jobs: Number(t.jobs) })),
        };
    },

    history: (companyId: string, limit = 30) =>
        prisma.kpiSnapshot.findMany({
            where: { companyId },
            orderBy: { capturedAt: 'desc' },
            take: limit,
        }),
};
