import PDFDocument from 'pdfkit';
import { prisma } from '@fieldio/database';
import { storageService, isStorageConfigured } from '../../services/storage.service';
import { emailService } from '../../services/notifications/email.service';
import { whatsappService } from '../../services/notifications/whatsapp.service';
import { logger } from '../../utils/logger';
import { normalizeCompanySettings } from '../company/company-settings';

const fmtCurrency = (n: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .format(Number(n));

const fmtDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const generateBuffer = async (job: any, company: any, settings: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.on('data', (c) => chunks.push(c as Buffer));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const currency = settings.regional?.currency ?? 'USD';

        // Header
        doc.fontSize(20).fillColor('#0f172a').text(company.name, { align: 'left' });
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor('#64748b').text('Job Completion Summary', { align: 'left' });
        doc.moveDown(0.6);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.6);

        // Customer + job
        doc.fillColor('#0f172a').fontSize(14).text(job.title);
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor('#475569')
            .text(`${job.customer.name}`)
            .text(`${job.property.addressLine1}${job.property.addressLine2 ? ', ' + job.property.addressLine2 : ''}, ${job.property.city}`);
        doc.moveDown(0.6);

        // Service window
        doc.fontSize(10).fillColor('#0f172a')
            .text(`Arrived: ${fmtDate(job.actualStart)}`)
            .text(`Completed: ${fmtDate(job.actualEnd)}`);
        if (job.tech) {
            const techName = [job.tech.firstName, job.tech.lastName].filter(Boolean).join(' ') || job.tech.email;
            doc.text(`Technician: ${techName}`);
        }
        doc.moveDown(0.8);

        // Work performed
        if (job.description) {
            doc.fontSize(12).fillColor('#0f172a').text('Work performed', { underline: false });
            doc.moveDown(0.2);
            doc.fontSize(10).fillColor('#334155').text(job.description, { width: 495 });
            doc.moveDown(0.6);
        }

        // Checklist
        if (job.checklist?.length > 0) {
            doc.fontSize(12).fillColor('#0f172a').text('Checklist');
            doc.moveDown(0.2);
            doc.fontSize(10).fillColor('#334155');
            for (const c of job.checklist) {
                doc.text(`${c.isCompleted ? '☑' : '☐'}  ${c.label}`);
            }
            doc.moveDown(0.6);
        }

        // Line items
        if (job.lineItems?.length > 0) {
            doc.fontSize(12).fillColor('#0f172a').text('Items & labor');
            doc.moveDown(0.3);
            const tableY = doc.y;
            const colX = [50, 280, 360, 430, 495];
            doc.fontSize(9).fillColor('#64748b')
                .text('Description', colX[0], tableY)
                .text('Qty', colX[1], tableY)
                .text('Unit', colX[2], tableY)
                .text('Total', colX[3], tableY, { width: 65, align: 'right' });
            doc.moveDown(0.4);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
            doc.moveDown(0.3);
            doc.fontSize(10).fillColor('#0f172a');
            let subtotal = 0;
            for (const li of job.lineItems) {
                const rowY = doc.y;
                const total = Number(li.total);
                subtotal += total;
                doc.text(li.name, colX[0], rowY, { width: 220 });
                doc.text(String(li.quantity), colX[1], rowY);
                doc.text(fmtCurrency(Number(li.unitPrice), currency), colX[2], rowY);
                doc.text(fmtCurrency(total, currency), colX[3], rowY, { width: 65, align: 'right' });
                doc.moveDown(0.5);
            }
            doc.moveDown(0.3);
            doc.fontSize(10).fillColor('#0f172a')
                .text(`Subtotal: ${fmtCurrency(subtotal, currency)}`, 50, doc.y, { width: 495, align: 'right' });
            doc.moveDown(0.6);
        }

        // Photos (thumbnails — embed first 4)
        if (job.photos?.length > 0) {
            doc.fontSize(12).fillColor('#0f172a').text('Photos');
            doc.moveDown(0.4);
            const thumbs = job.photos.slice(0, 4);
            doc.fontSize(9).fillColor('#64748b')
                .text(`${job.photos.length} photo${job.photos.length === 1 ? '' : 's'} captured on site. View full set in the customer portal.`);
            doc.moveDown(0.6);
        }

        // Signature
        if (job.signatures?.length > 0) {
            doc.fontSize(12).fillColor('#0f172a').text('Customer sign-off');
            doc.moveDown(0.2);
            const sig = job.signatures[0];
            doc.fontSize(10).fillColor('#334155').text(`Signed by: ${sig.signerName}`);
            doc.text(`At: ${fmtDate(sig.signedAt)}`);
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#94a3b8')
            .text(`Generated ${new Date().toLocaleString()} · ${company.name}`, 50, 770, { align: 'center', width: 495 });

        doc.end();
    });
};

export const jobSummaryService = {
    /** Build & store a leave-behind PDF and (optionally) email / WhatsApp it to the customer. */
    generateAndSend: async (jobId: string, companyId: string, opts: { email?: boolean; whatsapp?: boolean } = {}) => {
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId },
            include: {
                customer: true,
                property: true,
                tech: true,
                checklist: true,
                lineItems: true,
                photos: { orderBy: { createdAt: 'asc' } },
                signatures: { orderBy: { signedAt: 'desc' } },
            },
        });
        if (!job) throw new Error('Job not found');

        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) throw new Error('Company not found');
        const settings = normalizeCompanySettings(company.settings);

        const buffer = await generateBuffer(job, company, settings);

        let pdfUrl: string | null = null;
        if (isStorageConfigured()) {
            const result = await storageService.uploadBuffer({
                companyId,
                folder: `jobs/${jobId}/summary`,
                fileName: `summary-${jobId.slice(0, 8)}.pdf`,
                buffer,
                contentType: 'application/pdf',
            });
            pdfUrl = result.url;
        } else {
            logger.info({ jobId, bytes: buffer.length }, 'Storage not configured — PDF generated but not uploaded');
        }

        await prisma.job.update({
            where: { id: jobId },
            data: {
                ...(pdfUrl ? { summaryPdfUrl: pdfUrl } : {}),
                ...(opts.email || opts.whatsapp ? { summaryEmailedAt: new Date() } : {}),
            },
        });

        if (opts.email && job.customer.email) {
            try {
                const body = pdfUrl
                    ? `Hi ${job.customer.name},\n\nThanks for choosing ${company.name}. Your service summary is ready:\n${pdfUrl}\n\nIf anything looks off, please reply to this email.`
                    : `Hi ${job.customer.name},\n\nThanks for choosing ${company.name}. Your service summary has been generated and is available in your customer portal.\n\nIf anything looks off, please reply to this email.`;
                await emailService.sendRaw(
                    job.customer.email,
                    `Your service summary — ${job.title}`,
                    body,
                    companyId,
                );
            } catch (err: any) {
                logger.warn({ jobId, err: err.message }, 'Summary email failed');
            }
        }

        if (opts.whatsapp && job.customer.phone) {
            try {
                const body = pdfUrl
                    ? `Hi ${job.customer.name}, thanks for choosing ${company.name}. Your service summary for "${job.title}" is ready:\n${pdfUrl}`
                    : `Hi ${job.customer.name}, thanks for choosing ${company.name}. Your service summary for "${job.title}" is ready in your customer portal.`;
                await whatsappService.sendText(job.customer.phone, body, companyId);
            } catch (err: any) {
                logger.warn({ jobId, err: err.message }, 'Summary WhatsApp failed');
            }
        }

        return { pdfUrl, bytes: buffer.length };
    },
};
