import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { portalService } from '../portal/portal.service';
import { notificationService } from '../../services/notifications/notification.service';
import { normalizeCompanySettings } from '../company/company-settings';

const createEstimateSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    customerId: z.string(),
    items: z.array(z.any()), // Simplified for now
    total: z.number(),
    validUntil: z.string().optional(),
});

// Field quote: a technician picks price-book items + quantities only. They never
// send (or see) prices — the server resolves the unit price from the price book
// and computes the total, consistent with the hide-pricing-from-techs rule.
const fieldEstimateSchema = z.object({
    jobId: z.string(),
    items: z.array(z.object({
        priceBookItemId: z.string().optional(),
        name: z.string().min(1),
        quantity: z.number().min(1).default(1),
        type: z.enum(['SERVICE', 'MATERIAL', 'LABOR']).default('SERVICE'),
    })).min(1),
    validUntil: z.string().optional(),
});

const approveEstimateSchema = z.object({
    signerName: z.string().min(2),
    signatureUrl: z.string().min(1),
});

const createEstimateOptionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    items: z.array(z.any()),
    total: z.number(),
});

export const estimateService = {
    create: async (companyId: string, input: z.infer<typeof createEstimateSchema>) => {
        return prisma.estimate.create({
            data: {
                companyId,
                projectId: input.projectId,
                customerId: input.customerId,
                items: input.items,
                total: input.total,
                validUntil: input.validUntil ? new Date(input.validUntil) : null,
                status: 'DRAFT',
            },
        });
    },

    // Tech-safe creation from the field. Resolves prices server-side, marks the
    // quote SENT, and auto-sends the customer an approval link (best-effort).
    createFromField: async (
        companyId: string,
        role: string | undefined,
        input: z.infer<typeof fieldEstimateSchema>
    ) => {
        const parsed = fieldEstimateSchema.parse(input);

        const job = await prisma.job.findFirst({
            where: { id: parsed.jobId, companyId, deletedAt: null },
            select: { customerId: true, projectId: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // Field quoting is a company opt-in. Technicians may only quote on site when
        // the company has enabled it; office/dispatch/admin are never gated here.
        if (role === 'TECHNICIAN') {
            const company = await prisma.company.findFirst({ where: { id: companyId } });
            const settings = normalizeCompanySettings(company?.settings);
            if (!settings.fieldQuoting.enabled) {
                throw new AppError(
                    'Field quoting is turned off for your company. Ask the office to enable it in company settings.',
                    StatusCodes.FORBIDDEN
                );
            }
        }

        // Resolve unit prices from the price book — never trust the client.
        const pbIds = parsed.items.map((i) => i.priceBookItemId).filter(Boolean) as string[];
        const pbItems = pbIds.length
            ? await prisma.priceBookItem.findMany({ where: { id: { in: pbIds }, companyId } })
            : [];
        const priceMap = new Map(pbItems.map((p) => [p.id, p]));

        let total = 0;
        const items = parsed.items.map((i) => {
            const pb = i.priceBookItemId ? priceMap.get(i.priceBookItemId) : undefined;
            const unitPrice = pb ? Number(pb.unitPrice) : 0;
            const lineTotal = unitPrice * i.quantity;
            total += lineTotal;
            return {
                name: i.name,
                quantity: i.quantity,
                unitPrice,
                total: lineTotal,
                type: i.type,
                priceBookItemId: i.priceBookItemId ?? null,
            };
        });

        const estimate = await prisma.estimate.create({
            data: {
                companyId,
                customerId: job.customerId,
                projectId: job.projectId,
                items,
                total,
                status: 'SENT',
                sentAt: new Date(),
                validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
            },
        });

        // Best-effort: hand the customer a portal link they can approve from.
        try {
            const link = await portalService.generatePortalLink(job.customerId, companyId);
            await notificationService.notifyCustomer(job.customerId, companyId, 'ESTIMATE_SENT', {
                estimateId: estimate.id,
                total,
                viewUrl: link.url,
            });
        } catch {
            /* notification is non-blocking — the quote is already saved */
        }

        // A technician must never receive pricing back in the response.
        if (role === 'TECHNICIAN') {
            return {
                id: estimate.id,
                status: estimate.status,
                createdAt: estimate.createdAt,
                itemCount: items.length,
            };
        }
        return estimate;
    },

    getAll: async (companyId: string, status?: string) => {
        const where: any = { companyId };
        if (status) where.status = status;
        return prisma.estimate.findMany({
            where,
            include: { customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    },

    // Office-side send: mark the quote SENT and hand the customer a portal link
    // they can review + e-sign from. Mirrors the auto-send done for field quotes.
    send: async (id: string, companyId: string) => {
        const estimate = await prisma.estimate.findFirst({ where: { id, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status === 'APPROVED' || estimate.status === 'DECLINED') {
            throw new AppError('Estimate can no longer be sent', StatusCodes.BAD_REQUEST);
        }

        const updated = await prisma.estimate.update({
            where: { id: estimate.id },
            data: {
                status: estimate.status === 'DRAFT' ? 'SENT' : estimate.status,
                sentAt: estimate.sentAt ?? new Date(),
            },
        });

        // Best-effort notification — the quote status change is already persisted.
        let url: string | null = null;
        try {
            const link = await portalService.generatePortalLink(estimate.customerId, companyId);
            url = link.url;
            await notificationService.notifyCustomer(estimate.customerId, companyId, 'ESTIMATE_SENT', {
                estimateId: estimate.id,
                total: Number(estimate.total),
                viewUrl: link.url,
            });
        } catch {
            /* non-blocking */
        }

        return { estimate: updated, url };
    },

    decline: async (id: string, companyId: string) => {
        const estimate = await prisma.estimate.findFirst({ where: { id, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status === 'APPROVED') {
            throw new AppError('Cannot decline an approved estimate', StatusCodes.BAD_REQUEST);
        }

        return prisma.estimate.update({
            where: { id: estimate.id },
            data: { status: 'DECLINED', declinedAt: new Date() },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const estimate = await prisma.estimate.findFirst({
            where: { id, companyId },
            include: { customer: true }
        });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        return estimate;
    },

    approveWithSignature: async (
        id: string,
        companyId: string,
        input: z.infer<typeof approveEstimateSchema>
    ) => {
        const parsed = approveEstimateSchema.parse(input);
        const estimate = await prisma.estimate.findFirst({ where: { id, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
        if (estimate.status === 'DECLINED' || estimate.status === 'EXPIRED') {
            throw new AppError('Estimate cannot be approved', StatusCodes.BAD_REQUEST);
        }

        return prisma.estimate.update({
            where: { id: estimate.id },
            data: {
                status: 'APPROVED',
                signerName: parsed.signerName,
                signatureUrl: parsed.signatureUrl,
                signedAt: new Date(),
                approvedAt: new Date(),
            },
        });
    },

    convertToJob: async (id: string, companyId: string) => {
        return prisma.$transaction(async (tx) => {
            const estimate = await tx.estimate.findFirst({
                where: { id, companyId },
                include: { customer: true } // Need property from customer? simplified: grab first property
            });

            if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);
            if (estimate.jobId) throw new AppError('Estimate already converted', StatusCodes.BAD_REQUEST);

            // Find a property for the customer (Simulated logic: pick first one)
            const property = await tx.property.findFirst({
                where: { customerId: estimate.customerId, companyId }
            });

            if (!property) throw new AppError('Customer has no property to assign job to', StatusCodes.BAD_REQUEST);

            // Create Job
            const job = await tx.job.create({
                data: {
                    companyId,
                    projectId: estimate.projectId,
                    customerId: estimate.customerId,
                    propertyId: property.id,
                    title: `Job from Estimate #${estimate.id.substring(0, 6)}`,
                    status: 'REQUESTED',
                    estimate: { connect: { id: estimate.id } }
                }
            });

            // Copy Line Items (Assuming items is array of objects)
            const items = estimate.items as any[];
            if (Array.isArray(items)) {
                await tx.jobLineItem.createMany({
                    data: items.map(item => ({
                        jobId: job.id,
                        name: item.name || 'Service',
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || 0,
                        total: (item.quantity || 1) * (item.unitPrice || 0),
                        type: item.type || 'SERVICE'
                    }))
                });
            }

            // Update Estimate Status
            await tx.estimate.update({
                where: { id: estimate.id },
                data: { status: 'APPROVED' }
            });

            return job;
        });
    },

    addOption: async (estimateId: string, companyId: string, input: z.infer<typeof createEstimateOptionSchema>) => {
        const parsed = createEstimateOptionSchema.parse(input);
        const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);

        return prisma.estimateOption.create({
            data: {
                estimateId,
                name: parsed.name,
                description: parsed.description,
                items: parsed.items,
                total: parsed.total,
            },
        });
    },

    getOptions: async (estimateId: string, companyId: string) => {
        const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);

        return prisma.estimateOption.findMany({
            where: { estimateId },
            orderBy: { createdAt: 'asc' },
        });
    },

    acceptOption: async (optionId: string, estimateId: string, companyId: string) => {
        const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
        if (!estimate) throw new AppError('Estimate not found', StatusCodes.NOT_FOUND);

        const option = await prisma.estimateOption.findFirst({
            where: { id: optionId, estimateId },
        });
        if (!option) throw new AppError('Option not found', StatusCodes.NOT_FOUND);

        return prisma.$transaction(async (tx) => {
            // Un-accept all other options
            await tx.estimateOption.updateMany({
                where: { estimateId },
                data: { accepted: false },
            });

            // Accept this option
            const acceptedOption = await tx.estimateOption.update({
                where: { id: optionId },
                data: { accepted: true },
            });

            // Update estimate items and total to match the accepted option
            await tx.estimate.update({
                where: { id: estimateId },
                data: {
                    items: acceptedOption.items as any,
                    total: acceptedOption.total,
                },
            });

            return acceptedOption;
        });
    }
};
