import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
import { emailService } from '../../services/notifications/email.service';

const BCRYPT_ROUNDS = 12;

// A refresh token stays usable for a short window after it's rotated. This
// absorbs the reconnect burst where a client (e.g. a technician coming back
// online with a queue of offline mutations) fires several requests that all
// reauth at once — without it, the first refresh revokes the token and the
// rest fail with "Session revoked". Reuse outside this window is still rejected.
const REFRESH_ROTATION_GRACE_MS = 60 * 1000;

const registerSchema = z.object({
    companyName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8).regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one digit'
    ),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

// Same strength rule as registration — reset and change must not be a back door
// around it.
const passwordRule = z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one digit'
);

const forgotPasswordSchema = z.object({ email: z.string().email() });

const resetPasswordSchema = z.object({
    token: z.string().min(32),
    password: passwordRule,
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordRule,
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

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

    storeRefreshToken: async (userId: string, companyId: string, rawToken: string) => {
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        // Upsert handles the race where parallel /auth/refresh calls within the
        // same second produce identical JWTs (iat is 1s-resolution) → same hash.
        await prisma.refreshToken.upsert({
            where: { tokenHash },
            update: { userId, companyId, expiresAt, revokedAt: null },
            create: { userId, companyId, tokenHash, expiresAt },
        });
    },

    revokeRefreshToken: async (rawToken: string) => {
        const tokenHash = hashToken(rawToken);
        await prisma.refreshToken.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    },

    revokeAllUserTokens: async (userId: string) => {
        await prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    },

    validateStoredRefreshToken: async (rawToken: string): Promise<boolean> => {
        const tokenHash = hashToken(rawToken);
        const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
        if (!stored) return false;
        if (stored.expiresAt < new Date()) return false;
        // Accept a freshly-rotated token within the grace window so concurrent
        // refreshes during a reconnect don't kill the session.
        if (stored.revokedAt && stored.revokedAt.getTime() < Date.now() - REFRESH_ROTATION_GRACE_MS) {
            return false;
        }
        return true;
    },

    register: async (raw: unknown) => {
        const input = registerSchema.parse(raw);

        const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
        });

        if (existingUser) {
            throw new AppError('Email already in use', StatusCodes.CONFLICT);
        }

        const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

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

        await authService.storeRefreshToken(user.id, user.companyId, refreshToken);

        return { user, accessToken, refreshToken };
    },

    refreshSession: async (refreshToken: string) => {
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            throw new AppError('Invalid session', StatusCodes.UNAUTHORIZED);
        }

        const isValid = await authService.validateStoredRefreshToken(refreshToken);
        if (!isValid) {
            throw new AppError('Session revoked or expired', StatusCodes.UNAUTHORIZED);
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

        await authService.revokeRefreshToken(refreshToken);

        const payload = authService.buildSessionPayload(user);
        const tokens = authService.createSessionTokens(payload);

        await authService.storeRefreshToken(user.id, user.companyId, tokens.refreshToken);

        return { user, ...tokens };
    },

    logout: async (refreshToken: string) => {
        if (refreshToken) {
            await authService.revokeRefreshToken(refreshToken);
        }
    },

    /**
     * Issues a reset token and emails the link. Returns nothing about whether
     * the address exists — the caller always reports success so the endpoint
     * can't be used to enumerate accounts.
     */
    requestPasswordReset: async (raw: unknown) => {
        const { email } = forgotPasswordSchema.parse(raw);

        const user = await prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });
        if (!user || user.status !== 'ACTIVE') return;

        // Only one live reset link at a time, so an old email can't be replayed.
        await prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash: hashToken(rawToken),
                expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
            },
        });

        await emailService.sendPasswordReset(
            user.email,
            [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
            rawToken,
            user.companyId
        );
    },

    resetPassword: async (raw: unknown) => {
        const { token, password } = resetPasswordSchema.parse(raw);

        const stored = await prisma.passwordResetToken.findUnique({
            where: { tokenHash: hashToken(token) },
            include: { user: true },
        });

        if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
            throw new AppError('This reset link is invalid or has expired', StatusCodes.BAD_REQUEST);
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await prisma.$transaction([
            prisma.user.update({
                where: { id: stored.userId },
                data: { passwordHash },
            }),
            prisma.passwordResetToken.update({
                where: { id: stored.id },
                data: { usedAt: new Date() },
            }),
        ]);

        // A reset usually means the old password leaked or was forgotten on a
        // device that still holds a session, so drop every existing session.
        await authService.revokeAllUserTokens(stored.userId);
    },

    changePassword: async (userId: string, raw: unknown) => {
        const { currentPassword, newPassword } = changePasswordSchema.parse(raw);

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);

        if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
            throw new AppError('Current password is incorrect', StatusCodes.UNAUTHORIZED);
        }

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
        });
    },
};
