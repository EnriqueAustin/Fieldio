import PDFDocument from 'pdfkit';
import { prisma } from '@fieldio/database';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../middleware/error';
import { logger } from '../../utils/logger';
import { normalizeCompanySettings } from '../company/company-settings';
import { formatDateInTimeZone, formatDateTimeInTimeZone, resolveTimeZone } from '../../utils/timezone';
import { answerForRole, fieldKey, readTemplateSchema, type StoredPhoto, type TemplateSchema } from './form-schema';
import { readAnswers, readMeta } from './submission-meta';

/**
 * Certificate-of-Compliance record PDF.
 *
 * Built in two steps so the content can be tested without parsing a PDF:
 * `buildCertificateModel` turns a submission into plain view data (never any
 * price, cost or line item), and `renderCertificatePdf` lays that out.
 */

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type CertificateItem =
    | { kind: 'value'; label: string; value: string; tone?: 'pass' | 'fail' }
    | { kind: 'text'; text: string }
    | { kind: 'table'; label: string; columns: string[]; rows: string[][] }
    | { kind: 'photos'; label: string; images: Buffer[]; missing: number }
    | { kind: 'signature'; label: string; image: Buffer | null };

export interface CertificateSection {
    title: string | null;
    items: CertificateItem[];
}

export interface CertificateModel {
    title: string;
    isRecord: boolean;
    certificateNumber: string | null;
    company: { name: string; lines: string[] };
    details: Array<{ label: string; value: string }>;
    sections: CertificateSection[];
    issuedBy: { name: string; registrationNumber: string | null; registrationCategory: string | null };
    footer: string;
}

export interface CertificateSource {
    submission: {
        id: string;
        companyId: string;
        jobId?: string | null;
        createdAt: Date | string;
        data: unknown;
        signatureUrl?: string | null;
    };
    templateName: string;
    /** Live template schema; the submission's snapshot wins when present. */
    liveSchema: unknown;
    company: { name: string; settings: unknown };
    job: { id: string; title: string } | null;
    customer: { name: string } | null;
    property: { addressLine1: string; addressLine2?: string | null; city: string; state?: string | null; zip?: string | null } | null;
    technician: { firstName: string | null; lastName: string | null; email?: string | null } | null;
}

/** Images already fetched for the submission, keyed by `imageKey`. */
export type ImageMap = Map<string, Buffer>;

const imageKey = (fieldKeyName: string, index: number) => `${fieldKeyName}#${index}`;

const PASS_FAIL_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' };

/** The schema this submission was filled against (snapshot), else the live one. */
export function schemaForSubmission(data: unknown, liveSchema: unknown): TemplateSchema {
    const snapshot = readMeta(data).template?.schema;
    return readTemplateSchema(snapshot ?? liveSchema);
}

export const jobReference = (jobId: string) => `JOB-${jobId.slice(0, 8).toUpperCase()}`;

function formatAddress(p: CertificateSource['property']): string {
    if (!p) return '—';
    return [p.addressLine1, p.addressLine2, p.city, p.state, p.zip].filter((s) => s && String(s).trim()).join(', ');
}

function displayValue(type: string, v: unknown): string {
    if (v === undefined || v === null || v === '') return '—';
    if (type === 'checkbox' || type === 'boolean') return v === true ? 'Yes' : 'No';
    if (type === 'passfail') return PASS_FAIL_LABEL[String(v)] ?? String(v);
    if (Array.isArray(v)) return v.map(String).join(', ') || '—';
    return String(v);
}

export function buildCertificateModel(src: CertificateSource, images: ImageMap): CertificateModel {
    const settings = normalizeCompanySettings(src.company.settings);
    const tz = resolveTimeZone(settings.regional?.timezone);
    const locale = settings.regional?.locale ?? 'en-ZA';
    const schema = schemaForSubmission(src.submission.data, src.liveSchema);
    const answers = readAnswers(src.submission.data);
    const meta = readMeta(src.submission.data);
    const templateName = meta.template?.name ?? src.templateName;

    // Never fall back to the tech's email: this document goes to the customer.
    const techName = [src.technician?.firstName, src.technician?.lastName].filter(Boolean).join(' ') || 'Technician';
    const registeredPerson = answerForRole(schema, answers, 'registeredPerson');

    const contact = settings.contact ?? {};
    const companyLines = [
        settings.billing?.companyRegistrationNumber ? `Reg no: ${settings.billing.companyRegistrationNumber}` : null,
        contact.phone ? String(contact.phone) : null,
        contact.email ? String(contact.email) : null,
        contact.website ? String(contact.website) : null,
    ].filter((l): l is string => Boolean(l));

    const details: CertificateModel['details'] = [
        { label: 'Customer', value: src.customer?.name ?? '—' },
        { label: 'Site address', value: formatAddress(src.property) },
        { label: 'Job reference', value: src.job ? `${jobReference(src.job.id)} · ${src.job.title}` : '—' },
        { label: 'Date', value: formatDateTimeInTimeZone(src.submission.createdAt, tz, locale) },
    ];

    const sections: CertificateSection[] = [];
    let current: CertificateSection = { title: null, items: [] };
    const pushCurrent = () => {
        if (current.title || current.items.length) sections.push(current);
    };

    schema.fields.forEach((field, index) => {
        const key = fieldKey(field, index);
        const v = answers[key];
        switch (field.type) {
            case 'section':
                pushCurrent();
                current = { title: field.label, items: field.help ? [{ kind: 'text', text: field.help }] : [] };
                return;
            case 'table': {
                const columns = field.columns ?? [];
                const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
                current.items.push({
                    kind: 'table',
                    label: field.label,
                    columns: columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label)),
                    rows: rows.map((row) => columns.map((c) => displayValue(c.type, row?.[c.key]))),
                });
                return;
            }
            case 'photo': {
                const list = Array.isArray(v) ? (v as StoredPhoto[]) : [];
                const embedded: Buffer[] = [];
                list.forEach((_, i) => {
                    const img = images.get(imageKey(key, i));
                    if (img) embedded.push(img);
                });
                current.items.push({ kind: 'photos', label: field.label, images: embedded, missing: list.length - embedded.length });
                return;
            }
            case 'signature':
                current.items.push({ kind: 'signature', label: field.label, image: images.get(imageKey(key, 0)) ?? null });
                return;
            default: {
                const value = displayValue(field.type, v);
                const unit = field.unit && value !== '—' ? ` ${field.unit}` : '';
                const tone = field.type === 'passfail' && (v === 'pass' || v === 'fail') ? v : undefined;
                current.items.push({ kind: 'value', label: field.label, value: `${value}${unit}`, tone });
            }
        }
    });
    pushCurrent();

    // Free-form (legacy) submissions with no field definitions: list raw answers.
    if (schema.fields.length === 0) {
        sections.push({
            title: null,
            items: Object.entries(answers).map(([k, val]) => ({
                kind: 'value' as const,
                label: k.replace(/_/g, ' '),
                value: typeof val === 'boolean' ? (val ? 'Yes' : 'No') : typeof val === 'object' ? '—' : String(val ?? '—'),
            })),
        });
        const legacySig = images.get(imageKey('__signature', 0));
        if (legacySig) sections.push({ title: null, items: [{ kind: 'signature', label: 'Signature', image: legacySig }] });
    }

    return {
        title: schema.certificateTitle || templateName,
        isRecord: schema.kind === 'record' || Boolean(schema.requiresCoc),
        certificateNumber: answerForRole(schema, answers, 'certificateNumber'),
        company: { name: src.company.name, lines: companyLines },
        details,
        sections,
        issuedBy: {
            name: registeredPerson ?? techName,
            registrationNumber: answerForRole(schema, answers, 'registrationNumber'),
            registrationCategory: answerForRole(schema, answers, 'registrationCategory'),
        },
        footer: `Generated by ${src.company.name} via Fieldio · ${formatDateInTimeZone(new Date(), tz, locale)}`,
    };
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

const IMAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const isPdfImage = (b: Buffer) =>
    (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);

function decodeDataUrl(dataUrl: string): Buffer | null {
    const m = /^data:image\/(?:png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const buf = Buffer.from(m[1], 'base64');
    return isPdfImage(buf) ? buf : null;
}

/** Fetch a stored job photo. URLs here come from our own JobPhoto rows only. */
async function fetchImage(url: string): Promise<Buffer | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
        if (!res.ok) return null;
        const len = Number(res.headers.get('content-length') ?? 0);
        if (len > MAX_IMAGE_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES || !isPdfImage(buf)) return null;
        return buf;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Certificate photo fetch failed');
        return null;
    }
}

/**
 * Load every photo + signature image a submission references (failures are
 * skipped). Photo URLs are never taken from the stored answers: each photoId is
 * re-resolved against this job's JobPhoto rows (tenant-scoped), so the server
 * only ever fetches URLs our own upload path wrote.
 */
export async function loadCertificateImages(
    submission: { data: unknown; signatureUrl?: string | null; jobId?: string | null; companyId: string },
    liveSchema: unknown,
): Promise<ImageMap> {
    const { data, signatureUrl } = submission;
    const schema = schemaForSubmission(data, liveSchema);
    const answers = readAnswers(data);
    const images: ImageMap = new Map();
    const jobs: Array<Promise<void>> = [];

    const photoIds = schema.fields.flatMap((field, index) => {
        const v = answers[fieldKey(field, index)];
        return field.type === 'photo' && Array.isArray(v)
            ? (v as StoredPhoto[]).map((p) => p?.photoId).filter((id): id is string => typeof id === 'string')
            : [];
    });
    const rows =
        photoIds.length > 0 && submission.jobId
            ? await prisma.jobPhoto.findMany({
                  where: { id: { in: Array.from(new Set(photoIds)) }, jobId: submission.jobId, companyId: submission.companyId },
                  select: { id: true, url: true, thumbnailUrl: true },
              })
            : [];
    const photoUrl = new Map(rows.map((r) => [r.id, r.thumbnailUrl || r.url]));

    schema.fields.forEach((field, index) => {
        const key = fieldKey(field, index);
        const v = answers[key];
        if (field.type === 'photo' && Array.isArray(v)) {
            (v as StoredPhoto[]).forEach((p, i) => {
                jobs.push(
                    (async () => {
                        const url = p?.photoId ? photoUrl.get(p.photoId) : undefined;
                        const buf = p?.dataUrl ? decodeDataUrl(p.dataUrl) : url ? await fetchImage(url) : null;
                        if (buf) images.set(imageKey(key, i), buf);
                    })(),
                );
            });
        }
        if (field.type === 'signature' && typeof v === 'string') {
            const buf = decodeDataUrl(v);
            if (buf) images.set(imageKey(key, 0), buf);
        }
    });
    if (schema.fields.length === 0 && signatureUrl) {
        const buf = decodeDataUrl(signatureUrl);
        if (buf) images.set(imageKey('__signature', 0), buf);
    }

    await Promise.all(jobs);
    return images;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;
const CONTENT_BOTTOM = 770;
const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e2e8f0';

// The built-in PDF fonts only cover WinAnsi; map the symbols our templates use.
function pdfText(s: string): string {
    return s
        .replace(/Ω/g, 'ohm')
        .replace(/[→]/g, '->')
        .replace(/[✓✔]/g, 'Yes')
        .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
}

export function renderCertificatePdf(model: CertificateModel): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: pdfText(model.title) } });
        doc.on('data', (c) => chunks.push(c as Buffer));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const ensureSpace = (height: number) => {
            if (doc.y + height > CONTENT_BOTTOM) {
                doc.addPage();
                doc.y = 50;
            }
        };

        // --- Header: company (left), certificate number (right) ---
        doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(pdfText(model.company.name), LEFT, 50, { width: 300 });
        doc.font('Helvetica').fontSize(9).fillColor(MUTED);
        for (const line of model.company.lines) doc.text(pdfText(line), { width: 300 });
        const leftBottom = doc.y;

        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Certificate no.', 330, 52, { width: 215, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(14).fillColor(INK)
            .text(pdfText(model.certificateNumber ?? 'Not recorded'), 330, doc.y + 2, { width: 215, align: 'right' });

        doc.y = Math.max(leftBottom, doc.y) + 14;
        doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(RULE).stroke();
        doc.y += 12;

        // --- Title ---
        doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(pdfText(model.title), LEFT, doc.y, { width: WIDTH });
        if (model.isRecord) {
            doc.moveDown(0.2);
            doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
                'This is the contractor’s record of the inspection and tests behind the certificate. The official ' +
                    'certificate is identified by the certificate number above.',
                { width: WIDTH },
            );
        }
        doc.moveDown(0.8);

        // --- Details grid (two columns) ---
        const colW = WIDTH / 2 - 10;
        for (let i = 0; i < model.details.length; i += 2) {
            const pair = model.details.slice(i, i + 2);
            const y = doc.y;
            let rowBottom = y;
            pair.forEach((d, j) => {
                const x = LEFT + j * (colW + 20);
                doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(pdfText(d.label.toUpperCase()), x, y, { width: colW });
                doc.font('Helvetica').fontSize(10).fillColor(INK).text(pdfText(d.value), x, doc.y + 1, { width: colW });
                rowBottom = Math.max(rowBottom, doc.y);
            });
            doc.y = rowBottom + 8;
        }

        // --- Sections ---
        const drawValue = (label: string, value: string, tone?: 'pass' | 'fail') => {
            const labelW = 230;
            const valueW = WIDTH - labelW - 10;
            doc.font('Helvetica').fontSize(9.5);
            const h = Math.max(
                doc.heightOfString(pdfText(label), { width: labelW }),
                doc.heightOfString(pdfText(value), { width: valueW }),
            );
            ensureSpace(h + 6);
            const y = doc.y;
            doc.fillColor(MUTED).text(pdfText(label), LEFT, y, { width: labelW });
            doc.font(tone ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor(tone === 'fail' ? '#b91c1c' : tone === 'pass' ? '#047857' : INK)
                .text(pdfText(value), LEFT + labelW + 10, y, { width: valueW });
            doc.y = y + h + 5;
        };

        const drawTable = (label: string, columns: string[], rows: string[][]) => {
            ensureSpace(60);
            doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(pdfText(label), LEFT, doc.y, { width: WIDTH });
            doc.y += 4;
            if (rows.length === 0) {
                doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No rows recorded.', LEFT, doc.y);
                doc.y += 6;
                return;
            }
            const n = Math.max(columns.length, 1);
            const cellW = WIDTH / n;
            const fontSize = n > 6 ? 7 : 8.5;
            const pad = 3;
            const rowHeight = (cells: string[], bold: boolean) => {
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
                return Math.max(...cells.map((c) => doc.heightOfString(pdfText(c), { width: cellW - pad * 2 }))) + pad * 2;
            };
            const drawRow = (cells: string[], bold: boolean, shade: boolean) => {
                const h = rowHeight(cells, bold);
                const y = doc.y;
                if (shade) doc.rect(LEFT, y, WIDTH, h).fill('#f1f5f9');
                cells.forEach((c, i) => {
                    const x = LEFT + i * cellW;
                    const fail = !bold && c === 'Fail';
                    doc.font(bold || fail ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
                        .fillColor(fail ? '#b91c1c' : bold ? '#334155' : INK)
                        .text(pdfText(c), x + pad, y + pad, { width: cellW - pad * 2 });
                });
                doc.rect(LEFT, y, WIDTH, h).strokeColor(RULE).lineWidth(0.5).stroke();
                for (let i = 1; i < n; i += 1) {
                    doc.moveTo(LEFT + i * cellW, y).lineTo(LEFT + i * cellW, y + h).strokeColor(RULE).stroke();
                }
                doc.y = y + h;
            };

            drawRow(columns, true, true);
            for (const row of rows) {
                if (doc.y + rowHeight(row, false) > CONTENT_BOTTOM) {
                    doc.addPage();
                    doc.y = 50;
                    drawRow(columns, true, true); // repeat the header on a new page
                }
                drawRow(row, false, false);
            }
            doc.lineWidth(1);
            doc.y += 10;
        };

        const drawPhotos = (label: string, images: Buffer[], missing: number) => {
            const boxW = (WIDTH - 15) / 2;
            const boxH = 170;
            // Keep the label on the same page as its first row of photos.
            ensureSpace(images.length > 0 ? boxH + 26 : 40);
            doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(pdfText(label), LEFT, doc.y, { width: WIDTH });
            doc.y += 4;
            if (images.length === 0) {
                doc.font('Helvetica').fontSize(9).fillColor(INK)
                    .text(missing > 0 ? `${missing} photo(s) on file in the job record.` : 'No photo.', LEFT, doc.y);
                doc.y += 6;
                return;
            }
            for (let i = 0; i < images.length; i += 2) {
                ensureSpace(boxH + 10);
                const y = doc.y;
                images.slice(i, i + 2).forEach((img, j) => {
                    const x = LEFT + j * (boxW + 15);
                    try {
                        doc.image(img, x, y, { fit: [boxW, boxH], align: 'center', valign: 'center' });
                    } catch {
                        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Image could not be embedded', x, y + 4, { width: boxW });
                    }
                    doc.rect(x, y, boxW, boxH).strokeColor(RULE).stroke();
                });
                doc.y = y + boxH + 8;
            }
            if (missing > 0) {
                doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`${missing} more photo(s) on file in the job record.`, LEFT, doc.y);
                doc.y += 4;
            }
        };

        const drawSignature = (label: string, image: Buffer | null) => {
            ensureSpace(100);
            doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(pdfText(label), LEFT, doc.y, { width: WIDTH });
            doc.y += 4;
            const y = doc.y;
            if (image) {
                try {
                    doc.image(image, LEFT, y, { fit: [220, 80] });
                } catch {
                    doc.font('Helvetica').fontSize(9).fillColor(INK).text('Signed (image unavailable)', LEFT, y);
                }
            } else {
                doc.font('Helvetica').fontSize(9).fillColor(INK).text('Not signed', LEFT, y);
            }
            doc.moveTo(LEFT, y + 84).lineTo(LEFT + 220, y + 84).strokeColor('#94a3b8').stroke();
            doc.y = y + 92;
        };

        for (const section of model.sections) {
            if (section.title) {
                ensureSpace(50);
                doc.y += 6;
                doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(pdfText(section.title), LEFT, doc.y, { width: WIDTH });
                doc.y += 2;
                doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(RULE).stroke();
                doc.y += 6;
            }
            for (const item of section.items) {
                if (item.kind === 'value') drawValue(item.label, item.value, item.tone);
                else if (item.kind === 'text') {
                    doc.font('Helvetica').fontSize(9);
                    const h = doc.heightOfString(pdfText(item.text), { width: WIDTH - 16 });
                    ensureSpace(h + 16);
                    const y = doc.y;
                    doc.rect(LEFT, y, WIDTH, h + 12).fill('#f8fafc');
                    doc.fillColor('#334155').text(pdfText(item.text), LEFT + 8, y + 6, { width: WIDTH - 16 });
                    doc.y = y + h + 18;
                } else if (item.kind === 'table') drawTable(item.label, item.columns, item.rows);
                else if (item.kind === 'photos') drawPhotos(item.label, item.images, item.missing);
                else drawSignature(item.label, item.image);
            }
        }

        // --- Issued by ---
        ensureSpace(60);
        doc.y += 10;
        doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(RULE).stroke();
        doc.y += 8;
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('ISSUED BY', LEFT, doc.y);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(pdfText(model.issuedBy.name), LEFT, doc.y + 1, { width: WIDTH });
        const reg = [
            model.issuedBy.registrationCategory,
            model.issuedBy.registrationNumber ? `Registration no. ${model.issuedBy.registrationNumber}` : null,
        ].filter(Boolean).join(' · ');
        if (reg) doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(pdfText(reg), LEFT, doc.y, { width: WIDTH });

        // --- Footer on every page ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i += 1) {
            doc.switchToPage(i);
            const bottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0; // writing below the margin must not add a page
            doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8').text(
                pdfText(`${model.footer} · Page ${i - range.start + 1} of ${range.count}`),
                LEFT,
                805,
                { width: WIDTH, align: 'center', lineBreak: false },
            );
            doc.page.margins.bottom = bottom;
        }

        doc.end();
    });
}

// ---------------------------------------------------------------------------
// Loading a submission for rendering
// ---------------------------------------------------------------------------

/** Everything needed to render, read tenant-scoped. 404 when not in this company. */
export async function loadCertificateSource(submissionId: string, companyId: string) {
    const submission = await prisma.digitalFormSubmission.findFirst({ where: { id: submissionId, companyId } });
    if (!submission) throw new AppError('Form submission not found', StatusCodes.NOT_FOUND);

    const [template, company, job, technician] = await Promise.all([
        prisma.digitalFormTemplate.findFirst({ where: { id: submission.templateId, companyId } }),
        prisma.company.findFirst({ where: { id: companyId } }),
        submission.jobId
            ? prisma.job.findFirst({
                  where: { id: submission.jobId, companyId },
                  select: { id: true, title: true, customerId: true, propertyId: true },
              })
            : Promise.resolve(null),
        prisma.user.findFirst({
            where: { id: submission.userId, companyId },
            select: { firstName: true, lastName: true, email: true },
        }),
    ]);

    const customerId = submission.customerId ?? job?.customerId ?? null;
    const [customer, property] = await Promise.all([
        customerId
            ? prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true, name: true, email: true, phone: true } })
            : Promise.resolve(null),
        job?.propertyId
            ? prisma.property.findFirst({
                  where: { id: job.propertyId, companyId },
                  select: { addressLine1: true, addressLine2: true, city: true, state: true, zip: true },
              })
            : Promise.resolve(null),
    ]);

    const source: CertificateSource = {
        submission,
        templateName: template?.name ?? 'Form',
        liveSchema: template?.schema ?? {},
        company: { name: company?.name ?? '', settings: company?.settings ?? null },
        job: job ? { id: job.id, title: job.title } : null,
        customer: customer ? { name: customer.name } : null,
        property,
        technician,
    };
    return { source, submission, customer, job };
}

const safeFileName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'certificate';

/** Render a stored submission as its certificate PDF. */
export async function generateCertificatePdf(source: CertificateSource) {
    const images = await loadCertificateImages(source.submission, source.liveSchema);
    const model = buildCertificateModel(source, images);
    const buffer = await renderCertificatePdf(model);
    const fileName = `${safeFileName(model.certificateNumber ? `CoC-${model.certificateNumber}` : `certificate-${source.submission.id.slice(0, 8)}`)}.pdf`;
    return { buffer, fileName, model };
}
