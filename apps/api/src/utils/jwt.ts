import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export type SessionTokenPayload = {
    userId: string;
    companyId: string;
    role: string;
};

export const signAccessToken = (payload: SessionTokenPayload) => {
    return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '15m' });
};

export const signRefreshToken = (payload: SessionTokenPayload) => {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token: string): SessionTokenPayload | null => {
    try {
        return jwt.verify(token, config.JWT_SECRET) as SessionTokenPayload;
    } catch (error) {
        return null;
    }
};

export const verifyRefreshToken = (token: string): SessionTokenPayload | null => {
    try {
        return jwt.verify(token, config.JWT_REFRESH_SECRET) as SessionTokenPayload;
    } catch (error) {
        return null;
    }
};
