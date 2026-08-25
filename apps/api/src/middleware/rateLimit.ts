import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Opt-in bypass for local development and end-to-end test runs, where a suite
 * legitimately logs in many times in a short window. Gated on NODE_ENV so it can
 * never take effect in production even if the flag leaks into that environment.
 */
const skipInNonProd = () =>
    process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true';

/**
 * IPv6 addresses are allocated to a customer in /64 blocks, so limiting on the
 * full address lets a single client rotate through addresses for free.
 */
const ipKey = (req: Request) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return ip.includes(':') ? `${ip.split(':').slice(0, 4).join(':')}::/64` : ip;
};

/**
 * A whole office typically shares one WAN IP, so a per-IP budget locks out the
 * entire company as soon as one busy user burns it. Bucket authenticated
 * traffic per user (the token is verified, so the key can't be forged) and only
 * fall back to the IP for anonymous callers.
 */
const userOrIpKey = (req: Request) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Bearer' && token) {
        const decoded = verifyAccessToken(token);
        if (decoded) return `u:${decoded.userId}`;
    }
    return `ip:${ipKey(req)}`;
};

const ipOptions = {
    keyGenerator: ipKey,
};

/**
 * Brute-force protection for the credential endpoints. Keyed by the account
 * being targeted rather than by IP: a whole office shares one WAN IP, so a
 * per-IP budget lets one person's typo lock out everybody. Only failed attempts
 * count, so normal sign-ins never consume the budget.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        status: 'error',
        message: 'Too many login attempts, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: skipInNonProd,
    keyGenerator: (req: Request) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
        return email ? `acct:${email}` : `ip:${ipKey(req)}`;
    },
});

/**
 * Companion to {@link authLimiter}: the per-account budget alone would let one
 * host spray many accounts cheaply, so cap failed credential attempts per IP
 * too — high enough that a busy office never notices.
 */
export const credentialIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        status: 'error',
        message: 'Too many login attempts, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: skipInNonProd,
    ...ipOptions,
});

/**
 * Access tokens are short-lived, so every active session refreshes on a timer.
 * Sharing the login budget would lock out an office of a handful of users.
 */
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: {
        status: 'error',
        message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInNonProd,
    ...ipOptions,
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
    message: {
        status: 'error',
        message: 'Too many requests, please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInNonProd,
    keyGenerator: userOrIpKey,
});

export const publicEndpointLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: {
        status: 'error',
        message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...ipOptions,
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
    ...ipOptions,
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
    ...ipOptions,
});
