import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { prisma } from '@fieldio/database';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken, type SessionTokenPayload } from '../utils/jwt';

// Roles allowed to see money over the socket (prices, costs, invoices, payments).
export const OFFICE_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;
// Back-office staff who work the inbox / phones but aren't necessarily on money.
const STAFF_ROLES = [...OFFICE_ROLES, 'CSR', 'SALES'] as const;
const ALL_ROLES = ['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT'] as const;
const NON_TECH_ROLES = ALL_ROLES.filter((r) => r !== 'TECHNICIAN');
// Non-technician roles that aren't cleared for money: they get price-stripped copies.
const NON_OFFICE_STAFF_ROLES = NON_TECH_ROLES.filter((r) => !(OFFICE_ROLES as readonly string[]).includes(r));

export const companyRoom = (companyId: string) => `company:${companyId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const roleRoom = (companyId: string, role: string) => `role:${companyId}:${role}`;

// Events whose payload is money end-to-end: office roles only, nobody else.
const OFFICE_ONLY_EVENTS = new Set([
    'invoice:paid',
    'invoice:dunning_sent',
    'payment:received',
    'inventory:deducted',
]);
// Inbox, phones, bookings and live tech positions: back-office staff only.
const STAFF_ONLY_EVENTS = new Set([
    'message:sent',
    'message:received',
    'call:incoming',
    'booking:received',
    'tech:location',
]);
// Job and schedule events (job:created/updated, job:lineitem:*, job:checklist*,
// job:note:*, job:photo:*, job:signature:*, schedule:updated) carry customer
// name, phone and address: technicians only get them for jobs they are on.
// Matched on the prefix before the first ':'.
const JOB_EVENT_FAMILIES = ['job', 'schedule'];
const isJobScopedEvent = (event: string) => JOB_EVENT_FAMILIES.includes(event.split(':')[0]);
// Van stock movements: only that van's crew among technicians.
const VAN_INVENTORY_EVENTS = new Set(['inventory:alert', 'inventory:used', 'inventory:adjusted']);

// Keys that carry a price, cost or money figure anywhere in a payload. Anything
// below one of these keys is dropped for non-office recipients.
const PRICE_KEYS = new Set([
    'unitPrice', 'unitCost', 'price', 'cost', 'costPrice', 'sellPrice', 'buyPrice',
    'total', 'subtotal', 'subTotal', 'tax', 'taxAmount', 'vat', 'vatAmount', 'discount',
    'amount', 'amountPaid', 'amountDue', 'balance', 'totalAmount', 'lineTotal',
    'margin', 'markup', 'hourlyCost', 'hourlyRate', 'costSummary', 'totalRevenue',
    'totalExpenses', 'materialsCost', 'invoice', 'invoices', 'estimate', 'estimates',
    'expenses', 'payments', 'purchaseOrders',
]);

/** Deep copy of `data` with every price-bearing key removed. */
export const stripPriceFields = (data: unknown, depth = 0): unknown => {
    if (data === null || data === undefined || depth > 8) return data;
    if (Array.isArray(data)) return data.map((d) => stripPriceFields(d, depth + 1));
    if (data instanceof Date || typeof data !== 'object') return data;
    // Prisma Decimal and similar value objects: leave non-plain objects alone
    // unless they're under a price key (handled by the caller loop).
    const proto = Object.getPrototypeOf(data);
    if (proto !== Object.prototype && proto !== null) return data;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (PRICE_KEYS.has(key)) continue;
        out[key] = stripPriceFields(value, depth + 1);
    }
    return out;
};

class SocketService {
    private io: Server | null = null;

    public init(httpServer: HttpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: config.WEB_URL,
                credentials: true,
            },
            path: '/socket.io',
        });

        // Every connection must carry a valid access token (handshake `auth.token`
        // or a Bearer header); rooms are derived from it, never from the client.
        this.io.use((socket, next) => {
            const header = socket.handshake.headers.authorization;
            const token =
                (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
                (typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined);

            if (!token) return next(new Error('Authentication error'));
            const decoded = verifyAccessToken(token);
            if (!decoded?.userId || !decoded.companyId || !decoded.role) {
                return next(new Error('Authentication error'));
            }
            socket.data.user = decoded;
            next();
        });

        this.io.on('connection', (socket) => {
            const user = socket.data.user as SessionTokenPayload;
            logger.debug({ userId: user.userId }, 'Socket connected');

            socket.join([
                companyRoom(user.companyId),
                userRoom(user.userId),
                roleRoom(user.companyId, user.role),
            ]);

            socket.on('disconnect', () => {
                logger.debug({ userId: user.userId }, 'Socket disconnected');
            });
        });

        logger.info('Socket.io initialized');
    }

    /** Full payload to the money-cleared office roles only. */
    public emitToOffice(companyId: string, event: string, data: unknown) {
        this.emitToRoles(companyId, OFFICE_ROLES, event, data);
    }

    public emitToRoles(companyId: string, roles: readonly string[], event: string, data: unknown) {
        if (!this.io || roles.length === 0) return;
        this.io.to(roles.map((r) => roleRoom(companyId, r))).emit(event, data);
    }

    public emitToUser(userId: string, event: string, data: unknown) {
        if (!this.io) return;
        this.io.to(userRoom(userId)).emit(event, data);
    }

    /**
     * Company-wide event. Routed by sensitivity so existing callers stay safe:
     * - money events → office roles only
     * - inbox/phone/location events → back-office staff only
     * - per-user notifications → that user only
     * - job/schedule and van-stock events → office roles get the full payload,
     *   other non-technician roles a price-stripped copy, and technicians only
     *   when they are on that job / van (POPIA: customer name, phone and address
     *   ride in these payloads), price-stripped
     * - everything else → office roles get the full payload, every other role
     *   gets a copy with prices/costs stripped (technicians never see money).
     */
    public emitToCompany(companyId: string, event: string, data: unknown) {
        if (!this.io) return;

        if (event === 'notification:received') {
            const userId = (data as { userId?: string } | null)?.userId;
            if (userId) this.emitToUser(userId, event, data);
            return;
        }
        if (OFFICE_ONLY_EVENTS.has(event)) return this.emitToOffice(companyId, event, data);
        if (STAFF_ONLY_EVENTS.has(event)) return this.emitToRoles(companyId, STAFF_ROLES, event, data);

        this.emitToOffice(companyId, event, data);
        if (isJobScopedEvent(event) || VAN_INVENTORY_EVENTS.has(event)) {
            const stripped = stripPriceFields(data);
            this.emitToRoles(companyId, NON_OFFICE_STAFF_ROLES, event, stripped);
            this.enqueueCrewDelivery(companyId, event, () =>
                VAN_INVENTORY_EVENTS.has(event)
                    ? this.vanInventoryRecipients(companyId, data)
                    : this.jobRecipients(companyId, data),
            stripped);
            return;
        }
        const others = ALL_ROLES.filter((r) => !(OFFICE_ROLES as readonly string[]).includes(r));
        this.emitToRoles(companyId, others, event, stripPriceFields(data));
    }

    // Per-company chain so a tech receives a company's job events in the order
    // they were emitted, even though resolving recipients is async.
    private crewQueues = new Map<string, Promise<void>>();

    private enqueueCrewDelivery(
        companyId: string,
        event: string,
        resolve: () => Promise<string[]>,
        payload: unknown,
    ) {
        const previous = this.crewQueues.get(companyId) ?? Promise.resolve();
        const next = previous
            .then(async () => {
                const userIds = await resolve();
                if (!this.io || userIds.length === 0) return;
                // User rooms of the crew, minus anyone already served by a
                // non-technician role room above (an office user who is also the
                // job's tech must not get it twice, nor the unstripped copy twice).
                this.io
                    .to(userIds.map(userRoom))
                    .except(NON_TECH_ROLES.map((r) => roleRoom(companyId, r)))
                    .emit(event, payload);
            })
            .catch((err: unknown) => {
                logger.warn(
                    { companyId, event, err: err instanceof Error ? err.message : String(err) },
                    'Socket crew delivery failed',
                );
            });
        this.crewQueues.set(companyId, next);
        void next.finally(() => {
            if (this.crewQueues.get(companyId) === next) this.crewQueues.delete(companyId);
        });
    }

    /**
     * Technicians on a job: its tech plus the crew of its van, and — when the
     * payload names them (see utils/reassignment.ts) — the previous tech and the
     * previous van's crew, so a reassigned job drops off their screens live.
     * A payload that only carries a job id (note, photo, checklist, geofence
     * status) is looked up.
     */
    private async jobRecipients(companyId: string, data: unknown): Promise<string[]> {
        const payload = asRecord(data);
        if (!payload) return [];
        const ids = new Set<string>();
        const add = (v: unknown) => {
            if (typeof v === 'string' && v) ids.add(v);
        };

        let techId: unknown = payload.techId;
        let vanId: unknown = payload.vanId;
        add(payload.previousTechId);

        if (!('techId' in payload) && !('vanId' in payload)) {
            const jobId = stringOr(payload.jobId) ?? stringOr(payload.id);
            if (jobId) {
                const job = await prisma.job.findFirst({
                    where: { id: jobId, companyId },
                    select: { techId: true, vanId: true },
                });
                techId = job?.techId;
                vanId = job?.vanId;
            }
        }
        add(techId);
        for (const userId of await this.vanCrew(companyId, vanId)) ids.add(userId);
        if (payload.previousVanId !== vanId) {
            for (const userId of await this.vanCrew(companyId, payload.previousVanId)) ids.add(userId);
        }
        return [...ids];
    }

    /** Van stock events go to that van's crew only. */
    private async vanInventoryRecipients(companyId: string, data: unknown): Promise<string[]> {
        return this.vanCrew(companyId, asRecord(data)?.vanId);
    }

    private async vanCrew(companyId: string, vanId: unknown): Promise<string[]> {
        if (typeof vanId !== 'string' || !vanId) return [];
        const members = await prisma.vanMember.findMany({
            where: { vanId, van: { companyId } },
            select: { userId: true },
        });
        return members.map((m) => m.userId);
    }
}

const asRecord = (data: unknown): Record<string, unknown> | null =>
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

const stringOr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export const socketService = new SocketService();
