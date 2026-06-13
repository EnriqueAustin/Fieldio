import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const lineItemSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    quantity: z.number(),
    unitPrice: z.number(),
    type: z.enum(['SERVICE', 'MATERIAL', 'LABOR']).default('SERVICE'),
});

export const createTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    defaultDurationMin: z.number().int().optional(),
    defaultPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).default('MEDIUM'),
    requiredSkills: z.array(z.string()).default([]),
    defaultLineItems: z.array(lineItemSchema).default([]),
    defaultChecklist: z.array(z.object({ label: z.string() })).default([]),
    defaultDescription: z.string().optional(),
});

export const jobTemplatesService = {
    list: (companyId: string) =>
        prisma.jobTemplate.findMany({
            where: { companyId, active: true },
            orderBy: { name: 'asc' },
        }),

    get: (id: string, companyId: string) =>
        prisma.jobTemplate.findFirst({ where: { id, companyId } }),

    create: (companyId: string, input: z.infer<typeof createTemplateSchema>) =>
        prisma.jobTemplate.create({
            data: {
                companyId,
                name: input.name,
                description: input.description,
                defaultDurationMin: input.defaultDurationMin,
                defaultPriority: input.defaultPriority,
                requiredSkills: input.requiredSkills,
                defaultLineItems: input.defaultLineItems as any,
                defaultChecklist: input.defaultChecklist as any,
                defaultDescription: input.defaultDescription,
            },
        }),

    update: async (id: string, companyId: string, input: Partial<z.infer<typeof createTemplateSchema>>) => {
        const existing = await prisma.jobTemplate.findFirst({ where: { id, companyId } });
        if (!existing) throw new AppError('Template not found', StatusCodes.NOT_FOUND);
        return prisma.jobTemplate.update({
            where: { id },
            data: {
                ...input,
                defaultLineItems: input.defaultLineItems as any,
                defaultChecklist: input.defaultChecklist as any,
            },
        });
    },

    deactivate: async (id: string, companyId: string) => {
        await prisma.jobTemplate.updateMany({ where: { id, companyId }, data: { active: false } });
    },

    /**
     * One-click create a job from a template. Snapshots line items + checklist.
     */
    applyToNewJob: async (
        templateId: string,
        companyId: string,
        opts: {
            customerId: string;
            propertyId: string;
            scheduledStart?: Date | string;
            scheduledEnd?: Date | string;
            techId?: string | null;
            vanId?: string | null;
            titleOverride?: string;
        }
    ) => {
        const template = await prisma.jobTemplate.findFirst({ where: { id: templateId, companyId } });
        if (!template) throw new AppError('Template not found', StatusCodes.NOT_FOUND);

        const lineItems = (template.defaultLineItems as any[]) ?? [];
        const checklist = (template.defaultChecklist as any[]) ?? [];

        const start = opts.scheduledStart ? new Date(opts.scheduledStart) : undefined;
        let end = opts.scheduledEnd ? new Date(opts.scheduledEnd) : undefined;
        if (start && !end && template.defaultDurationMin) {
            end = new Date(start.getTime() + template.defaultDurationMin * 60_000);
        }

        return prisma.job.create({
            data: {
                companyId,
                templateId,
                customerId: opts.customerId,
                propertyId: opts.propertyId,
                title: opts.titleOverride ?? template.name,
                description: template.defaultDescription ?? template.description ?? undefined,
                priority: template.defaultPriority,
                requiredSkills: template.requiredSkills,
                scheduledStart: start,
                scheduledEnd: end,
                techId: opts.techId ?? undefined,
                vanId: opts.vanId ?? undefined,
                status: opts.techId ? 'ASSIGNED' : 'REQUESTED',
                lineItems: lineItems.length
                    ? {
                          create: lineItems.map((li) => ({
                              name: li.name,
                              description: li.description,
                              quantity: li.quantity,
                              unitPrice: li.unitPrice,
                              total: li.quantity * li.unitPrice,
                              type: li.type ?? 'SERVICE',
                          })),
                      }
                    : undefined,
                checklist: checklist.length
                    ? { create: checklist.map((c) => ({ label: c.label })) }
                    : undefined,
            },
            include: { lineItems: true, checklist: true, customer: true, property: true },
        });
    },
};
