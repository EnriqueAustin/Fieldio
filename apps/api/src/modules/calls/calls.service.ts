import { prisma } from '@fieldio/database';
import { socketService } from '../../services/socket.service';

const last9 = (p: string) => p.replace(/[^0-9]/g, '').slice(-9);

export const callsService = {
    list: (companyId: string, limit = 100) =>
        prisma.callLog.findMany({
            where: { companyId },
            include: { customer: { select: { id: true, name: true } }, user: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { startedAt: 'desc' },
            take: limit,
        }),

    log: async (params: {
        companyId: string;
        direction: 'INBOUND' | 'OUTBOUND';
        fromNumber: string;
        toNumber: string;
        status?: 'COMPLETED' | 'MISSED' | 'VOICEMAIL' | 'FAILED' | 'IN_PROGRESS' | 'RINGING';
        durationSec?: number;
        recordingUrl?: string | null;
        providerId?: string | null;
        userId?: string | null;
        notes?: string;
    }) => {
        // Resolve customer by phone
        const phone = params.direction === 'INBOUND' ? params.fromNumber : params.toNumber;
        const customer = await prisma.customer.findFirst({
            where: { companyId: params.companyId, phone: { contains: last9(phone) } },
            select: { id: true, name: true },
        });
        const call = await prisma.callLog.create({
            data: {
                companyId: params.companyId,
                direction: params.direction,
                fromNumber: params.fromNumber,
                toNumber: params.toNumber,
                status: params.status ?? 'COMPLETED',
                durationSec: params.durationSec ?? 0,
                recordingUrl: params.recordingUrl ?? undefined,
                providerId: params.providerId ?? undefined,
                userId: params.userId ?? undefined,
                customerId: customer?.id,
                notes: params.notes,
                endedAt: params.status === 'IN_PROGRESS' || params.status === 'RINGING' ? null : new Date(),
            },
        });
        return { call, customer };
    },

    /** Inbound ring screen-pop event. */
    notifyIncoming: async (companyId: string, fromNumber: string) => {
        const customer = await prisma.customer.findFirst({
            where: { companyId, phone: { contains: last9(fromNumber) } },
            select: { id: true, name: true, phone: true },
        });
        socketService.emitToCompany(companyId, 'call:incoming', {
            fromNumber,
            customer,
            at: new Date().toISOString(),
        });
        return { customer };
    },
};
