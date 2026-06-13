import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';

type EntityType = 'CUSTOMER' | 'PROPERTY' | 'JOB' | 'ASSET' | 'ESTIMATE' | 'INVOICE';

export const documentsService = {
    list: (companyId: string, entityType: EntityType, entityId: string) =>
        prisma.documentFile.findMany({
            where: { companyId, entityType, entityId },
            orderBy: { createdAt: 'desc' },
        }),

    create: async (
        companyId: string,
        userId: string,
        input: {
            entityType: EntityType;
            entityId: string;
            name: string;
            url: string;
            contentType?: string;
            sizeBytes?: number;
            category?: string;
        }
    ) => {
        let customerId: string | undefined;
        let jobId: string | undefined;
        if (input.entityType === 'CUSTOMER') customerId = input.entityId;
        if (input.entityType === 'JOB') {
            jobId = input.entityId;
            const job = await prisma.job.findFirst({ where: { id: input.entityId, companyId } });
            if (job) customerId = job.customerId;
        }
        if (input.entityType === 'PROPERTY') {
            const prop = await prisma.property.findFirst({ where: { id: input.entityId, companyId } });
            if (prop) customerId = prop.customerId;
        }
        return prisma.documentFile.create({
            data: {
                companyId,
                uploadedById: userId,
                entityType: input.entityType,
                entityId: input.entityId,
                customerId,
                jobId,
                name: input.name,
                url: input.url,
                contentType: input.contentType,
                sizeBytes: input.sizeBytes,
                category: input.category,
            },
        });
    },

    delete: async (id: string, companyId: string) => {
        const existing = await prisma.documentFile.findFirst({ where: { id, companyId } });
        if (!existing) throw new AppError('Document not found', StatusCodes.NOT_FOUND);
        await prisma.documentFile.delete({ where: { id } });
    },
};
