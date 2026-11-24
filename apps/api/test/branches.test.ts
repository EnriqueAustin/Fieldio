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
const OTHER = 'company_2';
const admin = authHeader({ role: 'ADMIN', companyId: COMPANY, userId: 'admin_1' });
const office = authHeader({ role: 'OFFICE', companyId: COMPANY, userId: 'office_1' });

beforeEach(() => {
    fakePrisma.$reset();
});

describe('POST /branches', () => {
    it('admin creates a branch scoped to their company', async () => {
        const res = await request(app)
            .post('/branches')
            .set('Authorization', admin)
            .send({ name: 'Cape Town Depot', city: 'Cape Town', phone: '021 555 0100' });

        expect(res.status).toBe(201);
        expect(res.body.data.branch.name).toBe('Cape Town Depot');
        expect(res.body.data.branch.companyId).toBe(COMPANY);
    });

    it('is forbidden for a non-admin (403)', async () => {
        const res = await request(app)
            .post('/branches')
            .set('Authorization', office)
            .send({ name: 'Sneaky Branch' });

        expect(res.status).toBe(403);
    });
});

describe('GET /branches', () => {
    it('lists only active branches for the company', async () => {
        fakePrisma.branch.seed([
            { id: 'b1', companyId: COMPANY, name: 'Active', active: true },
            { id: 'b2', companyId: COMPANY, name: 'Gone', active: false },
            { id: 'b3', companyId: OTHER, name: 'Other tenant', active: true },
        ]);

        const res = await request(app).get('/branches').set('Authorization', admin);
        expect(res.status).toBe(200);
        const names = res.body.data.branches.map((b: any) => b.name);
        expect(names).toEqual(['Active']);
    });
});

describe('PATCH /branches/:id', () => {
    it('updates a branch in the company', async () => {
        fakePrisma.branch.seed([{ id: 'b1', companyId: COMPANY, name: 'Old', active: true }]);
        const res = await request(app)
            .patch('/branches/b1')
            .set('Authorization', admin)
            .send({ name: 'New', phone: '011 555 0000' });

        expect(res.status).toBe(200);
        expect(res.body.data.branch.name).toBe('New');
    });

    it('cannot edit another tenant\'s branch (404)', async () => {
        fakePrisma.branch.seed([{ id: 'b9', companyId: OTHER, name: 'Theirs', active: true }]);
        const res = await request(app)
            .patch('/branches/b9')
            .set('Authorization', admin)
            .send({ name: 'Hijacked' });

        expect(res.status).toBe(404);
    });
});

describe('DELETE /branches/:id — orphan guard', () => {
    beforeEach(() => {
        fakePrisma.branch.seed([{ id: 'b1', companyId: COMPANY, name: 'Depot', active: true }]);
    });

    it('deactivates a branch with nothing attached', async () => {
        const res = await request(app).delete('/branches/b1').set('Authorization', admin);
        expect(res.status).toBe(200);

        // It no longer appears in the active list.
        const list = await request(app).get('/branches').set('Authorization', admin);
        expect(list.body.data.branches).toHaveLength(0);
    });

    it('refuses to deactivate when jobs are still attached (409)', async () => {
        fakePrisma.job.seed([{ id: 'j1', companyId: COMPANY, branchId: 'b1', title: 'Leak', deletedAt: null }]);
        const res = await request(app).delete('/branches/b1').set('Authorization', admin);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/job/i);
    });

    it('refuses to deactivate when team members are still attached (409)', async () => {
        fakePrisma.user.seed([{ id: 'u1', companyId: COMPANY, branchId: 'b1', email: 't@x.co', role: 'TECHNICIAN' }]);
        const res = await request(app).delete('/branches/b1').set('Authorization', admin);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/team member/i);
    });

    it('is forbidden for a non-admin (403)', async () => {
        const res = await request(app).delete('/branches/b1').set('Authorization', office);
        expect(res.status).toBe(403);
    });
});
