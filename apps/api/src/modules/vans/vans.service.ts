import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createVanSchema = z.object({
    name: z.string().min(1),
    registration: z.string().optional(),
});

const updateVanSchema = z.object({
    name: z.string().min(1).optional(),
    registration: z.string().optional().nullable(),
    active: z.boolean().optional(),
    branchId: z.string().uuid().optional().nullable(),
    odometerKm: z.number().int().optional().nullable(),
    fuelType: z.string().optional().nullable(),
    nextServiceKm: z.number().int().optional().nullable(),
    nextServiceAt: z.string().datetime().optional().nullable(),
    serviceIntervalKm: z.number().int().optional().nullable(),
});

const addMemberSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(['DRIVER', 'MEMBER']).default('MEMBER'),
});

export const vansService = {
    create: async (companyId: string, input: unknown) => {
        const parsed = createVanSchema.parse(input);
        return prisma.van.create({
            data: { companyId, ...parsed },
            include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } } } },
        });
    },

    getAll: async (companyId: string) => {
        return prisma.van.findMany({
            where: { companyId },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } },
                    },
                },
                _count: { select: { jobs: true, inventory: true } },
            },
            orderBy: { name: 'asc' },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const van = await prisma.van.findFirst({
            where: { id, companyId },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
                    },
                },
                inventory: { orderBy: { name: 'asc' } },
                jobs: {
                    where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELED'] } },
                    orderBy: { scheduledStart: 'asc' },
                    include: {
                        customer: { select: { name: true } },
                        property: { select: { addressLine1: true, city: true } },
                    },
                },
            },
        });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);
        return van;
    },

    update: async (id: string, companyId: string, input: unknown) => {
        const parsed = updateVanSchema.parse(input);
        const van = await prisma.van.findFirst({ where: { id, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const data: any = { ...parsed };
        if (parsed.nextServiceAt !== undefined) {
            data.nextServiceAt = parsed.nextServiceAt ? new Date(parsed.nextServiceAt) : null;
        }
        // Clear alert suppression when next-service moves forward.
        if (parsed.nextServiceAt || parsed.nextServiceKm != null) {
            data.serviceAlertSentAt = null;
        }

        return prisma.van.update({
            where: { id },
            data,
            include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } } },
        });
    },

    addMember: async (vanId: string, companyId: string, input: unknown) => {
        const parsed = addMemberSchema.parse(input);
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const user = await prisma.user.findFirst({ where: { id: parsed.userId, companyId, status: 'ACTIVE' } });
        if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);

        const existing = await prisma.vanMember.findUnique({ where: { vanId_userId: { vanId, userId: parsed.userId } } });
        if (existing) throw new AppError('User is already a member of this van', StatusCodes.CONFLICT);

        if (parsed.role === 'DRIVER') {
            await prisma.vanMember.updateMany({
                where: { vanId, role: 'DRIVER' },
                data: { role: 'MEMBER' },
            });
        }

        return prisma.vanMember.create({
            data: { vanId, userId: parsed.userId, role: parsed.role },
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
        });
    },

    removeMember: async (vanId: string, userId: string, companyId: string) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const member = await prisma.vanMember.findUnique({ where: { vanId_userId: { vanId, userId } } });
        if (!member) throw new AppError('Member not found on this van', StatusCodes.NOT_FOUND);

        await prisma.vanMember.delete({ where: { id: member.id } });
        return { deleted: true };
    },

    getVanForUser: async (userId: string, companyId: string) => {
        const membership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            include: {
                van: {
                    include: {
                        members: {
                            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
                        },
                    },
                },
            },
        });
        return membership?.van ?? null;
    },

    getVanInventory: async (vanId: string, companyId: string, role?: string) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const items = await prisma.inventoryItem.findMany({
            where: { companyId, vanId },
            orderBy: { name: 'asc' },
        });

        // Techs manage stock counts but must not see what parts cost the company.
        if (role === 'TECHNICIAN') {
            return items.map(({ unitCost, ...rest }) => rest);
        }
        return items;
    },
};
