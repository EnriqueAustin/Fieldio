import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createCustomerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    notes: z.string().optional(),
    // Optional initial property
    property: z.object({
        addressLine1: z.string(),
        addressLine2: z.string().optional(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
    }).optional(),
});

const updateCustomerSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(['ACTIVE', 'LEAD', 'ARCHIVED']).optional(),
});

export const customerService = {
    findAll: async (companyId: string, page = 1, limit = 20, search?: string) => {
        const skip = (page - 1) * limit;

        const where: any = { companyId };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                include: { _count: { select: { properties: true, jobs: true } } }
            }),
            prisma.customer.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    findOne: async (id: string, companyId: string) => {
        const customer = await prisma.customer.findFirst({
            where: { id, companyId },
            include: {
                properties: true,
                jobs: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                }
            },
        });

        if (!customer) {
            throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
        }

        return customer;
    },

    create: async (companyId: string, input: z.infer<typeof createCustomerSchema>) => {
        return prisma.$transaction(async (tx) => {
            const customer = await tx.customer.create({
                data: {
                    companyId,
                    name: input.name,
                    email: input.email || null,
                    phone: input.phone,
                    notes: input.notes,
                }
            });

            if (input.property) {
                await tx.property.create({
                    data: {
                        companyId,
                        customerId: customer.id,
                        ...input.property
                    }
                });
            }

            return customer;
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateCustomerSchema>) => {
        const customer = await prisma.customer.findFirst({ where: { id, companyId } });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        return prisma.customer.update({
            where: { id },
            data: input,
        });
    },
};
