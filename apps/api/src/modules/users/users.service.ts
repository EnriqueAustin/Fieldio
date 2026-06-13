import bcrypt from 'bcryptjs';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    branchId: z.string().uuid().optional().nullable(),
    skills: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    branchId: z.string().uuid().optional().nullable(),
    skills: z.array(z.string()).optional(),
    // Capability flag stored inside the user's `permissions` JSON, not a column.
    canIssueCoC: z.boolean().optional(),
});

const userListSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
    branchId: true,
    skills: true,
    permissions: true,
    createdAt: true,
};

const userSummarySelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
    branchId: true,
    skills: true,
    permissions: true,
};

export const userService = {
    findAll: async (companyId: string) => {
        return prisma.user.findMany({
            where: { companyId },
            select: userListSelect,
        });
    },

    create: async (companyId: string, raw: unknown) => {
        const input = createUserSchema.parse(raw);
        const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
        });

        if (existingUser) {
            throw new AppError('Email already in use', StatusCodes.CONFLICT);
        }

        const hashedPassword = await bcrypt.hash(input.password, 12);

        return prisma.user.create({
            data: {
                email: input.email,
                passwordHash: hashedPassword,
                firstName: input.firstName,
                lastName: input.lastName,
                role: input.role,
                companyId,
                branchId: input.branchId ?? null,
                skills: input.skills ?? [],
                status: 'ACTIVE',
            },
            select: userSummarySelect,
        });
    },

    update: async (userId: string, companyId: string, raw: unknown) => {
        const input = updateUserSchema.parse(raw);
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
        });

        if (!user) {
            throw new AppError('User not found', StatusCodes.NOT_FOUND);
        }

        const { canIssueCoC, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };
        // Merge the CoC capability into the existing permissions JSON so other
        // capabilities aren't clobbered.
        if (canIssueCoC !== undefined) {
            const current = (user.permissions as Record<string, unknown> | null) ?? {};
            data.permissions = { ...current, canIssueCoC };
        }

        return prisma.user.update({
            where: { id: userId },
            data,
            select: userSummarySelect,
        });
    },

    updateSkills: async (userId: string, companyId: string, skills: string[]) => {
        const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
        if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);
        const clean = Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean)));
        return prisma.user.update({
            where: { id: userId },
            data: { skills: clean },
            select: userSummarySelect,
        });
    },

    listSkillsCatalog: async (companyId: string) => {
        const users = await prisma.user.findMany({
            where: { companyId },
            select: { skills: true },
        });
        const jobs = await prisma.job.findMany({
            where: { companyId },
            select: { requiredSkills: true },
        });
        const set = new Set<string>();
        users.forEach((u) => u.skills.forEach((s) => set.add(s)));
        jobs.forEach((j) => j.requiredSkills.forEach((s) => set.add(s)));
        return Array.from(set).sort();
    },

    delete: async (userId: string, companyId: string) => {
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
        });

        if (!user) {
            throw new AppError('User not found', StatusCodes.NOT_FOUND);
        }

        return prisma.user.update({
            where: { id: userId },
            data: { status: 'INACTIVE' },
        });
    },
};
