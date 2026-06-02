import bcrypt from 'bcryptjs';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import {
    SessionTokenPayload,
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
} from '../../utils/jwt';
import { z } from 'zod';

const registerSchema = z.object({
    companyName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export const authService = {
    buildSessionPayload: (user: { id: string; companyId: string; role: string }): SessionTokenPayload => ({
        userId: user.id,
        companyId: user.companyId,
        role: user.role,
    }),

    createSessionTokens: (payload: SessionTokenPayload) => ({
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
    }),

    register: async (raw: unknown) => {
        const input = registerSchema.parse(raw);

        const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
        });

        if (existingUser) {
            throw new AppError('Email already in use', StatusCodes.CONFLICT);
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);

        const result = await prisma.$transaction(async (tx) => {
            const company = await tx.company.create({
                data: {
                    name: input.companyName,
                    settings: { onboardingComplete: false },
                },
            });

            const user = await tx.user.create({
                data: {
                    email: input.email,
                    passwordHash: hashedPassword,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    companyId: company.id,
                    role: 'ADMIN',
                    status: 'ACTIVE',
                },
            });

            return { company, user };
        });

        return result;
    },

    login: async (input: unknown) => {
        const parsed = loginSchema.parse(input);

        const user = await prisma.user.findUnique({
            where: { email: parsed.email },
            include: { company: true },
        });

        if (!user || !(await bcrypt.compare(parsed.password, user.passwordHash))) {
            throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED);
        }

        if (user.status !== 'ACTIVE') {
            throw new AppError('Account is inactive', StatusCodes.FORBIDDEN);
        }

        const payload = authService.buildSessionPayload(user);
        const { accessToken, refreshToken } = authService.createSessionTokens(payload);

        return { user, accessToken, refreshToken };
    },

    refreshSession: async (refreshToken: string) => {
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            throw new AppError('Invalid session', StatusCodes.UNAUTHORIZED);
        }

        const user = await prisma.user.findFirst({
            where: {
                id: decoded.userId,
                companyId: decoded.companyId,
                status: 'ACTIVE',
            },
            include: { company: true },
        });

        if (!user) {
            throw new AppError('Session user not found', StatusCodes.UNAUTHORIZED);
        }

        const payload = authService.buildSessionPayload(user);
        const tokens = authService.createSessionTokens(payload);
        return { user, ...tokens };
    },
};
