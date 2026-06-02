import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createTierSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().min(0),
    interval: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).default('MONTHLY'),
    laborDiscountPct: z.number().min(0).max(100).default(0),
    materialDiscountPct: z.number().min(0).max(100).default(0),
    priorityBooking: z.boolean().default(false),
    includedVisits: z.number().int().min(0).default(0),
    benefits: z.array(z.string()).optional(),
    sortOrder: z.number().int().default(0),
});

const updateTierSchema = createTierSchema.partial().extend({
    active: z.boolean().optional(),
});

const createMembershipSchema = z.object({
    customerId: z.string().uuid(),
    tierId: z.string().uuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    autoRenew: z.boolean().default(true),
    notes: z.string().optional(),
});

export const membershipService = {
    // --- Tiers ---
    getTiers: async (companyId: string, includeInactive = false) => {
        const where: any = { companyId };
        if (!includeInactive) where.active = true;
        return prisma.membershipTier.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { memberships: true } } },
        });
    },

    getTier: async (id: string, companyId: string) => {
        const tier = await prisma.membershipTier.findFirst({ where: { id, companyId } });
        if (!tier) throw new AppError('Membership tier not found', StatusCodes.NOT_FOUND);
        return tier;
    },

    createTier: async (companyId: string, input: z.infer<typeof createTierSchema>) => {
        const parsed = createTierSchema.parse(input);
        return prisma.membershipTier.create({
            data: { companyId, ...parsed, benefits: parsed.benefits ?? [] },
        });
    },

    updateTier: async (id: string, companyId: string, input: z.infer<typeof updateTierSchema>) => {
        const parsed = updateTierSchema.parse(input);
        const tier = await prisma.membershipTier.findFirst({ where: { id, companyId } });
        if (!tier) throw new AppError('Membership tier not found', StatusCodes.NOT_FOUND);
        return prisma.membershipTier.update({ where: { id }, data: parsed });
    },

    // --- Memberships ---
    getAll: async (companyId: string, status?: string) => {
        const where: any = { companyId };
        if (status) where.status = status;
        return prisma.membership.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { id: true, name: true, email: true, phone: true } },
                tier: { select: { id: true, name: true, price: true, interval: true, laborDiscountPct: true, materialDiscountPct: true } },
            },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const membership = await prisma.membership.findFirst({
            where: { id, companyId },
            include: {
                customer: true,
                tier: true,
            },
        });
        if (!membership) throw new AppError('Membership not found', StatusCodes.NOT_FOUND);
        return membership;
    },

    getByCustomer: async (customerId: string, companyId: string) => {
        return prisma.membership.findMany({
            where: { customerId, companyId },
            include: { tier: true },
            orderBy: { createdAt: 'desc' },
        });
    },

    create: async (companyId: string, input: z.infer<typeof createMembershipSchema>) => {
        const parsed = createMembershipSchema.parse(input);
        const tier = await prisma.membershipTier.findFirst({
            where: { id: parsed.tierId, companyId, active: true },
        });
        if (!tier) throw new AppError('Membership tier not found or inactive', StatusCodes.BAD_REQUEST);

        const intervalMonths = tier.interval === 'MONTHLY' ? 1 : tier.interval === 'QUARTERLY' ? 3 : 12;
        const nextBilling = new Date(parsed.startDate);
        nextBilling.setMonth(nextBilling.getMonth() + intervalMonths);

        return prisma.membership.create({
            data: {
                companyId,
                ...parsed,
                nextBillingDate: nextBilling,
                lastBillingDate: parsed.startDate,
            },
            include: { customer: true, tier: true },
        });
    },

    cancel: async (id: string, companyId: string, reason?: string) => {
        const membership = await prisma.membership.findFirst({ where: { id, companyId } });
        if (!membership) throw new AppError('Membership not found', StatusCodes.NOT_FOUND);
        return prisma.membership.update({
            where: { id },
            data: { status: 'CANCELED', canceledAt: new Date(), cancelReason: reason, autoRenew: false },
        });
    },

    recordVisit: async (id: string, companyId: string) => {
        const membership = await prisma.membership.findFirst({
            where: { id, companyId, status: 'ACTIVE' },
            include: { tier: true },
        });
        if (!membership) throw new AppError('Active membership not found', StatusCodes.NOT_FOUND);
        return prisma.membership.update({
            where: { id },
            data: { visitsUsed: membership.visitsUsed + 1 },
        });
    },

    getActiveDiscount: async (customerId: string, companyId: string) => {
        const membership = await prisma.membership.findFirst({
            where: { customerId, companyId, status: 'ACTIVE' },
            include: { tier: true },
        });
        if (!membership) return null;
        return {
            membershipId: membership.id,
            tierName: membership.tier.name,
            laborDiscountPct: membership.tier.laborDiscountPct,
            materialDiscountPct: membership.tier.materialDiscountPct,
            priorityBooking: membership.tier.priorityBooking,
            visitsRemaining: membership.tier.includedVisits > 0
                ? Math.max(0, membership.tier.includedVisits - membership.visitsUsed)
                : null,
        };
    },

    getDueForRenewal: async () => {
        const now = new Date();
        return prisma.membership.findMany({
            where: {
                status: 'ACTIVE',
                autoRenew: true,
                nextBillingDate: { lte: now },
            },
            include: { customer: true, tier: true, company: true },
        });
    },
};
