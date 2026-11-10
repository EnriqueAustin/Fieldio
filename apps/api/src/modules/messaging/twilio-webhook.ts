import type { NextFunction, Request, Response } from 'express';
import twilio from 'twilio';
import { prisma } from '@fieldio/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

// Read at call time so the production gate is testable.
const isProduction = () => process.env.NODE_ENV === 'production';

const stripSlash = (s: string) => s.replace(/\/+$/, '');

/**
 * Candidate public URLs Twilio may have signed. Twilio signs the exact URL it
 * was configured with, so behind a proxy prefer an explicit public base
 * (TWILIO_WEBHOOK_BASE_URL), then API_URL, then the forwarded host/proto.
 */
export const candidateWebhookUrls = (req: Request): string[] => {
    const path = req.originalUrl || req.url;
    const urls = new Set<string>();
    const explicit = process.env.TWILIO_WEBHOOK_BASE_URL;
    if (explicit) urls.add(stripSlash(explicit) + path);
    if (config.API_URL) urls.add(stripSlash(config.API_URL) + path);
    const fwdProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const fwdHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
    const host = fwdHost || req.headers.host;
    if (host) urls.add(`${fwdProto || req.protocol}://${host}${path}`);
    return [...urls];
};

/**
 * Express middleware: rejects any request without a valid X-Twilio-Signature.
 * Only when TWILIO_AUTH_TOKEN is unset outside production are unsigned
 * requests let through (local development with a simulator).
 */
export const verifyTwilioSignature = (req: Request, res: Response, next: NextFunction) => {
    const authToken = config.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        if (!isProduction()) return next();
        logger.error('Twilio webhook rejected: TWILIO_AUTH_TOKEN is not configured');
        res.status(403).type('text/plain').send('Forbidden');
        return;
    }

    const signature = req.header('x-twilio-signature');
    const params = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const valid =
        !!signature &&
        candidateWebhookUrls(req).some((url) => twilio.validateRequest(authToken, signature, url, params));

    if (!valid) {
        logger.warn({ path: req.path }, 'Twilio webhook rejected: bad or missing signature');
        res.status(403).type('text/plain').send('Forbidden');
        return;
    }
    next();
};

const digits = (p: unknown) => (typeof p === 'string' ? p.replace(/^whatsapp:/, '').replace(/[^0-9]/g, '') : '');

// Compare on the last 9 digits so +27 82 … and 082 … match.
const sameNumber = (a: string, b: string) => a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9);

/** Every number a company has registered for inbound messages/calls. */
const companyNumbers = (settings: any): string[] => {
    const s = settings ?? {};
    return [
        s.integrations?.twilio?.phoneNumber,
        s.integrations?.twilio?.fromNumber,
        s.integrations?.whatsapp?.businessNumber,
        s.messaging?.twilioNumber,
    ].map(digits).filter(Boolean);
};

/**
 * Which company owns the Twilio `To` number. Never trusts a companyId from the
 * request. With no number mapping configured anywhere, a single-company install
 * falls back to its only company; otherwise the request can't be routed.
 */
export const resolveCompanyForInboundNumber = async (to: unknown): Promise<string | null> => {
    const target = digits(to);
    const companies: Array<{ id: string; settings: unknown }> = await prisma.company.findMany({
        select: { id: true, settings: true },
    });

    if (target) {
        const owners = companies.filter((c) => companyNumbers(c.settings).some((n) => sameNumber(n, target)));
        if (owners.length === 1) return owners[0].id;
        if (owners.length > 1) {
            logger.error({ to: target.slice(-4) }, 'Inbound number is claimed by more than one company');
            return null;
        }
    }

    if (companies.length === 1) return companies[0].id;
    return null;
};
