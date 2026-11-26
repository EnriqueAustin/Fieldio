import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { buildCertificateModel, loadCertificateSource } from '../src/modules/digital-forms/coc-pdf.service';
import { emailService } from '../src/services/notifications/email.service';
import { COC_LIBRARY } from '../src/modules/digital-forms/coc-library';
import { normalizeTemplateSchema } from '../src/modules/digital-forms/form-schema';
import { buildCertificateAttachments } from '../src/modules/digital-forms/coc-delivery.service';
import { publicCertificatesRouter } from '../src/routes/digitalForms';
import { errorHandler } from '../src/middleware/error';

const app = buildTestApp();
const COMPANY = 'company_1';
const TECH = 'user_test';
const OTHER_TECH = 'user_other';

const JOB = '11111111-1111-1111-1111-111111111111';
const TPL = '44444444-4444-4444-4444-444444444444';
const CUSTOMER = '55555555-5555-5555-5555-555555555555';
const PROPERTY = '66666666-6666-6666-6666-666666666666';

// 1x1 PNG — small enough for every data-URL cap, valid for pdfkit.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

const COC_SCHEMA = {
    requiresCoc: true,
    kind: 'record',
    certificateTitle: 'Electrical CoC record',
    fields: [
        { key: 'section_install', type: 'section', label: 'Installation' },
        { key: 'coc_number', type: 'text', label: 'CoC serial number', required: true, role: 'certificateNumber' },
        { key: 'reg_no', type: 'text', label: 'Registration number', role: 'registrationNumber' },
        { key: 'main_switch', type: 'number', label: 'Main switch', unit: 'A' },
        { key: 'bonding', type: 'passfail', label: 'Main bonding', required: true },
        {
            key: 'tests',
            type: 'table',
            label: 'Test results',
            required: true,
            minRows: 1,
            columns: [
                { key: 'circuit', label: 'Circuit', type: 'text', required: true },
                { key: 'ir', label: 'Insulation resistance', type: 'number', unit: 'MΩ' },
                { key: 'result', label: 'Result', type: 'passfail', required: true },
            ],
        },
        { key: 'photos', type: 'photo', label: 'DB board', required: true, minCount: 2, maxCount: 3 },
        { key: 'signature', type: 'signature', label: 'Signature', required: true },
    ],
};

const validAnswers = (overrides: Record<string, unknown> = {}) => ({
    coc_number: 'E123456',
    reg_no: 'IE-998877',
    main_switch: '63',
    bonding: 'pass',
    tests: [
        { circuit: '1', ir: '12,5', result: 'pass' },
        { circuit: '', ir: '', result: '' }, // an empty row the tech added and left blank
    ],
    photos: [{ photoId: 'photo_1' }, { dataUrl: PNG_DATA_URL }],
    signature: PNG_DATA_URL,
    smuggled: 'dropped',
    __meta: { publicToken: 'attacker-chosen' },
    ...overrides,
});

function seedBase(opts: { canIssueCoC?: boolean; customer?: Record<string, unknown> } = {}) {
    fakePrisma.company.seed([{ id: COMPANY, name: 'Mthembu Electrical', settings: { contact: { phone: '021 555 0100' } } }]);
    fakePrisma.customer.seed([
        { id: CUSTOMER, companyId: COMPANY, name: 'Thandi Nkosi', email: 'thandi@example.test', phone: '+27821234567', ...opts.customer },
    ]);
    fakePrisma.property.seed([
        { id: PROPERTY, companyId: COMPANY, customerId: CUSTOMER, addressLine1: '12 Long St', city: 'Cape Town', state: 'WC', zip: '8001' },
    ]);
    fakePrisma.job.seed([
        {
            id: JOB, companyId: COMPANY, techId: TECH, vanId: null, status: 'ON_SITE', title: 'DB board upgrade',
            customerId: CUSTOMER, propertyId: PROPERTY,
            lineItems: [{ id: 'li_1', name: 'RCD', quantity: 1, unitPrice: 450, total: 450 }],
        },
    ]);
    fakePrisma.jobPhoto.seed([
        { id: 'photo_1', jobId: JOB, companyId: COMPANY, url: 'https://cdn.test/p1.jpg', thumbnailUrl: 'https://cdn.test/p1-thumb.jpg' },
        { id: 'photo_elsewhere', jobId: 'another-job', companyId: COMPANY, url: 'https://cdn.test/x.jpg', thumbnailUrl: null },
    ]);
    fakePrisma.digitalFormTemplate.seed([
        { id: TPL, companyId: COMPANY, name: 'Electrical CoC', description: null, active: true, schema: COC_SCHEMA },
    ]);
    fakePrisma.user.seed([
        { id: TECH, companyId: COMPANY, firstName: 'Sipho', lastName: 'Dlamini', email: 'sipho@example.test', permissions: { canIssueCoC: opts.canIssueCoC ?? true } },
        { id: OTHER_TECH, companyId: COMPANY, firstName: 'Other', lastName: 'Tech', permissions: {} },
    ]);
}

const submit = (data: Record<string, unknown>, userId = TECH) =>
    request(app)
        .post('/digital-forms/submissions')
        .set('Authorization', authHeader({ role: 'TECHNICIAN', userId }))
        .send({ templateId: TPL, jobId: JOB, data });

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const getPdf = (path: string, auth?: string, target: express.Express = app) => {
    const req = request(target).get(path).buffer(true).parse(binary);
    return auth ? req.set('Authorization', auth) : req;
};

// The public certificate router is mounted at /public/certificates in server.ts
// (behind publicEndpointLimiter); the shared test app doesn't mount it, so mirror it here.
const publicApp = express();
publicApp.use('/public/certificates', publicCertificatesRouter);
publicApp.use(errorHandler);

async function submitValid() {
    const res = await submit(validAnswers());
    expect(res.status).toBe(201);
    return res.body.data.submission.id as string;
}

const fetchMock = vi.fn(async () => new Response(Buffer.from(PNG_B64, 'base64'), { status: 200 }));

beforeEach(() => {
    fakePrisma.$reset();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('POST /digital-forms/submissions — validation against the template', () => {
    it('accepts a complete submission and stores only cleaned template answers', async () => {
        seedBase();
        const id = await submitValid();
        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });

        expect(row.data.smuggled).toBeUndefined();
        expect(row.data.main_switch).toBe(63);
        // Blank rows are dropped; the SA decimal comma parses.
        expect(row.data.tests).toEqual([{ circuit: '1', ir: 12.5, result: 'pass' }]);
        // Photo URLs come from the job's photo row, not the client.
        expect(row.data.photos[0]).toEqual({ photoId: 'photo_1', url: 'https://cdn.test/p1.jpg', thumbnailUrl: 'https://cdn.test/p1-thumb.jpg' });
        // The client can't write server metadata.
        expect(row.data.__meta.publicToken).toBeUndefined();
        // Customer is linked from the job so it can be sent.
        expect(row.customerId).toBe(CUSTOMER);
        expect(row.signatureUrl).toBe(PNG_DATA_URL);
    });

    it('rejects a missing required field', async () => {
        seedBase();
        const res = await submit(validAnswers({ coc_number: '' }));
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/CoC serial number/);
        expect(await fakePrisma.digitalFormSubmission.count()).toBe(0);
    });

    it('rejects a table with no filled rows and a non-numeric cell', async () => {
        seedBase();
        const empty = await submit(validAnswers({ tests: [{ circuit: '', ir: '', result: '' }] }));
        expect(empty.status).toBe(400);
        expect(empty.body.message).toMatch(/Test results.*at least 1 row/);

        const bad = await submit(validAnswers({ tests: [{ circuit: '1', ir: 'lots', result: 'pass' }] }));
        expect(bad.status).toBe(400);
        expect(bad.body.message).toMatch(/row 1.*Insulation resistance.*number/);

        const missingCell = await submit(validAnswers({ tests: [{ circuit: '2', ir: '5' }] }));
        expect(missingCell.status).toBe(400);
        expect(missingCell.body.message).toMatch(/row 1.*Result.*required/);
    });

    it('enforces photo min/max counts', async () => {
        seedBase();
        const tooFew = await submit(validAnswers({ photos: [{ photoId: 'photo_1' }] }));
        expect(tooFew.status).toBe(400);
        expect(tooFew.body.message).toMatch(/DB board.*at least 2 photos/);

        const tooMany = await submit(validAnswers({ photos: Array(4).fill({ dataUrl: PNG_DATA_URL }) }));
        expect(tooMany.status).toBe(400);
        expect(tooMany.body.message).toMatch(/at most 3/);
    });

    it("rejects a photo id that isn't on this job, and a non-image data URL", async () => {
        seedBase();
        const foreign = await submit(validAnswers({ photos: [{ photoId: 'photo_elsewhere' }, { photoId: 'photo_1' }] }));
        expect(foreign.status).toBe(400);
        expect(foreign.body.message).toMatch(/isn't on this job/);

        const notImage = await submit(validAnswers({ photos: [{ dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, { photoId: 'photo_1' }] }));
        expect(notImage.status).toBe(400);
    });

    it('rejects a bad pass/fail value and a signature that is not an image', async () => {
        seedBase();
        const res = await submit(validAnswers({ bonding: 'maybe', signature: 'https://evil.test/sig.png' }));
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Main bonding/);
        expect(res.body.message).toMatch(/Signature/);
    });

    it('still blocks CoC submission without canIssueCoC', async () => {
        seedBase({ canIssueCoC: false });
        const res = await submit(validAnswers());
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Certificates of Compliance/);
    });
});

describe('schema snapshot + template editing', () => {
    it('snapshots the schema on submit so a later PATCH does not change the old certificate', async () => {
        seedBase();
        const id = await submitValid();

        const edited = {
            ...COC_SCHEMA,
            fields: COC_SCHEMA.fields.map((f) => (f.key === 'coc_number' ? { ...f, label: 'Renamed number' } : f)),
        };
        const patch = await request(app)
            .patch(`/digital-forms/templates/${TPL}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ name: 'Electrical CoC v2', schema: edited });
        expect(patch.status).toBe(200);
        expect(patch.body.data.template.name).toBe('Electrical CoC v2');

        const detail = await request(app)
            .get(`/digital-forms/submissions/${id}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(detail.status).toBe(200);
        const snapField = detail.body.data.submission.templateSnapshot.schema.fields.find((f: any) => f.key === 'coc_number');
        expect(snapField.label).toBe('CoC serial number');
        expect(detail.body.data.submission.templateSnapshot.name).toBe('Electrical CoC');
        expect(detail.body.data.submission.certificateNumber).toBe('E123456');

        // The PDF is rendered from the snapshot, not the edited template.
        const { source } = await loadCertificateSource(id, COMPANY);
        const model = buildCertificateModel(source, new Map());
        const labels = model.sections.flatMap((s) => s.items).map((i: any) => i.label);
        expect(labels).toContain('CoC serial number');
        expect(labels).not.toContain('Renamed number');
    });

    it('validates a full template edit (duplicate keys, table without columns)', async () => {
        seedBase();
        const dup = await request(app)
            .patch(`/digital-forms/templates/${TPL}`)
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ schema: { fields: [{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }] } });
        expect(dup.status).toBe(400);

        const noCols = await request(app)
            .patch(`/digital-forms/templates/${TPL}`)
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ schema: { fields: [{ key: 't', label: 'Tests', type: 'table', columns: [] }] } });
        expect(noCols.status).toBe(400);
    });

    it('folds legacy `name` field ids into `key` on save', async () => {
        seedBase();
        const res = await request(app)
            .patch(`/digital-forms/templates/${TPL}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ schema: { fields: [{ name: 'geyserType', label: 'Geyser type', type: 'text' }] } });
        expect(res.status).toBe(200);
        expect(res.body.data.template.schema.fields[0]).toMatchObject({ key: 'geyserType', label: 'Geyser type' });
        expect(res.body.data.template.schema.fields[0].name).toBeUndefined();
    });
});

describe('CoC library', () => {
    it('lists both starter records and adds one in a click as a restricted CoC', async () => {
        const list = await request(app).get('/digital-forms/library').set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(list.status).toBe(200);
        expect(list.body.data.library.map((l: any) => l.key)).toEqual(['electrical-coc-record', 'plumbing-geyser-coc-record']);

        const add = await request(app)
            .post('/digital-forms/library/plumbing-geyser-coc-record')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(add.status).toBe(201);
        expect(add.body.data.template.schema.requiresCoc).toBe(true);
        expect(add.body.data.template.schema.kind).toBe('record');
    });

    it('library templates pass their own schema validation', () => {
        for (const t of COC_LIBRARY) expect(() => normalizeTemplateSchema(t.schema)).not.toThrow();
    });

    it('is office-only', async () => {
        const res = await request(app)
            .post('/digital-forms/library/electrical-coc-record')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));
        expect(res.status).toBe(403);
    });
});

describe('GET /digital-forms/submissions/:id/pdf', () => {
    it('returns a PDF to office roles and embeds the stored job photo thumbnail', async () => {
        seedBase();
        const id = await submitValid();
        const res = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/pdf/);
        expect(res.headers['content-disposition']).toMatch(/CoC-E123456\.pdf/);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
        expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/p1-thumb.jpg', expect.anything());
    });

    it('lets the submitting tech download it, but not another tech', async () => {
        seedBase();
        const id = await submitValid();

        const own = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'TECHNICIAN', userId: TECH }));
        expect(own.status).toBe(200);

        const other = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'TECHNICIAN', userId: OTHER_TECH }));
        expect(other.status).toBe(403);

        const accountant = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'ACCOUNTANT' }));
        expect(accountant.status).toBe(403);
    });

    it('404s for another company', async () => {
        seedBase();
        const id = await submitValid();
        const res = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'ADMIN', companyId: 'other_co' }));
        expect(res.status).toBe(404);
    });
});

describe('POST /digital-forms/submissions/:id/send', () => {
    it('emails + WhatsApps a public link, records sentAt, and the link serves the PDF', async () => {
        seedBase();
        const id = await submitValid();
        const sendWithFiles = vi.spyOn(emailService, 'sendRawWithAttachments');

        const res = await request(app)
            .post(`/digital-forms/submissions/${id}/send`)
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.data.channels).toEqual(['email', 'whatsapp']);
        expect(res.body.data.sentTo.email).toBe('t***@example.test');

        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        expect(typeof row.data.__meta.sentAt).toBe('string');
        expect(row.pdfUrl).toMatch(/^http:\/\/localhost:3001\/public\/certificates\/.+\/pdf$/);

        // The email carries the PDF as an attachment and keeps the link.
        const [, , body, attachments] = sendWithFiles.mock.calls[0];
        expect(body).toContain(row.pdfUrl);
        expect(attachments).toHaveLength(1);
        expect(attachments[0].filename).toBe('CoC-E123456.pdf');
        expect(attachments[0].contentType).toBe('application/pdf');
        expect(attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');

        const list = await request(app).get('/digital-forms/submissions').set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(list.body.data.submissions[0].sentAt).toBe(row.data.__meta.sentAt);
        // Server metadata is split out of the answers; the token only travels inside the office's link.
        expect(list.body.data.submissions[0].data.__meta).toBeUndefined();
        expect(list.body.data.submissions[0].pdfUrl).toBe(row.pdfUrl);

        const path = new URL(row.pdfUrl).pathname;
        const pub = await getPdf(path, undefined, publicApp);
        expect(pub.status).toBe(200);
        expect(pub.headers['content-type']).toMatch(/application\/pdf/);

        const forged = await getPdf(path.replace(/\.[0-9a-f]{48}\//, `.${'0'.repeat(48)}/`), undefined, publicApp);
        expect(forged.status).toBe(404);
    });

    it('400s when the customer has no email or phone', async () => {
        seedBase({ customer: { email: null, phone: null } });
        const id = await submitValid();
        const res = await request(app)
            .post(`/digital-forms/submissions/${id}/send`)
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({});
        expect(res.status).toBe(400);
        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        expect(row.data.__meta.sentAt).toBeUndefined();
    });

    it('is not available to technicians or other companies', async () => {
        seedBase();
        const id = await submitValid();
        const tech = await request(app)
            .post(`/digital-forms/submissions/${id}/send`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});
        expect(tech.status).toBe(403);

        const other = await request(app)
            .post(`/digital-forms/submissions/${id}/send`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'other_co' }))
            .send({});
        expect(other.status).toBe(404);
    });
});

describe('no prices on certificates', () => {
    it('keeps pricing out of the certificate model and the submission payloads', async () => {
        seedBase();
        const id = await submitValid();
        const { source } = await loadCertificateSource(id, COMPANY);
        const model = buildCertificateModel(source, new Map());
        const modelJson = JSON.stringify(model);
        expect(modelJson).not.toMatch(/price|unitPrice|total|450/i);
        expect(model.certificateNumber).toBe('E123456');
        expect(model.issuedBy.registrationNumber).toBe('IE-998877');
        expect(model.footer).toMatch(/^Generated by Mthembu Electrical via Fieldio/);

        const forms = await request(app)
            .get(`/digital-forms/jobs/${JOB}/forms`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));
        expect(JSON.stringify(forms.body)).not.toMatch(/unitPrice|"total"/);
    });
});

describe('job summary includes certificates', () => {
    // The fake resolves `include` from nested values, so give the job its relations inline.
    const inlineJobRelations = () => {
        const jobRow = fakePrisma.job.rows.find((r: any) => r.id === JOB);
        Object.assign(jobRow, {
            customer: { name: 'Thandi Nkosi', email: 'thandi@example.test', phone: null },
            property: { addressLine1: '12 Long St', city: 'Cape Town' },
            checklist: [], photos: [], signatures: [], tech: null,
        });
    };

    it('attaches + links each certificate in the summary email and records the delivery', async () => {
        seedBase();
        const id = await submitValid();
        inlineJobRelations();
        const sendWithFiles = vi.spyOn(emailService, 'sendRawWithAttachments');

        const { jobSummaryService } = await import('../src/modules/jobs/summary-pdf.service');
        await jobSummaryService.generateAndSend(JOB, COMPANY, { email: true });

        const [, , body, attachments] = sendWithFiles.mock.calls[0];
        expect(body).toMatch(/Your certificates:/);
        expect(body).toMatch(/Electrical CoC record \(no\. E123456\): http:\/\/localhost:3001\/public\/certificates\//);
        expect(attachments.map((a) => a.filename)).toEqual(['CoC-E123456.pdf']);

        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        expect(row.data.__meta.sentChannels).toEqual(['summary:email']);
    });

    it('falls back to links only when the PDFs exceed the attachment budget', async () => {
        seedBase();
        const id = await submitValid();
        expect(await buildCertificateAttachments([id], COMPANY, 100)).toBeNull();
        const within = await buildCertificateAttachments([id], COMPANY);
        expect(within).toHaveLength(1);
    });
});

describe('review fixes', () => {
    const TPL_INTERNAL = '77777777-7777-4777-8777-777777777777';
    const OTHER_CUSTOMER = '88888888-8888-4888-8888-888888888888';

    const seedInternal = () =>
        fakePrisma.digitalFormTemplate.seed([
            {
                id: TPL_INTERNAL, companyId: COMPANY, name: 'Site Safety Assessment', description: null, active: true,
                schema: { fields: [{ key: 'thermostat_ok', label: 'Thermostat working correctly', type: 'boolean', required: true }] },
            },
        ]);

    const submitInternal = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
        request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ templateId: TPL_INTERNAL, jobId: JOB, data, ...extra });

    it('treats a required Yes/No question as answered when the answer is No', async () => {
        seedBase();
        seedInternal();
        const no = await submitInternal({ thermostat_ok: false });
        expect(no.status).toBe(201);
        expect(no.body.data.submission.data.thermostat_ok).toBe(false);

        const unanswered = await submitInternal({});
        expect(unanswered.status).toBe(400);
        expect(unanswered.body.message).toMatch(/Thermostat working correctly.*required/);
    });

    it('keeps internal forms out of the customer summary and mints no link for them', async () => {
        seedBase();
        seedInternal();
        const internal = await submitInternal({ thermostat_ok: true });
        const cocId = await submitValid();
        const jobRow = fakePrisma.job.rows.find((r: any) => r.id === JOB);
        Object.assign(jobRow, {
            customer: { name: 'Thandi Nkosi', email: 'thandi@example.test', phone: null },
            property: { addressLine1: '12 Long St', city: 'Cape Town' },
            checklist: [], photos: [], signatures: [], tech: null,
        });
        const sendWithFiles = vi.spyOn(emailService, 'sendRawWithAttachments');

        const { jobSummaryService } = await import('../src/modules/jobs/summary-pdf.service');
        await jobSummaryService.generateAndSend(JOB, COMPANY, { email: true });

        const [, , body, attachments] = sendWithFiles.mock.calls[0];
        expect(body).not.toMatch(/Site Safety Assessment/);
        expect(attachments).toHaveLength(1);
        const internalRow = await fakePrisma.digitalFormSubmission.findFirst({ where: { id: internal.body.data.submission.id } });
        expect(internalRow.pdfUrl ?? null).toBeNull();
        expect(internalRow.data.__meta.sentAt).toBeUndefined();
        const cocRow = await fakePrisma.digitalFormSubmission.findFirst({ where: { id: cocId } });
        expect(cocRow.pdfUrl).toMatch(/\/public\/certificates\//);
    });

    it('does not mint links when the summary is not sent', async () => {
        seedBase();
        const id = await submitValid();
        const jobRow = fakePrisma.job.rows.find((r: any) => r.id === JOB);
        Object.assign(jobRow, {
            customer: { name: 'Thandi Nkosi', email: null, phone: null },
            property: { addressLine1: '12 Long St', city: 'Cape Town' },
            checklist: [], photos: [], signatures: [], tech: null,
        });
        const { jobSummaryService } = await import('../src/modules/jobs/summary-pdf.service');
        await jobSummaryService.generateAndSend(JOB, COMPANY, { email: true });
        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        expect(row.pdfUrl ?? null).toBeNull();
    });

    it("links the job's customer, ignoring a customerId sent by the client", async () => {
        seedBase();
        seedInternal();
        fakePrisma.customer.seed([{ id: OTHER_CUSTOMER, companyId: 'other_co', name: 'Someone else' }]);
        const res = await submitInternal({ thermostat_ok: true }, { customerId: OTHER_CUSTOMER });
        expect(res.status).toBe(201);
        expect(res.body.data.submission.customerId).toBe(CUSTOMER);

        const noJob = await request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ templateId: TPL_INTERNAL, customerId: OTHER_CUSTOMER, data: { thermostat_ok: true } });
        expect(noJob.status).toBe(404);
    });

    it('never replaces an existing link secret when two sends race', async () => {
        seedBase();
        const id = await submitValid();
        const { ensurePublicLink } = await import('../src/modules/digital-forms/coc-delivery.service');
        const row = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        const [a, b] = await Promise.all([ensurePublicLink(row), ensurePublicLink(row)]);
        expect(a).toBe(b);
        const stored = await fakePrisma.digitalFormSubmission.findFirst({ where: { id } });
        expect(stored.pdfUrl).toBe(a);
    });

    it('renders photos from the job photo rows, never from URLs stored in the answers', async () => {
        seedBase();
        const id = await submitValid();
        const row = fakePrisma.digitalFormSubmission.rows.find((r: any) => r.id === id);
        row.data.photos[0].thumbnailUrl = 'http://169.254.169.254/latest/meta-data';
        row.data.photos[0].url = 'http://169.254.169.254/latest/meta-data';

        const res = await getPdf(`/digital-forms/submissions/${id}/pdf`, authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
        const fetched = fetchMock.mock.calls.map((c: any[]) => c[0]);
        expect(fetched).toEqual(['https://cdn.test/p1-thumb.jpg']);
    });

    it('never prints the tech email as the issuer', async () => {
        seedBase();
        const id = await submitValid();
        fakePrisma.user.rows.find((u: any) => u.id === TECH).firstName = null;
        fakePrisma.user.rows.find((u: any) => u.id === TECH).lastName = null;
        const { source } = await loadCertificateSource(id, COMPANY);
        // Strip the registered-person role answer so the fallback is exercised.
        const model = buildCertificateModel({ ...source, liveSchema: {}, submission: { ...source.submission, data: {} } }, new Map());
        expect(model.issuedBy.name).toBe('Technician');
        expect(JSON.stringify(model)).not.toContain('sipho@example.test');
    });
});
