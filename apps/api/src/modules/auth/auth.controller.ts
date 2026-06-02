import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authService } from './auth.service';
import { config } from '../../config/env';
import { AppError } from '../../middleware/error';

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const toSessionUser = (user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    companyId: string;
    company: { name: string };
}) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0],
    role: user.role,
    companyId: user.companyId,
    companyName: user.company.name,
});

export const authController = {
    register: async (req: Request, res: Response) => {
        const { user, company } = await authService.register(req.body);
        res.status(StatusCodes.CREATED).json({
            status: 'success',
            data: {
                company: { id: company.id, name: company.name },
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
            },
        });
    },

    login: async (req: Request, res: Response) => {
        const { user, accessToken, refreshToken } = await authService.login(req.body);

        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

        res.status(StatusCodes.OK).json({
            status: 'success',
            data: {
                accessToken,
                user: toSessionUser(user),
            },
        });
    },

    refresh: async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            throw new AppError('Session expired', StatusCodes.UNAUTHORIZED);
        }

        const { user, accessToken, refreshToken: rotatedRefreshToken } =
            await authService.refreshSession(refreshToken);

        res.cookie('refreshToken', rotatedRefreshToken, COOKIE_OPTIONS);

        res.status(StatusCodes.OK).json({
            status: 'success',
            data: {
                accessToken,
                user: toSessionUser(user),
            },
        });
    },

    logout: (req: Request, res: Response) => {
        res.clearCookie('refreshToken', COOKIE_OPTIONS);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
