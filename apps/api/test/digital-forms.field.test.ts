import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';
const TECH = 'user_test'; // matches authHeader default userId

const JOB = '11111111-1111-1111-1111-111111111111';
const TPL_PLAIN = '22222222-2222-2222-2222-222222222222';
const TPL_COC = '33333333-3333-3333-3333-333333333333';

function seedJob(overrides: Record<string, any> = {}) {
    fakePrisma.job.seed([
        { id: JOB, companyId: COMPANY, techId: TECH, vanId: null, status: 'ON_SITE', ...overrides },
    ]);
}

function seedTemplates() {
    fakePrisma.digitalFormTemplate.seed([
        { id: TPL_PLAIN, companyId: COMPANY, name: 'Site Safety Check', active: true, schema: {} },
        { id: TPL_COC, companyId: COMPANY, name: 'Gas CoC', active: true, schema: { requiresCoc: true } },
    ]);
}

function seedUser(permissions: Record<string, unknown> = {}) {
    fakePrisma.user.seed([{ id: TECH, companyId: COMPANY, permissions }]);
}

beforeEach(() => {
    fakePrisma.$reset();
});

describe('GET /digital-forms/jobs/:jobId/forms', () => {
    it('returns templates, submissions and the CoC flag to the assigned tech', async () => {
        seedJob();
        seedTemplates();
        seedUser({ canIssueCoC: true });
        fakePrisma.digitalFormSubmission.seed([
            { id: 'sub_1', companyId: COMPANY, jobId: JOB, templateId: TPL_PLAIN, signatureUrl: null },
        ]);

        const res = await request(app)
            .get(`/digital-forms/jobs/${JOB}/forms`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        expect(res.body.data.templates).toHaveLength(2);
        expect(res.body.data.submissions).toHaveLength(1);
        expect(res.body.data.canIssueCoC).toBe(true);
    });

    it('reports canIssueCoC=false when the tech lacks the permission', async () => {
        seedJob();
        seedTemplates();
        seedUser({}); // no canIssueCoC

        const res = await request(app)
            .get(`/digital-forms/jobs/${JOB}/forms`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        expect(res.body.data.canIssueCoC).toBe(false);
    });

    it('rejects a tech who is not assigned to the job', async () => {
        seedJob({ techId: 'other_tech' });
        seedTemplates();

        const res = await request(app)
            .get(`/digital-forms/jobs/${JOB}/forms`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/assigned to you/i);
    });

    it('404s for a job in another company', async () => {
        seedJob();
        seedTemplates();

        const res = await request(app)
            .get(`/digital-forms/jobs/${JOB}/forms`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH, companyId: 'other_co' }));

        expect(res.status).toBe(404);
    });
});

describe('PATCH /digital-forms/templates/:id', () => {
    it('lets OFFICE flip requiredForCompletion on an existing template', async () => {
        fakePrisma.digitalFormTemplate.seed([
            { id: TPL_PLAIN, companyId: COMPANY, name: 'Site Safety Check', active: true, schema: { fields: [] } },
        ]);

        const res = await request(app)
            .patch(`/digital-forms/templates/${TPL_PLAIN}`)
            .set('Authorization', authHeader({ role: 'OFFICE' }))
            .send({ schema: { fields: [], requiredForCompletion: true } });

        expect(res.status).toBe(200);
        expect(res.body.data.template.schema.requiredForCompletion).toBe(true);

        const tpl = await fakePrisma.digitalFormTemplate.findFirst({ where: { id: TPL_PLAIN } });
        expect((tpl.schema as any).requiredForCompletion).toBe(true);
    });

    it('forbids a TECHNICIAN from editing templates', async () => {
        fakePrisma.digitalFormTemplate.seed([
            { id: TPL_PLAIN, companyId: COMPANY, name: 'Site Safety Check', active: true, schema: { fields: [] } },
        ]);

        const res = await request(app)
            .patch(`/digital-forms/templates/${TPL_PLAIN}`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ active: false });

        expect(res.status).toBe(403);
    });

    it('404s when the template is in another company', async () => {
        fakePrisma.digitalFormTemplate.seed([
            { id: TPL_PLAIN, companyId: COMPANY, name: 'Site Safety Check', active: true, schema: { fields: [] } },
        ]);

        const res = await request(app)
            .patch(`/digital-forms/templates/${TPL_PLAIN}`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'other_co' }))
            .send({ active: false });

        expect(res.status).toBe(404);
    });
});

describe('POST /digital-forms/submissions (CoC gating)', () => {
    it('lets the assigned tech submit an ordinary form', async () => {
        seedJob();
        seedTemplates();
        seedUser({});

        const res = await request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ templateId: TPL_PLAIN, jobId: JOB, data: { ok: true } });

        expect(res.status).toBe(201);
        expect(res.body.data.submission.templateId).toBe(TPL_PLAIN);
    });

    it('blocks a CoC submission from a tech without canIssueCoC', async () => {
        seedJob();
        seedTemplates();
        seedUser({}); // permission not granted

        const res = await request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ templateId: TPL_COC, jobId: JOB, data: { pressure: '2bar' } });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/Certificates of Compliance/i);

        const subs = await fakePrisma.digitalFormSubmission.findMany({ where: { templateId: TPL_COC } });
        expect(subs).toHaveLength(0);
    });

    it('allows a CoC submission once the tech has canIssueCoC', async () => {
        seedJob();
        seedTemplates();
        seedUser({ canIssueCoC: true });

        const res = await request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ templateId: TPL_COC, jobId: JOB, data: { pressure: '2bar' }, signatureUrl: 'sig.png' });

        expect(res.status).toBe(201);
        expect(res.body.data.submission.templateId).toBe(TPL_COC);
    });

    it('rejects a submission for a job the tech is not assigned to', async () => {
        seedJob({ techId: 'other_tech' });
        seedTemplates();
        seedUser({ canIssueCoC: true });

        const res = await request(app)
            .post('/digital-forms/submissions')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ templateId: TPL_PLAIN, jobId: JOB, data: {} });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/assigned to you/i);
    });
});
