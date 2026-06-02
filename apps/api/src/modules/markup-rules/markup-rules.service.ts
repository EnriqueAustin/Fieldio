import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createRuleSchema = z.object({
    category: z.string().min(1),
    markupType: z.enum(['PERCENTAGE', 'FLAT']).default('PERCENTAGE'),
    markupValue: z.number().min(0),
});

const updateRuleSchema = createRuleSchema.partial().extend({
    active: z.boolean().optional(),
});

export const markupRuleService = {
    getAll: async (companyId: string) => {
        return prisma.markupRule.findMany({
            where: { companyId },
            orderBy: { category: 'asc' },
        });
    },

    upsert: async (companyId: string, input: z.infer<typeof createRuleSchema>) => {
        const parsed = createRuleSchema.parse(input);
        return prisma.markupRule.upsert({
            where: { companyId_category: { companyId, category: parsed.category } },
            create: { companyId, ...parsed },
            update: { markupType: parsed.markupType, markupValue: parsed.markupValue },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateRuleSchema>) => {
        const parsed = updateRuleSchema.parse(input);
        const rule = await prisma.markupRule.findFirst({ where: { id, companyId } });
        if (!rule) throw new AppError('Markup rule not found', StatusCodes.NOT_FOUND);
        return prisma.markupRule.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const rule = await prisma.markupRule.findFirst({ where: { id, companyId } });
        if (!rule) throw new AppError('Markup rule not found', StatusCodes.NOT_FOUND);
        await prisma.markupRule.delete({ where: { id } });
        return { deleted: true };
    },

    applyMarkup: async (companyId: string, category: string, baseCost: number) => {
        const rule = await prisma.markupRule.findFirst({
            where: { companyId, category, active: true },
        });
        if (!rule) return { baseCost, markup: 0, finalPrice: baseCost };

        const markup = rule.markupType === 'PERCENTAGE'
            ? baseCost * (rule.markupValue / 100)
            : rule.markupValue;

        return {
            baseCost,
            markup: Math.round(markup * 100) / 100,
            finalPrice: Math.round((baseCost + markup) * 100) / 100,
            rule: { category: rule.category, type: rule.markupType, value: rule.markupValue },
        };
    },
};
