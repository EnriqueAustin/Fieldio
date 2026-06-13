import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';
import { emailService } from '../../services/notifications/email.service';
import { smsService } from '../../services/notifications/sms.service';
import { whatsappService } from '../../services/notifications/whatsapp.service';
import { paymentsService } from '../payments/payments.service';
import { socketService } from '../../services/socket.service';

const DEFAULT_RULES = [
    { daysAfterDue: 3, channel: 'EMAIL' as const, subject: 'Friendly reminder: invoice {{number}}', body: 'Hi {{name}},\n\nYour invoice {{number}} for {{total}} is now {{days}} days past due. Please settle via {{payUrl}}.\n\nThanks.' },
    { daysAfterDue: 7, channel: 'SMS' as const, body: 'Reminder: invoice {{number}} ({{total}}) is overdue. Pay: {{payUrl}}' },
    { daysAfterDue: 14, channel: 'WHATSAPP' as const, body: 'Final notice: invoice {{number}} is {{days}} days overdue. {{payUrl}}' },
];

const interpolate = (s: string, vars: Record<string, string | number>) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));

export const dunningService = {
    listRules: (companyId: string) =>
        prisma.dunningRule.findMany({ where: { companyId }, orderBy: { daysAfterDue: 'asc' } }),

    createRule: (companyId: string, data: any) =>
        prisma.dunningRule.create({ data: { companyId, ...data } }),

    updateRule: (id: string, companyId: string, data: any) =>
        prisma.dunningRule.updateMany({ where: { id, companyId }, data }),

    deleteRule: (id: string, companyId: string) =>
        prisma.dunningRule.deleteMany({ where: { id, companyId } }),

    /** Seed default rules for a company if none exist. */
    seedDefaults: async (companyId: string) => {
        const count = await prisma.dunningRule.count({ where: { companyId } });
        if (count > 0) return;
        for (const r of DEFAULT_RULES) {
            await prisma.dunningRule.create({ data: { companyId, name: `${r.daysAfterDue}-day ${r.channel}`, ...r } });
        }
    },

    /**
     * Run dunning sweep across all companies. Sends due reminders, escalates dunningLevel.
     */
    runSweep: async () => {
        const now = new Date();
        const invoices = await prisma.invoice.findMany({
            where: {
                deletedAt: null,
                status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] },
                balance: { gt: 0 },
                dueDate: { lt: now, not: null },
            },
            include: {
                job: { include: { customer: { select: { name: true, email: true, phone: true } } } },
                company: { select: { id: true, name: true } },
            },
            take: 500,
        });

        let sent = 0;
        for (const inv of invoices) {
            const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate!).getTime()) / 86_400_000);
            const rules = await prisma.dunningRule.findMany({
                where: { companyId: inv.companyId, active: true, daysAfterDue: { lte: daysOverdue } },
                orderBy: { daysAfterDue: 'desc' },
            });
            if (rules.length === 0) continue;
            const top = rules[0];
            if (top.daysAfterDue <= inv.dunningLevel) continue; // already escalated past this rule

            try {
                const payUrl = await paymentsService.getPayLinkForInvoice(inv.id, inv.companyId);
                const vars = {
                    name: inv.job.customer.name,
                    number: inv.invoiceNumber || inv.id.slice(0, 8),
                    total: `R ${Number(inv.total).toFixed(2)}`,
                    days: daysOverdue,
                    payUrl,
                };
                const body = interpolate(top.body, vars);
                const subject = interpolate(top.subject || `Invoice {{number}} reminder`, vars);

                if (top.channel === 'EMAIL' && inv.job.customer.email) {
                    await emailService.sendRaw?.(inv.job.customer.email, subject, body, inv.companyId);
                } else if (top.channel === 'SMS' && inv.job.customer.phone) {
                    await smsService.sendText(inv.job.customer.phone, body, inv.companyId);
                } else if (top.channel === 'WHATSAPP' && inv.job.customer.phone) {
                    await whatsappService.sendText(inv.job.customer.phone, body, inv.companyId);
                }

                await prisma.dunningEvent.create({
                    data: { companyId: inv.companyId, invoiceId: inv.id, ruleId: top.id, channel: top.channel },
                });
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: {
                        dunningLevel: top.daysAfterDue,
                        dunningLastSentAt: now,
                        status: inv.status === 'SENT' ? 'OVERDUE' : inv.status,
                    },
                });
                socketService.emitToCompany(inv.companyId, 'invoice:dunning_sent', { invoiceId: inv.id, level: top.daysAfterDue });
                sent++;
            } catch (err) {
                logger.error({ err, invoiceId: inv.id }, 'Dunning send failed');
                await prisma.dunningEvent.create({
                    data: {
                        companyId: inv.companyId,
                        invoiceId: inv.id,
                        ruleId: top.id,
                        channel: top.channel,
                        status: 'FAILED',
                        error: (err as Error).message,
                    },
                });
            }
        }
        logger.info({ sent, scanned: invoices.length }, 'Dunning sweep complete');
        return { sent, scanned: invoices.length };
    },
};

export const startDunningScheduler = () => {
    const interval = 60 * 60 * 1000; // hourly
    const run = async () => {
        try { await dunningService.runSweep(); }
        catch (err) { logger.error({ err }, 'Dunning sweep crashed'); }
    };
    setInterval(run, interval);
    // Initial run after 30s
    setTimeout(run, 30_000);
};
