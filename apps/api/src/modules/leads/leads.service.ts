import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;
type Stage = (typeof STAGES)[number];

export const leadsService = {
    /** Pipeline grouped by stage. */
    pipeline: async (companyId: string) => {
        const customers = await prisma.customer.findMany({
            where: { companyId, status: 'LEAD', deletedAt: null },
            include: { leadSource: true },
            orderBy: { updatedAt: 'desc' },
        });
        const byStage: Record<Stage, typeof customers> = {
            NEW: [], CONTACTED: [], QUALIFIED: [], PROPOSAL: [], WON: [], LOST: [],
        };
        for (const c of customers) byStage[c.leadStage].push(c);
        return { stages: STAGES, byStage };
    },

    setStage: async (id: string, companyId: string, stage: Stage, payload: { lostReason?: string } = {}) => {
        const lead = await prisma.customer.findFirst({ where: { id, companyId } });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);
        const data: any = { leadStage: stage };
        if (stage === 'WON') {
            data.wonAt = new Date();
            data.status = 'ACTIVE';
        }
        if (stage === 'LOST') {
            data.lostAt = new Date();
            data.lostReason = payload.lostReason ?? null;
            data.status = 'ARCHIVED';
        }
        return prisma.customer.update({ where: { id }, data });
    },

    listSources: (companyId: string) =>
        prisma.leadSource.findMany({ where: { companyId, active: true }, orderBy: { name: 'asc' } }),

    createSource: (companyId: string, data: { name: string; costPerMonth?: number }) =>
        prisma.leadSource.create({ data: { companyId, name: data.name, costPerMonth: data.costPerMonth ?? 0 } }),

    deactivateSource: (companyId: string, id: string) =>
        prisma.leadSource.updateMany({ where: { companyId, id }, data: { active: false } }),

    /** Conversion funnel + ROI per source. */
    funnel: async (companyId: string, days = 90) => {
        const since = new Date();
        since.setDate(since.getDate() - days);

        const grouped = await prisma.customer.groupBy({
            by: ['leadStage'],
            where: { companyId, createdAt: { gte: since }, deletedAt: null },
            _count: true,
        });
        const stageCounts: Record<string, number> = {};
        for (const g of grouped) stageCounts[g.leadStage] = g._count;

        const sources = await prisma.leadSource.findMany({ where: { companyId } });
        const roi = await Promise.all(
            sources.map(async (s) => {
                const leadIds = (
                    await prisma.customer.findMany({
                        where: { companyId, leadSourceId: s.id, createdAt: { gte: since } },
                        select: { id: true },
                    })
                ).map((r) => r.id);
                if (leadIds.length === 0)
                    return { source: s.name, sourceId: s.id, leads: 0, won: 0, revenue: 0, costPerMonth: Number(s.costPerMonth), roi: 0 };

                const won = await prisma.customer.count({
                    where: { id: { in: leadIds }, leadStage: 'WON' },
                });
                const revenueAgg = await prisma.invoice.aggregate({
                    _sum: { total: true },
                    where: {
                        companyId,
                        job: { customerId: { in: leadIds } },
                        status: { in: ['PAID', 'PARTIAL', 'SENT', 'OVERDUE'] },
                    },
                });
                const revenue = Number(revenueAgg._sum.total ?? 0);
                const monthsCovered = Math.max(1, days / 30);
                const spend = Number(s.costPerMonth) * monthsCovered;
                const roi = spend > 0 ? (revenue - spend) / spend : 0;
                return { source: s.name, sourceId: s.id, leads: leadIds.length, won, revenue, costPerMonth: Number(s.costPerMonth), roi };
            })
        );

        return { funnel: stageCounts, sources: roi, periodDays: days };
    },
};
