import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
    message: {
        status: 'error',
        message: 'Too many login attempts, please try again after 15 minutes',
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false,
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each IP to 300 requests per window
    message: {
        status: 'error',
        message: 'Too many requests, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
