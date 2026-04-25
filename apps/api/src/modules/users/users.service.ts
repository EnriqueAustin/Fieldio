import bcrypt from 'bcryptjs';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const updateUserSchema = z.object({
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const userService = {
    findAll: async (companyId: string) => {
        return prisma.user.findMany({
            where: { companyId },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
            },
        });
    },

    create: async (companyId: string, input: z.infer<typeof createUserSchema>) => {
        const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
        });

        if (existingUser) {
            throw new AppError('Email already in use', StatusCodes.CONFLICT);
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);

        return prisma.user.create({
            data: {
                email: input.email,
                passwordHash: hashedPassword,
                role: input.role,
                companyId,
                status: 'ACTIVE',
            },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
        });
    },

    update: async (userId: string, companyId: string, input: z.infer<typeof updateUserSchema>) => {
        // Ensure user belongs to company
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
        });

        if (!user) {
            throw new AppError('User not found', StatusCodes.NOT_FOUND);
        }

        return prisma.user.update({
            where: { id: userId },
            data: input,
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
        });
    },

    delete: async (userId: string, companyId: string) => {
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
        });

        if (!user) {
            throw new AppError('User not found', StatusCodes.NOT_FOUND);
        }

        // Soft delete usually, but for now strict delete or status update
        // Let's set to INACTIVE instead of deleting to preserve history
        return prisma.user.update({
            where: { id: userId },
            data: { status: 'INACTIVE' },
        });
    },
};
