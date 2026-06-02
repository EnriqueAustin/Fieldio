import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createClaimSchema = z.object({
    propertyAssetId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    claimNumber: z.string().optional(),
    manufacturer: z.string().optional(),
    issueDescription: z.string().min(1),
    notes: z.string().optional(),
});

const updateClaimSchema = z.object({
    status: z.enum(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DENIED', 'FULFILLED']).optional(),
    claimNumber: z.string().optional(),
    resolution: z.string().optional(),
    notes: z.string().optional(),
});

export const warrantyClaimService = {
    getAll: async (companyId: string, status?: string) => {
        const where: any = { companyId };
        if (status) where.status = status;
        return prisma.warrantyClaim.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                propertyAsset: {
                    select: {
                        id: true, name: true, manufacturer: true, model: true,
                        serialNumber: true, warrantyUntil: true,
                        property: { select: { addressLine1: true, city: true, customer: { select: { name: true } } } },
                    },
                },
            },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const claim = await prisma.warrantyClaim.findFirst({
            where: { id, companyId },
            include: { propertyAsset: { include: { property: { include: { customer: true } } } } },
        });
        if (!claim) throw new AppError('Warranty claim not found', StatusCodes.NOT_FOUND);
        return claim;
    },

    create: async (companyId: string, input: z.infer<typeof createClaimSchema>) => {
        const parsed = createClaimSchema.parse(input);

        const asset = await prisma.propertyAsset.findFirst({
            where: { id: parsed.propertyAssetId, companyId },
        });
        if (!asset) throw new AppError('Property asset not found', StatusCodes.NOT_FOUND);

        return prisma.warrantyClaim.create({
            data: {
                companyId,
                ...parsed,
                manufacturer: parsed.manufacturer ?? asset.manufacturer,
            },
            include: { propertyAsset: { select: { name: true, manufacturer: true, model: true } } },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateClaimSchema>) => {
        const parsed = updateClaimSchema.parse(input);
        const claim = await prisma.warrantyClaim.findFirst({ where: { id, companyId } });
        if (!claim) throw new AppError('Warranty claim not found', StatusCodes.NOT_FOUND);

        const data: any = { ...parsed };
        if (parsed.status === 'FULFILLED' || parsed.status === 'DENIED') {
            data.resolvedDate = new Date();
        }

        return prisma.warrantyClaim.update({ where: { id }, data });
    },

    getByAsset: async (propertyAssetId: string, companyId: string) => {
        return prisma.warrantyClaim.findMany({
            where: { propertyAssetId, companyId },
            orderBy: { createdAt: 'desc' },
        });
    },

    getExpiringWarranties: async (companyId: string, daysAhead = 90) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + daysAhead);

        return prisma.propertyAsset.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                warrantyUntil: { not: null, lte: cutoff, gte: new Date() },
            },
            include: {
                property: { select: { addressLine1: true, city: true, customer: { select: { id: true, name: true } } } },
            },
            orderBy: { warrantyUntil: 'asc' },
        });
    },
};
