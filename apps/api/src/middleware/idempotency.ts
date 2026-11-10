import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';
import { AppError } from './error';
import { logger } from '../utils/logger';

// Offline-first idempotency for field writes.
//
// The phone queues mutations while it has no signal and replays them when the
// connection returns, so the same create/update can arrive more than once (and
// sometimes two copies land together). Every field write carries a stable
// `Idempotency-Key: <uuid>` header; the first request runs the handler and we
// store its 2xx response, and any later request with the same key replays that
// stored response without touching the database again.
//
// Only authenticated POST/PATCH/PUT/DELETE requests that carry the header are
// handled; everything else passes straight through unchanged.

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

// A reservation row is inserted before the handler runs so a concurrent twin
// loses the unique-constraint race instead of running a second handler. Its
// statusCode stays at this sentinel until the handler's real response lands.
const IN_FLIGHT = 0;

// A reservation older than this is treated as abandoned (server restart or a
// handler that never answered with JSON), so the action can run again. It must
// outlast the slowest field write (photo uploads allow 120s).
const STALE_RESERVATION_MS = 3 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isUniqueViolation = (err: unknown): boolean =>
    Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002');

// The original copy of this action is still running. 503 + Retry-After makes the
// phone's offline queue back off and retry, and the retry then gets the replay.
function sendBusy(res: Response) {
    res.setHeader('Retry-After', '5');
    res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        status: 'error',
        message: 'This action is already being processed — retrying shortly',
    });
}

function sendReplay(res: Response, row: { statusCode: number; response: unknown }) {
    res.setHeader('Idempotent-Replay', 'true');
    res.status(row.statusCode).json(row.response ?? { status: 'success' });
}

// Wait for an in-flight twin (one that won the reservation race) to finish and
// store its result. Returns the completed row to replay, or null if the twin's
// reservation vanished (its handler failed, so the caller may run its own).
async function waitForResult(companyId: string, userId: string, key: string) {
    for (let attempt = 0; attempt < 30; attempt++) {
        const row = await prisma.idempotencyKey.findFirst({ where: { companyId, userId, key } });
        if (!row) return null;
        if (row.statusCode && row.statusCode > IN_FLIGHT) return row;
        await sleep(100);
    }
    return 'busy' as const;
}

// Capture the handler's response and persist it against the reservation. The
// actual send is deferred until the row is written (or cleaned up) so a retry
// that arrives the instant the first response goes out still sees the record.
function captureResponse(res: Response, reservationId: string) {
    const realJson = res.json.bind(res);
    let handled = false;

    (res as Response).json = ((body: unknown) => {
        if (handled) return res;
        handled = true;
        const status = res.statusCode;

        const finalize = async () => {
            if (status >= 200 && status < 300) {
                // Normalise to plain JSON so Dates match the HTTP body on replay.
                const stored = JSON.parse(JSON.stringify(body ?? { status: 'success' }));
                await prisma.idempotencyKey.update({
                    where: { id: reservationId },
                    data: { statusCode: status, response: stored },
                });
            } else {
                // Don't persist failures — a later retry must be able to succeed.
                await prisma.idempotencyKey.delete({ where: { id: reservationId } });
            }
        };

        finalize()
            .catch((err) => logger.warn({ err: (err as Error).message }, 'Idempotency persist failed'))
            .finally(() => realJson(body));

        return res;
    }) as Response['json'];
}

async function handle(req: Request, res: Response, next: NextFunction) {
    const key = req.get('Idempotency-Key');

    // No key, a non-mutating method, or an unauthenticated request → untouched.
    if (!key || !MUTATING_METHODS.has(req.method) || !req.user) {
        return next();
    }

    if (!KEY_PATTERN.test(key)) {
        throw new AppError(
            'Invalid Idempotency-Key header (expected 8-100 of A-Z, a-z, 0-9, _ or -)',
            StatusCodes.BAD_REQUEST,
        );
    }

    const { companyId, userId } = req.user;

    const existing = await prisma.idempotencyKey.findFirst({ where: { companyId, userId, key } });
    if (existing) {
        if (existing.statusCode && existing.statusCode > IN_FLIGHT) {
            return sendReplay(res, existing);
        }
        if (Date.now() - new Date(existing.createdAt).getTime() > STALE_RESERVATION_MS) {
            // Abandoned reservation: clear it and run the action for real.
            await prisma.idempotencyKey.delete({ where: { id: existing.id } }).catch(() => undefined);
        } else {
            // A twin is mid-flight: wait briefly for its stored result.
            const done = await waitForResult(companyId, userId, key);
            if (done === 'busy') return sendBusy(res);
            if (done) return sendReplay(res, done);
            // The twin's reservation disappeared (its handler failed) — fall
            // through and let this request run for real.
        }
    }

    let reservationId: string;
    try {
        const reservation = await prisma.idempotencyKey.create({
            data: {
                companyId,
                userId,
                key,
                method: req.method,
                path: req.originalUrl,
                statusCode: IN_FLIGHT,
            },
        });
        reservationId = reservation.id;
    } catch (err) {
        if (isUniqueViolation(err)) {
            // Lost the reservation race to a twin — replay its result once ready.
            const done = await waitForResult(companyId, userId, key);
            if (done && done !== 'busy') return sendReplay(res, done);
            // Never run a second copy while the first may still succeed: ask the
            // phone to retry later (503 is retryable for the offline queue).
            return sendBusy(res);
        }
        throw err;
    }

    captureResponse(res, reservationId);
    return next();
}

export const idempotency = (req: Request, res: Response, next: NextFunction) => {
    handle(req, res, next).catch(next);
};

/**
 * Delete idempotency records older than `retainDays` (default 7). Keys only
 * guard against replays of recently-queued offline actions, so old rows are
 * dead weight. Runs on a daily schedule (see startIdempotencyKeyPurgeScheduler).
 */
export async function purgeOldIdempotencyKeys(retainDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000);
    const { count } = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
}

export function startIdempotencyKeyPurgeScheduler(): void {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const run = () =>
        purgeOldIdempotencyKeys(7).catch((err) =>
            logger.warn({ err: (err as Error).message }, 'Idempotency key purge failed'),
        );
    run();
    setInterval(run, DAY_MS).unref?.();
}
