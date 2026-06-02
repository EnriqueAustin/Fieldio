import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createPropertySchema = z.object({
    customerId: z.string(),
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    geoLat: z.number().optional(),
    geoLng: z.number().optional(),
});

const createAssetSchema = z.object({
    propertyId: z.string(),
    name: z.string().min(1),
    category: z.string().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    installedAt: z.string().optional(),
    lastServicedAt: z.string().optional(),
    warrantyUntil: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(['ACTIVE', 'NEEDS_SERVICE', 'RETIRED']).optional(),
});

const updateAssetSchema = createAssetSchema.omit({ propertyId: true }).partial();

export const propertyService = {
    list: async (companyId: string, customerId?: string) => {
        return prisma.property.findMany({
            where: {
                companyId,
                ...(customerId ? { customerId } : {}),
            },
            orderBy: { addressLine1: 'asc' },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                assets: true,
            },
        });
    },

    create: async (companyId: string, input: z.infer<typeof createPropertySchema>) => {
        // Verify customer belongs to company
        const customer = await prisma.customer.findFirst({
            where: { id: input.customerId, companyId }
        });

        if (!customer) {
            throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
        }

        return prisma.property.create({
            data: {
                companyId,
                ...input,
            },
        });
    },

    delete: async (id: string, companyId: string) => {
        const property = await prisma.property.findFirst({
            where: { id, companyId },
        });

        if (!property) {
            throw new AppError('Property not found', StatusCodes.NOT_FOUND);
        }

        return prisma.property.delete({
            where: { id },
        });
    },

    listAssets: async (companyId: string, propertyId?: string) => {
        return prisma.propertyAsset.findMany({
            where: {
                companyId,
                ...(propertyId ? { propertyId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
        });
    },

    createAsset: async (companyId: string, input: z.infer<typeof createAssetSchema>) => {
        const parsed = createAssetSchema.parse(input);
        const property = await prisma.property.findFirst({
            where: { id: parsed.propertyId, companyId },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);

        return prisma.propertyAsset.create({
            data: {
                companyId,
                propertyId: parsed.propertyId,
                name: parsed.name,
                category: parsed.category,
                manufacturer: parsed.manufacturer,
                model: parsed.model,
                serialNumber: parsed.serialNumber,
                installedAt: parsed.installedAt ? new Date(parsed.installedAt) : null,
                lastServicedAt: parsed.lastServicedAt ? new Date(parsed.lastServicedAt) : null,
                warrantyUntil: parsed.warrantyUntil ? new Date(parsed.warrantyUntil) : null,
                notes: parsed.notes,
                status: parsed.status ?? 'ACTIVE',
            },
        });
    },

    updateAsset: async (id: string, companyId: string, input: z.infer<typeof updateAssetSchema>) => {
        const parsed = updateAssetSchema.parse(input);
        const asset = await prisma.propertyAsset.findFirst({ where: { id, companyId } });
        if (!asset) throw new AppError('Asset not found', StatusCodes.NOT_FOUND);

        return prisma.propertyAsset.update({
            where: { id },
            data: {
                ...parsed,
                installedAt: parsed.installedAt ? new Date(parsed.installedAt) : undefined,
                lastServicedAt: parsed.lastServicedAt ? new Date(parsed.lastServicedAt) : undefined,
                warrantyUntil: parsed.warrantyUntil ? new Date(parsed.warrantyUntil) : undefined,
            },
        });
    },
};
