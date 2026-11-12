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

// Field names mirror the Property model: `state` is the province and `zip` the
// postal code. The model has no access-notes column, so that field is omitted.
// lat/lng clear to null, which is why they are nullable.
const updatePropertySchema = z.object({
    addressLine1: z.string().min(1).optional(),
    addressLine2: z.string().optional().nullable(),
    city: z.string().min(1).optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    geoLat: z.number().nullable().optional(),
    geoLng: z.number().nullable().optional(),
});

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

    update: async (
        propertyId: string,
        customerId: string,
        companyId: string,
        input: z.infer<typeof updatePropertySchema>,
    ) => {
        const parsed = updatePropertySchema.parse(input);
        // The site must belong to BOTH the caller's company and the customer in
        // the URL — a mismatch is a 404, never a cross-tenant edit.
        const property = await prisma.property.findFirst({
            where: { id: propertyId, companyId, customerId },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);

        return prisma.property.update({
            where: { id: propertyId },
            data: parsed,
        });
    },

    delete: async (id: string, companyId: string, customerId?: string) => {
        const property = await prisma.property.findFirst({
            where: { id, companyId, ...(customerId ? { customerId } : {}) },
        });

        if (!property) {
            throw new AppError('Property not found', StatusCodes.NOT_FOUND);
        }

        // The Property model has no soft-delete column, so a site with service
        // history cannot be removed without orphaning jobs. Refuse instead.
        const jobCount = await prisma.job.count({
            where: { companyId, propertyId: id, deletedAt: null },
        });
        if (jobCount > 0) {
            throw new AppError(
                'This site has jobs linked to it and cannot be deleted. Move or remove those jobs first.',
                StatusCodes.CONFLICT,
            );
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
