import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

/**
 * Opt-in bypass for local development and end-to-end test runs, where a suite
 * legitimately logs in many times in a short window. Gated on NODE_ENV so it can
 * never take effect in production even if the flag leaks into that environment.
 */
const skipInNonProd = () =>
    process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        status: 'error',
        message: 'Too many login attempts, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skip: skipInNonProd,
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: {
        status: 'error',
        message: 'Too many requests, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInNonProd,
});

export const publicEndpointLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: {
        status: 'error',
        message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        status: 'error',
        message: 'Too many booking requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: {
        status: 'error',
        message: 'Too many webhook requests',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
