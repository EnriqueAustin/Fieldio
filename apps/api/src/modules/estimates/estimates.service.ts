import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createEstimateSchema = z.object({
    customerId: z.string(),
    items: z.array(z.any()), // Simplified for now
    total: z.number(),
    validUntil: z.string().optional(),
});

export const estimateService = {
    create: async (companyId: string, input: z.infer<typeof createEstimateSchema>) => {
        return prisma.estimate.create({
            data: {
                companyId,
                customerId: input.customerId,
                items: input.items,
                total: input.total,
                validUntil: input.validUntil ? new Date(input.validUntil) : null,
                status: 'DRAFT',
            },
        });
    },

    getAll: async (companyId: string) => {
        return prisma.estimate.findMany({
            where: { companyId },
            include: { customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
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
    }
};
