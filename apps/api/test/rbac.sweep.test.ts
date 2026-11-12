import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Mock the database before importing the app (same pattern as the other suites).
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';

beforeEach(() => {
    fakePrisma.$reset();
});

// One representative GET per unguarded-endpoint group from the Nov-10 audit §2.1 /
// Appendix. A TECHNICIAN token must be refused (403); an office-ish role must pass
// the guard and reach the controller (200 against the empty in-memory tables).
const SWEEP: Array<{ group: string; path: string; office: Parameters<typeof authHeader>[0]['role'] }> = [
    { group: 'projects', path: '/projects', office: 'OFFICE' },
    { group: 'recurring', path: '/recurring', office: 'OFFICE' },
    { group: 'leads', path: '/leads/pipeline', office: 'SALES' },
    { group: 'permits', path: '/permits', office: 'DISPATCHER' },
    { group: 'warranty-claims', path: '/warranty-claims', office: 'OFFICE' },
    { group: 'bookings', path: '/bookings', office: 'CSR' },
    { group: 'tracking', path: '/tracking/latest', office: 'DISPATCHER' },
    { group: 'dunning', path: '/dunning/rules', office: 'ACCOUNTANT' },
    { group: 'inventory-alerts', path: '/inventory-alerts', office: 'DISPATCHER' },
    { group: 'inventory-transfers', path: '/inventory-transfers', office: 'OFFICE' },
    { group: 'documents', path: '/documents?entityType=JOB&entityId=job_1', office: 'OFFICE' },
    { group: 'certifications', path: '/certifications', office: 'OFFICE' },
    { group: 'users', path: '/users', office: 'DISPATCHER' },
    { group: 'users skills-catalog', path: '/users/skills-catalog', office: 'DISPATCHER' },
    { group: 'branches', path: '/branches', office: 'OFFICE' },
    { group: 'schedule', path: '/schedule/unscheduled', office: 'DISPATCHER' },
    { group: 'operations properties', path: '/operations/properties', office: 'OFFICE' },
    { group: 'digital-forms submissions', path: '/digital-forms/submissions', office: 'OFFICE' },
];

describe('RBAC sweep — technicians cannot read office data', () => {
    for (const { group, path, office } of SWEEP) {
        it(`${group}: TECHNICIAN is 403`, async () => {
            const res = await request(app).get(path).set('Authorization', authHeader({ role: 'TECHNICIAN' }));
            expect(res.status).toBe(403);
        });

        it(`${group}: ${office} gets through`, async () => {
            const res = await request(app).get(path).set('Authorization', authHeader({ role: office }));
            expect(res.status).toBe(200);
        });
    }
});

describe('certifications — a technician may read only their own record', () => {
    it('allows a technician to read their own certifications', async () => {
        const res = await request(app)
            .get('/certifications/user/user_test')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: 'user_test' }));
        expect(res.status).toBe(200);
    });

    it("refuses a technician reading someone else's certifications", async () => {
        const res = await request(app)
            .get('/certifications/user/other_user')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: 'user_test' }));
        expect(res.status).toBe(403);
    });

    it('lets an office role read anyone', async () => {
        const res = await request(app)
            .get('/certifications/user/other_user')
            .set('Authorization', authHeader({ role: 'OFFICE' }));
        expect(res.status).toBe(200);
    });
});

describe('branches — cross-tenant writes are blocked', () => {
    beforeEach(() => {
        fakePrisma.branch.seed([{ id: 'branch_1', companyId: COMPANY, name: 'Head Office', active: true }]);
    });

    it('404s when an admin of another company edits the branch', async () => {
        const res = await request(app)
            .patch('/branches/branch_1')
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: 'company_2' }))
            .send({ name: 'Hijacked' });
        expect(res.status).toBe(404);
    });

    it('lets the owning admin edit, and ignores a companyId in the body', async () => {
        const res = await request(app)
            .patch('/branches/branch_1')
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY }))
            .send({ name: 'Renamed', companyId: 'company_2' });
        expect(res.status).toBe(200);
        expect(res.body.data.branch.name).toBe('Renamed');
        // companyId from the body was stripped by the zod whitelist.
        expect(res.body.data.branch.companyId).toBe(COMPANY);
    });
});

describe('auth — public registration is closed by default', () => {
    it('403s POST /auth/register when ALLOW_PUBLIC_REGISTRATION is unset', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ companyName: 'Acme Plumbing', email: 'owner@acme.test', password: 'Abcd1234' });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/closed/i);
    });
});
