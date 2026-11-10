import PDFDocument from 'pdfkit';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { normalizeCompanySettings } from '../company/company-settings';
import { resolveInvoiceHeading, round2, supplierChargesVat } from './invoices.service';
import { formatDateInTimeZone, resolveTimeZone } from '../../utils/timezone';

// ZAR amounts render en-ZA by default ("R 1 234,50"); narrowSymbol keeps the "R".
const fmtMoney = (n: number, locale: string, currency: string) =>
    new Intl.NumberFormat(locale || 'en-ZA', {
        style: 'currency',
        currency: currency || 'ZAR',
        currencyDisplay: 'narrowSymbol',
    }).format(Number(n || 0));

const fmtDate = (d: Date | string | null | undefined, tz: string, locale: string) =>
    d ? formatDateInTimeZone(d, tz, locale) : '—';

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;

const buildInvoicePdf = (invoice: any, settings: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.on('data', (c) => chunks.push(c as Buffer));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const currency = settings.regional?.currency ?? 'ZAR';
        const locale = settings.regional?.locale ?? 'en-ZA';
        const tz = resolveTimeZone(settings.regional?.timezone);
        const money = (n: number) => fmtMoney(n, locale, currency);

        const taxNumber = invoice.taxNumber || settings.billing?.taxNumber || null;
        const chargesVat = supplierChargesVat(taxNumber);
        const heading = resolveInvoiceHeading(taxNumber, settings.billing?.invoiceHeading);
        const isVoid = invoice.status === 'VOID' || !!invoice.voidedAt;

        const supplierName = invoice.supplierName || settings.contact?.companyName || '';
        const supplierReg = invoice.supplierCompanyRegistration || settings.billing?.companyRegistrationNumber || null;
        const contact = settings.contact ?? {};

        // --- Header: supplier (left) + heading / meta (right) ---
        doc.fontSize(20).fillColor('#0f172a').text(supplierName, PAGE_LEFT, 50, { width: 300 });
        doc.moveDown(0.2);
        doc.fontSize(9).fillColor('#64748b');
        if (supplierReg) doc.text(`Reg no: ${supplierReg}`);
        if (chargesVat && taxNumber) doc.text(`VAT no: ${taxNumber}`);
        if (contact.phone) doc.text(String(contact.phone));
        if (contact.email) doc.text(String(contact.email));
        if (contact.website) doc.text(String(contact.website));

        doc.fontSize(22).fillColor('#0f172a').text(heading, 300, 50, { width: 245, align: 'right' });
        doc.fontSize(10).fillColor('#475569');
        doc.text(`No: ${invoice.invoiceNumber ?? '—'}`, 300, 82, { width: 245, align: 'right' });
        doc.text(`Issued: ${fmtDate(invoice.createdAt, tz, locale)}`, 300, doc.y, { width: 245, align: 'right' });
        doc.text(`Due: ${fmtDate(invoice.dueDate, tz, locale)}`, 300, doc.y, { width: 245, align: 'right' });

        doc.moveDown(1.2);
        const ruleY = Math.max(doc.y, 150);
        doc.moveTo(PAGE_LEFT, ruleY).lineTo(PAGE_RIGHT, ruleY).strokeColor('#e2e8f0').stroke();

        // --- Bill-to (buyer snapshot) ---
        doc.y = ruleY + 12;
        doc.fontSize(9).fillColor('#64748b').text('BILL TO', PAGE_LEFT, doc.y);
        doc.moveDown(0.2);
        doc.fontSize(11).fillColor('#0f172a').text(invoice.customerName || invoice.job?.customer?.name || '—');
        doc.fontSize(10).fillColor('#475569');
        if (invoice.customerAddress) doc.text(String(invoice.customerAddress), { width: 300 });
        if (invoice.customerVatNumber) doc.text(`VAT no: ${invoice.customerVatNumber}`);
        doc.moveDown(1);

        // --- Line items ---
        const colX = [PAGE_LEFT, 320, 390, 470];
        const headerY = doc.y;
        doc.fontSize(9).fillColor('#64748b')
            .text('Description', colX[0], headerY)
            .text('Qty', colX[1], headerY, { width: 50, align: 'right' })
            .text('Unit (excl.)', colX[2], headerY, { width: 70, align: 'right' })
            .text('Total', colX[3], headerY, { width: 75, align: 'right' });
        doc.moveDown(0.4);
        doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.3);

        const lines = Array.isArray(invoice.items) ? invoice.items : [];
        doc.fontSize(10).fillColor('#0f172a');
        for (const li of lines) {
            const rowY = doc.y;
            doc.fillColor('#0f172a').text(String(li?.name ?? ''), colX[0], rowY, { width: 260 });
            if (li?.description) {
                doc.fontSize(8).fillColor('#94a3b8').text(String(li.description), colX[0], doc.y, { width: 260 });
                doc.fontSize(10).fillColor('#0f172a');
            }
            doc.text(String(Number(li?.quantity ?? 0)), colX[1], rowY, { width: 50, align: 'right' });
            doc.text(money(Number(li?.unitPrice ?? 0)), colX[2], rowY, { width: 70, align: 'right' });
            doc.text(money(Number(li?.total ?? 0)), colX[3], rowY, { width: 75, align: 'right' });
            doc.moveDown(0.6);
        }

        doc.moveDown(0.3);
        doc.moveTo(320, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.4);

        // --- Totals ---
        const subtotal = Number(invoice.subtotal ?? 0);
        const tax = Number(invoice.tax ?? 0);
        const total = Number(invoice.total ?? 0);
        const balance = Number(invoice.balance ?? 0);
        const paid = round2(
            (Array.isArray(invoice.payments) ? invoice.payments : [])
                .filter((p: any) => p.status === 'SUCCEEDED')
                .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0)
        );
        const taxRate = Number(invoice.taxRate ?? settings.billing?.taxRate ?? 0);
        const taxLabel = invoice.taxLabel || settings.billing?.taxLabel || 'VAT';

        const totalsRow = (label: string, value: string, bold = false) => {
            const y = doc.y;
            doc.fontSize(bold ? 12 : 10).fillColor(bold ? '#0f172a' : '#475569');
            doc.text(label, 320, y, { width: 110, align: 'right' });
            doc.text(value, 435, y, { width: 110, align: 'right' });
            doc.moveDown(bold ? 0.6 : 0.4);
        };
        totalsRow('Subtotal', money(subtotal));
        totalsRow(`${taxLabel} (${taxRate}%)`, money(tax));
        totalsRow('Total', money(total), true);
        totalsRow('Amount paid', money(paid));
        totalsRow('Balance due', money(isVoid ? 0 : balance), true);

        // --- EFT banking details ---
        const eft = settings.billing?.eftDetails ?? {};
        if (settings.billing?.paymentMethods?.eftEnabled) {
            doc.moveDown(1);
            doc.fontSize(11).fillColor('#0f172a').text('Banking details (EFT)', PAGE_LEFT, doc.y);
            doc.moveDown(0.2);
            doc.fontSize(9).fillColor('#475569');
            if (eft.bankName) doc.text(`Bank: ${eft.bankName}`);
            if (eft.accountName) doc.text(`Account name: ${eft.accountName}`);
            if (eft.accountNumber) doc.text(`Account number: ${eft.accountNumber}`);
            if (eft.branchCode) doc.text(`Branch code: ${eft.branchCode}`);
            if (eft.accountType) doc.text(`Account type: ${eft.accountType}`);
            doc.text(`Payment reference: ${invoice.paymentReference || invoice.invoiceNumber || ''}`);
            if (eft.paymentInstructions) {
                doc.moveDown(0.2);
                doc.fontSize(8).fillColor('#94a3b8').text(String(eft.paymentInstructions), { width: 495 });
            }
        }

        // --- VOID banner (drawn last, over the document) ---
        if (isVoid) {
            doc.save();
            doc.rotate(-30, { origin: [297, 400] });
            doc.fontSize(120).fillColor('#ef4444').opacity(0.18)
                .text('VOID', 60, 340, { align: 'center', width: 475 });
            doc.restore();
            doc.opacity(1);
        }

        doc.end();
    });
};

const INVOICE_INCLUDE = {
    company: { select: { name: true, settings: true } },
    job: { select: { title: true, customer: { select: { name: true } } } },
    payments: { orderBy: { createdAt: 'desc' as const } },
};

export const invoicePdfService = {
    /** Office PDF: company-scoped lookup. */
    renderById: async (id: string, companyId: string) => {
        const invoice = await prisma.invoice.findFirst({
            where: { id, companyId, deletedAt: null },
            include: INVOICE_INCLUDE,
        });
        if (!invoice) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        const settings = normalizeCompanySettings((invoice as any).company?.settings);
        const buffer = await buildInvoicePdf(invoice, settings);
        return { buffer, invoiceNumber: invoice.invoiceNumber || invoice.id };
    },

    /** Public PDF: by pay-link token. 404 for unknown or soft-deleted invoices. */
    renderByToken: async (token: string) => {
        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: INVOICE_INCLUDE,
        });
        if (!invoice || invoice.deletedAt) throw new AppError('Invoice not found', StatusCodes.NOT_FOUND);
        const settings = normalizeCompanySettings((invoice as any).company?.settings);
        const buffer = await buildInvoicePdf(invoice, settings);
        return { buffer, invoiceNumber: invoice.invoiceNumber || invoice.id };
    },
};
