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
};
