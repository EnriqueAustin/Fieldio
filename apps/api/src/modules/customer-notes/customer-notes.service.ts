import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createNoteSchema = z.object({
    customerId: z.string().uuid(),
    type: z.enum(['NOTE', 'CALL_INBOUND', 'CALL_OUTBOUND', 'EMAIL_SENT', 'EMAIL_RECEIVED', 'SMS_SENT', 'MEETING']).default('NOTE'),
    subject: z.string().optional(),
    body: z.string().min(1),
    duration: z.number().int().min(0).optional(),
});

const updateNoteSchema = z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
    duration: z.number().int().min(0).optional(),
});

export const customerNoteService = {
    getByCustomer: async (customerId: string, companyId: string, limit = 50) => {
        return prisma.customerNote.findMany({
            where: { customerId, companyId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    },

    create: async (companyId: string, userId: string, input: z.infer<typeof createNoteSchema>) => {
        const parsed = createNoteSchema.parse(input);
        const customer = await prisma.customer.findFirst({
            where: { id: parsed.customerId, companyId, deletedAt: null },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        return prisma.customerNote.create({
            data: { companyId, userId, ...parsed },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateNoteSchema>) => {
        const parsed = updateNoteSchema.parse(input);
        const note = await prisma.customerNote.findFirst({ where: { id, companyId } });
        if (!note) throw new AppError('Note not found', StatusCodes.NOT_FOUND);
        return prisma.customerNote.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const note = await prisma.customerNote.findFirst({ where: { id, companyId } });
        if (!note) throw new AppError('Note not found', StatusCodes.NOT_FOUND);
        await prisma.customerNote.delete({ where: { id } });
        return { deleted: true };
    },

    getTimeline: async (customerId: string, companyId: string) => {
        const [notes, jobs, estimates, invoices, payments, formSubmissions] = await Promise.all([
            prisma.customerNote.findMany({
                where: { customerId, companyId },
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { firstName: true, lastName: true } } },
            }),
            prisma.job.findMany({
                where: { customerId, companyId, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, title: true, status: true, priority: true,
                    scheduledStart: true, actualStart: true, actualEnd: true,
                    createdAt: true, updatedAt: true,
                    tech: { select: { firstName: true, lastName: true } },
                },
            }),
            prisma.estimate.findMany({
                where: { customerId, companyId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, status: true, total: true, createdAt: true, approvedAt: true },
            }),
            prisma.invoice.findMany({
                where: { companyId, deletedAt: null, job: { customerId } },
                orderBy: { createdAt: 'desc' },
                select: { id: true, invoiceNumber: true, status: true, total: true, balance: true, createdAt: true, paidAt: true },
            }),
            prisma.payment.findMany({
                where: { companyId, invoice: { job: { customerId } } },
                orderBy: { createdAt: 'desc' },
                select: { id: true, amount: true, method: true, status: true, createdAt: true },
            }),
            prisma.digitalFormSubmission.findMany({
                where: { customerId, companyId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, createdAt: true, template: { select: { name: true } } },
            }),
        ]);

        type TimelineEntry = { type: string; date: Date; data: any };
        const timeline: TimelineEntry[] = [];

        for (const n of notes) {
            timeline.push({ type: n.type, date: n.createdAt, data: { id: n.id, subject: n.subject, body: n.body, duration: n.duration, user: n.user } });
        }
        for (const j of jobs) {
            timeline.push({ type: 'JOB_CREATED', date: j.createdAt, data: { id: j.id, title: j.title, status: j.status, priority: j.priority, tech: j.tech } });
            if (j.actualStart) timeline.push({ type: 'JOB_STARTED', date: j.actualStart, data: { id: j.id, title: j.title } });
            if (j.actualEnd) timeline.push({ type: 'JOB_COMPLETED', date: j.actualEnd, data: { id: j.id, title: j.title, status: j.status } });
        }
        for (const e of estimates) {
            timeline.push({ type: 'ESTIMATE_CREATED', date: e.createdAt, data: { id: e.id, status: e.status, total: e.total } });
            if (e.approvedAt) timeline.push({ type: 'ESTIMATE_APPROVED', date: e.approvedAt, data: { id: e.id, total: e.total } });
        }
        for (const i of invoices) {
            timeline.push({ type: 'INVOICE_CREATED', date: i.createdAt, data: { id: i.id, invoiceNumber: i.invoiceNumber, total: i.total, status: i.status } });
            if (i.paidAt) timeline.push({ type: 'INVOICE_PAID', date: i.paidAt, data: { id: i.id, invoiceNumber: i.invoiceNumber, total: i.total } });
        }
        for (const p of payments) {
            timeline.push({ type: 'PAYMENT_RECEIVED', date: p.createdAt, data: { id: p.id, amount: p.amount, method: p.method, status: p.status } });
        }
        for (const f of formSubmissions) {
            timeline.push({ type: 'FORM_SUBMITTED', date: f.createdAt, data: { id: f.id, formName: f.template.name } });
        }

        timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

        return { customerId, timeline };
    },
};
