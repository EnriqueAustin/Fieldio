import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { socketService } from '../../services/socket.service';
import { smsService } from '../../services/notifications/sms.service';
import { whatsappService } from '../../services/notifications/whatsapp.service';

type Channel = 'SMS' | 'WHATSAPP';

const normalizePhone = (p: string) => p.replace(/[^0-9+]/g, '');

export const messagingService = {
    /** List threads with last-message preview. */
    listThreads: async (companyId: string, opts: { status?: 'OPEN' | 'CLOSED' | 'ARCHIVED' } = {}) => {
        const threads = await prisma.smsThread.findMany({
            where: { companyId, status: opts.status ?? 'OPEN' },
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 100,
        });
        return threads.map((t) => ({
            ...t,
            lastMessage: t.messages[0] ?? null,
            messages: undefined,
        }));
    },

    getThread: async (id: string, companyId: string) => {
        const thread = await prisma.smsThread.findFirst({
            where: { id, companyId },
            include: {
                customer: true,
                job: { select: { id: true, title: true } },
                messages: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!thread) throw new AppError('Thread not found', StatusCodes.NOT_FOUND);
        // Mark read
        await prisma.smsThread.update({ where: { id }, data: { unreadCount: 0 } });
        return thread;
    },

    /** Send an outbound message; creates/updates the thread. */
    send: async (
        companyId: string,
        userId: string,
        opts: { phone: string; body: string; channel?: Channel; customerId?: string; jobId?: string }
    ) => {
        const phone = normalizePhone(opts.phone);
        const channel = opts.channel ?? 'SMS';

        const thread = await prisma.smsThread.upsert({
            where: {
                companyId_channel_phone: { companyId, channel, phone },
            },
            update: { lastMessageAt: new Date(), status: 'OPEN' },
            create: {
                companyId,
                channel,
                phone,
                customerId: opts.customerId,
                jobId: opts.jobId,
                lastMessageAt: new Date(),
            },
        });

        // Dispatch via provider
        let providerId: string | undefined;
        let status: string = 'SENT';
        let errorReason: string | null = null;
        try {
            if (channel === 'WHATSAPP') {
                await whatsappService.sendText?.(phone, opts.body, companyId);
            } else {
                await smsService.sendText?.(phone, opts.body, companyId);
            }
        } catch (err: any) {
            status = 'FAILED';
            errorReason = err?.message ?? 'send failed';
        }

        const msg = await prisma.smsMessage.create({
            data: {
                companyId,
                threadId: thread.id,
                direction: 'OUTBOUND',
                channel,
                fromNumber: 'company',
                toNumber: phone,
                body: opts.body,
                authorId: userId,
                providerId,
                status,
                errorReason,
            },
        });

        socketService.emitToCompany(companyId, 'message:sent', { threadId: thread.id, message: msg });
        return { thread, message: msg };
    },

    /** Inbound webhook entry: receive a message from provider. */
    receiveInbound: async (params: {
        companyId: string;
        phone: string;
        body: string;
        channel: Channel;
        providerId?: string;
        mediaUrls?: string[];
    }) => {
        const phone = normalizePhone(params.phone);
        const customer = await prisma.customer.findFirst({
            where: { companyId: params.companyId, phone: { contains: phone.slice(-9) } },
            select: { id: true, name: true },
        });

        const thread = await prisma.smsThread.upsert({
            where: { companyId_channel_phone: { companyId: params.companyId, channel: params.channel, phone } },
            update: {
                lastMessageAt: new Date(),
                unreadCount: { increment: 1 },
                status: 'OPEN',
                ...(customer && { customerId: customer.id }),
            },
            create: {
                companyId: params.companyId,
                channel: params.channel,
                phone,
                customerId: customer?.id,
                lastMessageAt: new Date(),
                unreadCount: 1,
            },
        });

        const msg = await prisma.smsMessage.create({
            data: {
                companyId: params.companyId,
                threadId: thread.id,
                direction: 'INBOUND',
                channel: params.channel,
                fromNumber: phone,
                toNumber: 'company',
                body: params.body,
                mediaUrls: params.mediaUrls ?? [],
                providerId: params.providerId,
                status: 'DELIVERED',
            },
        });

        socketService.emitToCompany(params.companyId, 'message:received', { threadId: thread.id, message: msg, customerName: customer?.name });
        return { thread, message: msg };
    },

    setStatus: async (id: string, companyId: string, status: 'OPEN' | 'CLOSED' | 'ARCHIVED') => {
        await prisma.smsThread.updateMany({ where: { id, companyId }, data: { status } });
    },
};
