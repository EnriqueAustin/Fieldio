import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

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
