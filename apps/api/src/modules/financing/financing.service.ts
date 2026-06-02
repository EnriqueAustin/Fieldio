import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createOptionSchema = z.object({
    name: z.string().min(1),
    provider: z.string().optional(),
    termMonths: z.number().int().min(1),
    interestRate: z.number().min(0).default(0),
    minAmount: z.number().min(0).default(0),
    maxAmount: z.number().optional(),
});

const updateOptionSchema = createOptionSchema.partial().extend({
    active: z.boolean().optional(),
});

const createApplicationSchema = z.object({
    customerId: z.string().uuid(),
    estimateId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    financingOptionId: z.string().uuid(),
    amount: z.number().min(0),
    notes: z.string().optional(),
});

const updateApplicationSchema = z.object({
    status: z.enum(['OFFERED', 'APPLIED', 'APPROVED', 'DECLINED', 'ACTIVE', 'PAID_OFF', 'DEFAULTED']).optional(),
    monthlyPayment: z.number().min(0).optional(),
    providerRef: z.string().optional(),
    notes: z.string().optional(),
});

export const financingService = {
    // --- Options ---
    getOptions: async (companyId: string, includeInactive = false) => {
        const where: any = { companyId };
        if (!includeInactive) where.active = true;
        return prisma.financingOption.findMany({
            where,
            orderBy: { termMonths: 'asc' },
        });
    },

    createOption: async (companyId: string, input: z.infer<typeof createOptionSchema>) => {
        const parsed = createOptionSchema.parse(input);
        return prisma.financingOption.create({ data: { companyId, ...parsed } });
    },

    updateOption: async (id: string, companyId: string, input: z.infer<typeof updateOptionSchema>) => {
        const parsed = updateOptionSchema.parse(input);
        const option = await prisma.financingOption.findFirst({ where: { id, companyId } });
        if (!option) throw new AppError('Financing option not found', StatusCodes.NOT_FOUND);
        return prisma.financingOption.update({ where: { id }, data: parsed });
    },

    // --- Applications ---
    getApplications: async (companyId: string, status?: string, customerId?: string) => {
        const where: any = { companyId };
        if (status) where.status = status;
        if (customerId) where.customerId = customerId;
        return prisma.financingApplication.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { id: true, name: true, email: true } },
                financingOption: { select: { id: true, name: true, termMonths: true, interestRate: true } },
            },
        });
    },

    getApplication: async (id: string, companyId: string) => {
        const app = await prisma.financingApplication.findFirst({
            where: { id, companyId },
            include: { customer: true, financingOption: true },
        });
        if (!app) throw new AppError('Financing application not found', StatusCodes.NOT_FOUND);
        return app;
    },

    createApplication: async (companyId: string, input: z.infer<typeof createApplicationSchema>) => {
        const parsed = createApplicationSchema.parse(input);

        const option = await prisma.financingOption.findFirst({
            where: { id: parsed.financingOptionId, companyId, active: true },
        });
        if (!option) throw new AppError('Financing option not found or inactive', StatusCodes.BAD_REQUEST);

        if (option.minAmount && parsed.amount < Number(option.minAmount)) {
            throw new AppError(`Minimum financing amount is ${option.minAmount}`, StatusCodes.BAD_REQUEST);
        }
        if (option.maxAmount && parsed.amount > Number(option.maxAmount)) {
            throw new AppError(`Maximum financing amount is ${option.maxAmount}`, StatusCodes.BAD_REQUEST);
        }

        const monthlyPayment = option.interestRate > 0
            ? (parsed.amount * (option.interestRate / 100 / 12) * Math.pow(1 + option.interestRate / 100 / 12, option.termMonths))
              / (Math.pow(1 + option.interestRate / 100 / 12, option.termMonths) - 1)
            : parsed.amount / option.termMonths;

        return prisma.financingApplication.create({
            data: {
                companyId,
                ...parsed,
                monthlyPayment: Math.round(monthlyPayment * 100) / 100,
            },
            include: { customer: true, financingOption: true },
        });
    },

    updateApplication: async (id: string, companyId: string, input: z.infer<typeof updateApplicationSchema>) => {
        const parsed = updateApplicationSchema.parse(input);
        const app = await prisma.financingApplication.findFirst({ where: { id, companyId } });
        if (!app) throw new AppError('Financing application not found', StatusCodes.NOT_FOUND);

        const data: any = { ...parsed };
        if (parsed.status === 'APPROVED') data.approvedAt = new Date();

        return prisma.financingApplication.update({ where: { id }, data });
    },

    getByEstimate: async (estimateId: string, companyId: string) => {
        return prisma.financingApplication.findMany({
            where: { estimateId, companyId },
            include: { financingOption: true },
        });
    },
};
