import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { timeTrackingRouter } from '../src/routes/timeTracking';

// buildTestApp (helpers/app.ts) doesn't mount the time-tracking router and is
// owned by another worker, so this spec mounts it the same way server.ts does.
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/time-tracking', timeTrackingRouter);
    app.use(errorHandler);
    return app;
}
const app = buildApp();

const COMPANY = 'company_1';
const OFFICE_USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TECH = '11111111-1111-1111-1111-111111111111';
const OTHER_TECH = '22222222-2222-2222-2222-222222222222';
const JOB = '33333333-3333-3333-3333-333333333333';
const ENTRY = '44444444-4444-4444-4444-444444444444';

// A time today (well inside this week's Mon–Sun window in any timezone).
const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
};

function seedBase() {
    fakePrisma.company.seed([{ id: COMPANY, settings: { regional: { timezone: 'Africa/Johannesburg' } } }]);
    fakePrisma.user.seed([
        { id: OFFICE_USER, companyId: COMPANY, role: 'OFFICE', email: 'office@x.co', firstName: 'Olivia', lastName: 'Office' },
        { id: TECH, companyId: COMPANY, role: 'TECHNICIAN', email: 'tech@x.co', firstName: 'Thabo', lastName: 'Tech' },
        { id: OTHER_TECH, companyId: COMPANY, role: 'TECHNICIAN', email: 'two@x.co', firstName: 'Two', lastName: 'Tech' },
    ]);
    fakePrisma.job.seed([{ id: JOB, companyId: COMPANY, title: 'Geyser swap' }]);
}

function seedEntry(overrides: Record<string, any> = {}) {
    const start = at(9);
    const end = at(11);
    fakePrisma.timeEntry.seed([{
        id: ENTRY, companyId: COMPANY, userId: TECH, jobId: JOB, type: 'WRENCH',
        startTime: start, endTime: end, duration: 7200, description: null, ...overrides,
    }]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seedBase();
});

describe('POST /time-tracking/manual', () => {
    it('office adds a missed entry and writes an audit row', async () => {
        const res = await request(app)
            .post('/time-tracking/manual')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY, userId: OFFICE_USER }))
            .send({ userId: TECH, startTime: at(13).toISOString(), endTime: at(15).toISOString(), note: 'Forgot to clock in' });

        expect(res.status).toBe(201);
        expect(res.body.data.entry.userId).toBe(TECH);
        expect(res.body.data.entry.duration).toBe(7200);

        const audit = await fakePrisma.auditLog.findMany({ where: { action: 'TIME_ENTRY_MANUAL_ADD' } });
        expect(audit).toHaveLength(1);
        expect(audit[0].entityType).toBe('TIME_ENTRY');
        expect(audit[0].userId).toBe(OFFICE_USER);
        expect((audit[0].metadata as any).reason).toBe('Forgot to clock in');
        expect((audit[0].metadata as any).before).toBeNull();
    });

    it('rejects an entry that overlaps the technician’s existing hours (409)', async () => {
        seedEntry(); // 09:00–11:00
        const res = await request(app)
            .post('/time-tracking/manual')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY, userId: OFFICE_USER }))
            .send({ userId: TECH, startTime: at(10).toISOString(), endTime: at(12).toISOString(), note: 'overlap' });

        expect(res.status).toBe(409);
    });

    it('is forbidden for a technician (403)', async () => {
        const res = await request(app)
            .post('/time-tracking/manual')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: TECH }))
            .send({ userId: TECH, startTime: at(13).toISOString(), endTime: at(15).toISOString(), note: 'nope' });

        expect(res.status).toBe(403);
    });
});

describe('PATCH /time-tracking/:id', () => {
    it('edits an entry and records a before/after audit row', async () => {
        seedEntry();
        const res = await request(app)
            .patch(`/time-tracking/${ENTRY}`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY, userId: OFFICE_USER }))
            .send({ startTime: at(9).toISOString(), endTime: at(10).toISOString(), reason: 'Left early' });

        expect(res.status).toBe(200);
        expect(res.body.data.entry.duration).toBe(3600);

        const audit = await fakePrisma.auditLog.findMany({ where: { action: 'TIME_ENTRY_UPDATED' } });
        expect(audit).toHaveLength(1);
        expect((audit[0].metadata as any).reason).toBe('Left early');
        expect((audit[0].metadata as any).before.duration).toBe(7200);
    });

    it('requires a reason (400)', async () => {
        seedEntry();
        const res = await request(app)
            .patch(`/time-tracking/${ENTRY}`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY, userId: OFFICE_USER }))
            .send({ endTime: at(10).toISOString() });

        expect(res.status).toBe(400);
    });

    it('is forbidden for a technician (403)', async () => {
        seedEntry();
        const res = await request(app)
            .patch(`/time-tracking/${ENTRY}`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: TECH }))
            .send({ endTime: at(10).toISOString(), reason: 'x' });

        expect(res.status).toBe(403);
    });
});

describe('DELETE /time-tracking/:id', () => {
    it('hard-deletes but keeps the full before-image on the audit trail', async () => {
        seedEntry();
        const res = await request(app)
            .delete(`/time-tracking/${ENTRY}`)
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: COMPANY, userId: OFFICE_USER }))
            .send({ reason: 'Duplicate' });

        expect(res.status).toBe(200);
        expect(await fakePrisma.timeEntry.findFirst({ where: { id: ENTRY } })).toBeNull();

        const audit = await fakePrisma.auditLog.findMany({ where: { action: 'TIME_ENTRY_DELETED' } });
        expect(audit).toHaveLength(1);
        expect((audit[0].metadata as any).before.id).toBe(ENTRY);
        expect((audit[0].metadata as any).reason).toBe('Duplicate');
    });

    it('is forbidden for a technician (403)', async () => {
        seedEntry();
        const res = await request(app)
            .delete(`/time-tracking/${ENTRY}`)
            .set('Authorization', authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: TECH }));

        expect(res.status).toBe(403);
    });
});

describe('GET /time-tracking — reading other people’s hours', () => {
    beforeEach(() => {
        fakePrisma.timeEntry.seed([{
            id: ENTRY, companyId: COMPANY, userId: OTHER_TECH, jobId: JOB, type: 'WRENCH',
            startTime: at(9), endTime: at(11), duration: 7200,
            user: { id: OTHER_TECH, email: 'two@x.co', firstName: 'Two', lastName: 'Tech' },
        }]);
    });

    it('SALES cannot list another user’s hours (scoped to self)', async () => {
        const SALES_USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        const res = await request(app)
            .get(`/time-tracking?userId=${OTHER_TECH}`)
            .set('Authorization', authHeader({ role: 'SALES', companyId: COMPANY, userId: SALES_USER }));

        expect(res.status).toBe(200);
        expect(res.body.data.entries.every((e: any) => e.userId !== OTHER_TECH)).toBe(true);
    });

    it('ADMIN may list another user’s hours', async () => {
        const res = await request(app)
            .get(`/time-tracking?userId=${OTHER_TECH}`)
            .set('Authorization', authHeader({ role: 'ADMIN', companyId: COMPANY, userId: OFFICE_USER }));

        expect(res.status).toBe(200);
        expect(res.body.data.entries.some((e: any) => e.userId === OTHER_TECH)).toBe(true);
    });
});
