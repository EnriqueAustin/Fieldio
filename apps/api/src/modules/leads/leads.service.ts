import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;
type Stage = (typeof STAGES)[number];

// A lead is a Customer row with status LEAD. Creating/editing a lead therefore
// writes the customer, and converting one promotes the same row to ACTIVE.
const leadInclude = { leadSource: { select: { id: true, name: true } } } as const;

const createLeadSchema = z.object({
    name: z.string().min(1),
    phone: z.string().trim().min(1).optional().nullable(),
    email: z.string().trim().email().optional().nullable().or(z.literal('')),
    leadValue: z.number().min(0).optional().nullable(),
    leadSourceId: z.string().optional().nullable(),
    leadStage: z.enum(STAGES).optional(),
    notes: z.string().optional().nullable(),
});

const updateLeadSchema = z.object({
    name: z.string().min(1).optional(),
    phone: z.string().trim().optional().nullable(),
    email: z.string().trim().email().optional().nullable().or(z.literal('')),
    leadValue: z.number().min(0).optional().nullable(),
    leadSourceId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
});

const noteSchema = z.object({
    type: z
        .enum(['NOTE', 'CALL_INBOUND', 'CALL_OUTBOUND', 'EMAIL_SENT', 'EMAIL_RECEIVED', 'SMS_SENT', 'MEETING'])
        .default('NOTE'),
    body: z.string().min(1),
});

const sourceSchema = z.object({
    name: z.string().min(1).optional(),
    costPerMonth: z.number().min(0).optional(),
});

const convertSchema = z.object({
    target: z.enum(['QUOTE', 'JOB']),
    title: z.string().optional(),
    total: z.number().min(0).optional(),
    address: z
        .object({
            line1: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zip: z.string().optional(),
        })
        .optional(),
});

const emptyToNull = (v: string | null | undefined) => (v === '' ? null : v ?? null);

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

    get: async (id: string, companyId: string) => {
        const lead = await prisma.customer.findFirst({
            where: { id, companyId, deletedAt: null },
            include: leadInclude,
        });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);
        return lead;
    },

    create: async (companyId: string, input: unknown) => {
        const parsed = createLeadSchema.parse(input);
        if (parsed.leadSourceId) {
            const source = await prisma.leadSource.findFirst({ where: { id: parsed.leadSourceId, companyId } });
            if (!source) throw new AppError('Lead source not found', StatusCodes.BAD_REQUEST);
        }
        return prisma.customer.create({
            data: {
                companyId,
                name: parsed.name,
                phone: emptyToNull(parsed.phone),
                email: emptyToNull(parsed.email),
                notes: emptyToNull(parsed.notes),
                leadValue: parsed.leadValue ?? null,
                leadSourceId: parsed.leadSourceId || null,
                leadStage: parsed.leadStage ?? 'NEW',
                status: 'LEAD',
            },
            include: leadInclude,
        });
    },

    update: async (id: string, companyId: string, input: unknown) => {
        const parsed = updateLeadSchema.parse(input);
        const lead = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);
        if (parsed.leadSourceId) {
            const source = await prisma.leadSource.findFirst({ where: { id: parsed.leadSourceId, companyId } });
            if (!source) throw new AppError('Lead source not found', StatusCodes.BAD_REQUEST);
        }
        const data: any = {};
        if (parsed.name !== undefined) data.name = parsed.name;
        if (parsed.phone !== undefined) data.phone = emptyToNull(parsed.phone);
        if (parsed.email !== undefined) data.email = emptyToNull(parsed.email);
        if (parsed.notes !== undefined) data.notes = emptyToNull(parsed.notes);
        if (parsed.leadValue !== undefined) data.leadValue = parsed.leadValue;
        if (parsed.leadSourceId !== undefined) data.leadSourceId = parsed.leadSourceId || null;
        await prisma.customer.update({ where: { id }, data });
        return prisma.customer.findFirst({ where: { id, companyId }, include: leadInclude });
    },

    // Contact log. Leads are customers, so entries live on the shared CustomerNote
    // model (same pattern as customerNoteService), scoped by companyId + lead id.
    listNotes: async (id: string, companyId: string) => {
        const lead = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);
        return prisma.customerNote.findMany({
            where: { customerId: id, companyId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });
    },

    addNote: async (id: string, companyId: string, userId: string, input: unknown) => {
        const parsed = noteSchema.parse(input);
        const lead = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);
        return prisma.customerNote.create({
            data: { companyId, userId, customerId: id, type: parsed.type, body: parsed.body },
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        });
    },

    // Convert a lead into a quote or a job. The lead already IS the customer, so
    // conversion promotes that row to ACTIVE/WON and attaches the new record;
    // name/phone/email ride along on the customer, address becomes the property.
    // Office-only (quoting is an office function) — enforced at the route.
    convert: async (id: string, companyId: string, userId: string, input: unknown) => {
        const parsed = convertSchema.parse(input);
        const lead = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!lead) throw new AppError('Lead not found', StatusCodes.NOT_FOUND);

        const result: { estimateId?: string; jobId?: string } = {};

        if (parsed.target === 'QUOTE') {
            // A starter DRAFT quote the office then fills in on the estimates page.
            const total = parsed.total ?? Number(lead.leadValue ?? 0);
            const estimate = await prisma.estimate.create({
                data: { companyId, customerId: lead.id, items: [], total, status: 'DRAFT' },
            });
            result.estimateId = estimate.id;
        } else {
            let property = await prisma.property.findFirst({ where: { companyId, customerId: lead.id } });
            if (!property) {
                const a = parsed.address ?? {};
                property = await prisma.property.create({
                    data: {
                        companyId,
                        customerId: lead.id,
                        addressLine1: a.line1 || lead.billingAddress || 'Address to be confirmed',
                        city: a.city || '',
                        state: a.state || '',
                        zip: a.zip || '',
                    },
                });
            }
            const job = await prisma.job.create({
                data: {
                    companyId,
                    customerId: lead.id,
                    propertyId: property.id,
                    title: parsed.title || `New job for ${lead.name}`,
                    status: 'REQUESTED',
                    priority: 'MEDIUM',
                },
            });
            result.jobId = job.id;
        }

        await prisma.auditLog.create({
            data: {
                companyId,
                userId,
                action: parsed.target === 'QUOTE' ? 'LEAD_CONVERTED_QUOTE' : 'LEAD_CONVERTED_JOB',
                entityId: id,
                entityType: 'CUSTOMER',
                metadata: result,
            },
        });

        const updated = await prisma.customer.update({
            where: { id },
            data: { leadStage: 'WON', wonAt: new Date(), status: 'ACTIVE' },
            include: leadInclude,
        });
        return { lead: updated, ...result };
    },

    setStage: async (id: string, companyId: string, stage: Stage, payload: { lostReason?: string } = {}) => {
        if (!STAGES.includes(stage)) throw new AppError('Invalid stage', StatusCodes.BAD_REQUEST);
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

    updateSource: async (companyId: string, id: string, input: unknown) => {
        const parsed = sourceSchema.parse(input);
        const source = await prisma.leadSource.findFirst({ where: { id, companyId } });
        if (!source) throw new AppError('Lead source not found', StatusCodes.NOT_FOUND);
        const data: any = {};
        if (parsed.name !== undefined) data.name = parsed.name;
        if (parsed.costPerMonth !== undefined) data.costPerMonth = parsed.costPerMonth;
        return prisma.leadSource.update({ where: { id }, data });
    },

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
