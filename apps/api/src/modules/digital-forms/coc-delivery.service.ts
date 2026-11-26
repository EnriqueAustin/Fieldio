import crypto from 'crypto';
import { prisma } from '@fieldio/database';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../middleware/error';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { emailService, type EmailAttachment } from '../../services/notifications/email.service';
import { whatsappService } from '../../services/notifications/whatsapp.service';
import { answerForRole, isCustomerFacing, readTemplateSchema } from './form-schema';
import { generateCertificatePdf, jobReference, loadCertificateSource, schemaForSubmission } from './coc-pdf.service';
import { readAnswers, readMeta, withMeta } from './submission-meta';

/**
 * Getting a certificate to the customer: an unguessable public PDF link (same
 * idea as the invoice pay-link PDF), email + WhatsApp delivery mirroring the
 * job-summary send, and `sentAt` bookkeeping on the submission.
 */

// Public token = "<submissionId>.<secret>". The id makes lookup a primary-key
// read; the 24-byte secret is what authorises it. The link lives in the
// submission's `pdfUrl` column, which is the single source of the secret.
const TOKEN_RE = /^([0-9a-zA-Z_-]{1,64})\.([0-9a-f]{48})$/;
const SECRET_IN_URL_RE = /\/certificates\/[0-9a-zA-Z_-]{1,64}\.([0-9a-f]{48})\/pdf$/;

export const publicCertificatePath = (token: string) => `/public/certificates/${token}/pdf`;
const publicCertificateUrl = (token: string) => `${config.API_URL.replace(/\/$/, '')}${publicCertificatePath(token)}`;

const secretFromUrl = (pdfUrl: string | null | undefined) => (pdfUrl ? SECRET_IN_URL_RE.exec(pdfUrl)?.[1] : undefined);

/**
 * Return the customer-facing PDF link, minting it the first time a certificate
 * is actually sent. The write is conditional on `pdfUrl` still being empty, so
 * two concurrent sends can't mint different secrets — the loser re-reads and
 * uses the winner's link, and an emailed link never stops working.
 */
export async function ensurePublicLink(submission: { id: string; pdfUrl?: string | null }): Promise<string> {
    const existing = secretFromUrl(submission.pdfUrl);
    if (existing) {
        const url = publicCertificateUrl(`${submission.id}.${existing}`);
        // Keep the stored link current if the public path or API_URL changes (same secret).
        if (submission.pdfUrl !== url) {
            await prisma.digitalFormSubmission.update({ where: { id: submission.id }, data: { pdfUrl: url } });
        }
        return url;
    }

    const url = publicCertificateUrl(`${submission.id}.${crypto.randomBytes(24).toString('hex')}`);
    const { count } = await prisma.digitalFormSubmission.updateMany({
        where: { id: submission.id, pdfUrl: submission.pdfUrl ?? null },
        data: { pdfUrl: url },
    });
    if (count === 1) return url;

    const fresh = await prisma.digitalFormSubmission.findFirst({ where: { id: submission.id }, select: { pdfUrl: true } });
    const winner = secretFromUrl(fresh?.pdfUrl);
    if (!winner) throw new Error('Could not create the certificate link');
    return publicCertificateUrl(`${submission.id}.${winner}`);
}

/** Public (no-auth) PDF by token. Any mismatch is a plain 404. */
export async function renderCertificateByToken(token: string) {
    const match = TOKEN_RE.exec(token ?? '');
    const notFound = new AppError('Certificate not found', StatusCodes.NOT_FOUND);
    if (!match) throw notFound;
    const [, id, secret] = match;

    const submission = await prisma.digitalFormSubmission.findFirst({ where: { id } });
    const stored = secretFromUrl(submission?.pdfUrl);
    if (!submission || !stored || stored.length !== secret.length) throw notFound;
    if (!crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(secret))) throw notFound;

    const { source } = await loadCertificateSource(submission.id, submission.companyId);
    return generateCertificatePdf(source);
}

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');
const maskPhone = (p: string) => (p.length > 4 ? `${'*'.repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : p);

/** Record a delivery on the submission (sentAt + channels + masked recipients). */
async function recordSent(
    submission: { id: string; data: unknown },
    channels: string[],
    sentTo: { email?: string | null; phone?: string | null },
) {
    const sentAt = new Date().toISOString();
    // Re-read so a link minted moments ago isn't overwritten by a stale copy.
    const fresh = await prisma.digitalFormSubmission.findFirst({ where: { id: submission.id }, select: { data: true } });
    await prisma.digitalFormSubmission.update({
        where: { id: submission.id },
        data: { data: withMeta(fresh?.data ?? submission.data, { sentAt, sentChannels: channels, sentTo }) as object },
    });
    return sentAt;
}

export interface SendCertificateOptions {
    email?: boolean;
    whatsapp?: boolean;
}

/**
 * Email (and WhatsApp) the certificate link to the job's customer. Throws 400
 * when there is nobody to send to; records sentAt only if a channel went out.
 */
export async function sendCertificateToCustomer(submissionId: string, companyId: string, opts: SendCertificateOptions = {}) {
    const wantEmail = opts.email ?? true;
    const wantWhatsapp = opts.whatsapp ?? true;
    const { source, submission, customer } = await loadCertificateSource(submissionId, companyId);

    if (!customer) {
        throw new AppError('This form is not linked to a customer, so there is no one to send it to', StatusCodes.BAD_REQUEST);
    }
    const email = wantEmail && customer.email ? customer.email : null;
    const phone = wantWhatsapp && customer.phone ? customer.phone : null;
    if (!email && !phone) {
        throw new AppError('The customer has no email address or phone number on file', StatusCodes.BAD_REQUEST);
    }

    // Render once up front so a broken certificate fails here, not in the inbox.
    const { model, buffer, fileName } = await generateCertificatePdf(source);
    const link = await ensurePublicLink(submission);
    const companyName = source.company.name;
    const certLabel = model.certificateNumber ? `${model.title} (no. ${model.certificateNumber})` : model.title;
    const ref = source.job ? ` for ${jobReference(source.job.id)}` : '';

    const channels: string[] = [];
    if (email) {
        const body =
            `Hi ${customer.name},\n\n` +
            `Please find your ${certLabel}${ref} from ${companyName} attached. You can also open it here:\n${link}\n\n` +
            `Keep this record with your property documents. If anything looks off, please reply to this email.`;
        const r = await emailService
            .sendRawWithAttachments(
                email,
                `Your certificate — ${model.title}`,
                body,
                [{ filename: fileName, content: buffer, contentType: 'application/pdf' }],
                companyId,
            )
            .catch((err: Error) => {
            logger.warn({ submissionId, err: err.message }, 'Certificate email failed');
            return { ok: false as const };
        });
        if (r?.ok) channels.push('email');
    }
    if (phone) {
        const body = `Hi ${customer.name}, ${companyName} has issued your ${certLabel}${ref}. Download it here:\n${link}`;
        const r = await whatsappService.sendText(phone, body, companyId, 'certificate_sent').catch((err: Error) => {
            logger.warn({ submissionId, err: err.message }, 'Certificate WhatsApp failed');
            return { ok: false as const };
        });
        if (r?.ok) channels.push('whatsapp');
    }

    if (channels.length === 0) {
        throw new AppError('The certificate could not be sent. Check the email/WhatsApp setup and try again.', StatusCodes.BAD_GATEWAY);
    }

    const sentTo = { email: email ? maskEmail(email) : null, phone: phone ? maskPhone(phone) : null };
    const sentAt = await recordSent(submission, channels, sentTo);
    return { sentAt, channels, sentTo };
}

export interface JobCertificateSummary {
    id: string;
    title: string;
    certificateNumber: string | null;
    issuedAt: Date;
    issuedBy: string;
    pdfUrl: string | null;
}

/**
 * Customer-facing certificates on a job, for the job-summary PDF/email. Internal
 * forms (site safety checks etc.) are excluded — see isCustomerFacing. No links
 * are minted here; call withPublicLinks only when the summary is actually sent.
 */
export async function getJobCertificates(jobId: string, companyId: string): Promise<JobCertificateSummary[]> {
    const submissions = await prisma.digitalFormSubmission.findMany({
        where: { companyId, jobId },
        include: {
            template: { select: { name: true, schema: true } },
            user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const out: JobCertificateSummary[] = [];
    for (const s of submissions) {
        const schema = schemaForSubmission(s.data, s.template?.schema);
        if (!isCustomerFacing(schema)) continue;
        const answers = readAnswers(s.data);
        const meta = readMeta(s.data);
        const name = meta.template?.name ?? s.template?.name ?? 'Form';
        out.push({
            id: s.id,
            title: schema.certificateTitle || name,
            certificateNumber: answerForRole(schema, answers, 'certificateNumber'),
            issuedAt: s.createdAt,
            issuedBy:
                answerForRole(schema, answers, 'registeredPerson') ??
                ([s.user?.firstName, s.user?.lastName].filter(Boolean).join(' ') || 'Technician'),
            pdfUrl: s.pdfUrl ?? null,
        });
    }
    return out;
}

/** Mint (or reuse) the public link for each certificate that is about to be sent. */
export async function withPublicLinks(certificates: JobCertificateSummary[]) {
    const out: Array<JobCertificateSummary & { publicUrl: string }> = [];
    for (const c of certificates) {
        out.push({ ...c, publicUrl: await ensurePublicLink({ id: c.id, pdfUrl: c.pdfUrl }) });
    }
    return out;
}

/** Total attachment budget for the closeout email; above it we send links only. */
export const MAX_SUMMARY_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Render the certificate PDFs for the closeout summary email. Returns null when
 * any one can't be rendered or they exceed the size budget together, so the
 * caller falls back to the links (which are always in the message anyway).
 */
export async function buildCertificateAttachments(
    ids: string[],
    companyId: string,
    maxBytes = MAX_SUMMARY_ATTACHMENT_BYTES,
): Promise<EmailAttachment[] | null> {
    const attachments: EmailAttachment[] = [];
    let total = 0;
    for (const id of ids) {
        try {
            const { source } = await loadCertificateSource(id, companyId);
            const { buffer, fileName } = await generateCertificatePdf(source);
            total += buffer.length;
            if (total > maxBytes) return null;
            attachments.push({ filename: fileName, content: buffer, contentType: 'application/pdf' });
        } catch (err) {
            logger.warn({ submissionId: id, err: (err as Error).message }, 'Certificate PDF for summary failed');
            return null;
        }
    }
    return attachments;
}

/** Mark certificates as delivered via the job summary message. */
export async function markCertificatesSent(ids: string[], channels: string[]) {
    for (const id of ids) {
        const s = await prisma.digitalFormSubmission.findFirst({ where: { id }, select: { id: true, data: true } });
        if (s) await recordSent(s, channels.map((c) => `summary:${c}`), {});
    }
}

/** Fire-and-forget auto-send after submit when the template opts in. */
export function autoSendIfEnabled(submissionId: string, companyId: string, liveSchema: unknown) {
    if (!readTemplateSchema(liveSchema).autoSendToCustomer) return;
    sendCertificateToCustomer(submissionId, companyId).catch((err: Error) =>
        logger.warn({ submissionId, err: err.message }, 'Certificate auto-send failed'),
    );
}
