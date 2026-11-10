import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken, type SessionTokenPayload } from '../utils/jwt';

// Roles allowed to see money over the socket (prices, costs, invoices, payments).
export const OFFICE_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;
// Back-office staff who work the inbox / phones but aren't necessarily on money.
const STAFF_ROLES = [...OFFICE_ROLES, 'CSR', 'SALES'] as const;
const ALL_ROLES = ['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT'] as const;

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
        const others = ALL_ROLES.filter((r) => !(OFFICE_ROLES as readonly string[]).includes(r));
        this.emitToRoles(companyId, others, event, stripPriceFields(data));
    }
}

export const socketService = new SocketService();
