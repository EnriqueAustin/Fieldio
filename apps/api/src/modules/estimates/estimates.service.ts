import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createEstimateSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    customerId: z.string(),
    items: z.array(z.any()), // Simplified for now
    total: z.number(),
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
