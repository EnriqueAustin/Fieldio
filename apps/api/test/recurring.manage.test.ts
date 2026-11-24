import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { recurringRouter } from '../src/routes/recurring';
import { advance, recurringService } from '../src/modules/recurring/recurring.service';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/recurring', recurringRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const OTHER = 'company_2';

// The create schema validates real UUIDs, so seed with UUID-shaped ids.
const CUST = '11111111-1111-4111-8111-111111111111';
const PROP = '22222222-2222-4222-8222-222222222222';
const OTHER_CUST = '33333333-3333-4333-8333-333333333333';
const OTHER_PROP = '44444444-4444-4444-8444-444444444444';
const SECOND_CUST_PROP = '55555555-5555-4555-8555-555555555555';
const SECOND_CUST = '66666666-6666-4666-8666-666666666666';

const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: COMPANY });
const asTech = () => authHeader({ role: 'TECHNICIAN', userId: 'tech_1', companyId: COMPANY });

const DAY = 24 * 60 * 60 * 1000;

const seedPlan = (over: Record<string, unknown> = {}) => ({
    id: 'plan_1',
    companyId: COMPANY,
    customerId: CUST,
    propertyId: PROP,
    title: 'Quarterly geyser service',
    description: null,
    frequency: 'MONTHLY',
    startDate: new Date(Date.now() - 2 * DAY),
    endDate: null,
    nextRunAt: new Date(Date.now() - DAY),
    active: true,
    ...over,
});

const seedForeignPlan = () =>
    seedPlan({ id: 'plan_other', companyId: OTHER, customerId: OTHER_CUST, propertyId: OTHER_PROP });

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.customer.seed([
        { id: CUST, companyId: COMPANY, name: 'Mthembu' },
        { id: SECOND_CUST, companyId: COMPANY, name: 'Dlamini' },
        { id: OTHER_CUST, companyId: OTHER, name: 'Foreign Co' },
    ]);
    fakePrisma.property.seed([
        { id: PROP, companyId: COMPANY, customerId: CUST, addressLine1: '1 Main Rd', city: 'JHB' },
        { id: SECOND_CUST_PROP, companyId: COMPANY, customerId: SECOND_CUST, addressLine1: '2 Side St', city: 'JHB' },
        { id: OTHER_PROP, companyId: OTHER, customerId: OTHER_CUST, addressLine1: '9 Far Rd', city: 'CPT' },
    ]);
});

describe('POST /recurring/run-due', () => {
    it('creates jobs only for the caller company and gives them an end time', async () => {
        fakePrisma.recurringPlan.seed([seedPlan(), seedForeignPlan()]);

        const res = await request(app).post('/recurring/run-due').set('Authorization', asOffice());

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(1);
        expect(fakePrisma.job.rows).toHaveLength(1);
        const job = fakePrisma.job.rows[0];
        expect(job.companyId).toBe(COMPANY);
        expect(job.recurringPlanId).toBe('plan_1');
        expect(job.scheduledEnd.getTime() - job.scheduledStart.getTime()).toBe(60 * 60 * 1000);

        // The other tenant plan was left untouched and is still due.
        const foreign = fakePrisma.recurringPlan.rows.find((p: any) => p.id === 'plan_other');
        expect(foreign.nextRunAt.getTime()).toBeLessThan(Date.now());
    });

    it('is not available to technicians', async () => {
        const res = await request(app).post('/recurring/run-due').set('Authorization', asTech());
        expect(res.status).toBe(403);
    });
});

describe('PATCH /recurring/:id', () => {
    it('edits a plan in the caller company', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app)
            .patch('/recurring/plan_1')
            .set('Authorization', asOffice())
            .send({ title: 'Annual boiler service', frequency: 'ANNUAL', active: false, endDate: null });

        expect(res.status).toBe(200);
        expect(res.body.data.plan.title).toBe('Annual boiler service');
        expect(fakePrisma.recurringPlan.rows[0]).toMatchObject({ frequency: 'ANNUAL', active: false });
    });

    it('returns 404 for another company plan and leaves it unchanged', async () => {
        fakePrisma.recurringPlan.seed([seedForeignPlan()]);
        const res = await request(app)
            .patch('/recurring/plan_other')
            .set('Authorization', asOffice())
            .send({ title: 'Hijacked' });

        expect(res.status).toBe(404);
        expect(fakePrisma.recurringPlan.rows[0].title).toBe('Quarterly geyser service');
    });

    it('rejects an invalid body with 400', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app)
            .patch('/recurring/plan_1')
            .set('Authorization', asOffice())
            .send({ frequency: 'DAILY' });
        expect(res.status).toBe(400);
    });
});

describe('POST /recurring', () => {
    const body = (over: Record<string, unknown> = {}) => ({
        customerId: CUST,
        propertyId: PROP,
        title: 'Filter change',
        frequency: 'QUARTERLY',
        startDate: new Date(Date.now() + DAY).toISOString(),
        ...over,
    });

    it('creates a plan for own customer and property', async () => {
        const res = await request(app).post('/recurring').set('Authorization', asOffice()).send(body());
        expect(res.status).toBe(201);
        expect(fakePrisma.recurringPlan.rows[0]).toMatchObject({ companyId: COMPANY, active: true });
    });

    it('rejects a foreign customer (404)', async () => {
        const res = await request(app)
            .post('/recurring')
            .set('Authorization', asOffice())
            .send(body({ customerId: OTHER_CUST, propertyId: OTHER_PROP }));
        expect(res.status).toBe(404);
        expect(fakePrisma.recurringPlan.rows).toHaveLength(0);
    });

    it('rejects a foreign property (404)', async () => {
        const res = await request(app)
            .post('/recurring')
            .set('Authorization', asOffice())
            .send(body({ propertyId: OTHER_PROP }));
        expect(res.status).toBe(404);
        expect(fakePrisma.recurringPlan.rows).toHaveLength(0);
    });

    it('rejects a property that belongs to a different customer of the same company (404)', async () => {
        const res = await request(app)
            .post('/recurring')
            .set('Authorization', asOffice())
            .send(body({ propertyId: SECOND_CUST_PROP }));
        expect(res.status).toBe(404);
        expect(fakePrisma.recurringPlan.rows).toHaveLength(0);
    });

    it('rejects a malformed body with 400', async () => {
        const res = await request(app).post('/recurring').set('Authorization', asOffice()).send({ title: 'x' });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /recurring/:id', () => {
    it('deactivates an own plan', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app).delete('/recurring/plan_1').set('Authorization', asOffice());
        expect(res.status).toBe(204);
        expect(fakePrisma.recurringPlan.rows[0].active).toBe(false);
    });

    it('returns 404 for another company plan and leaves it active', async () => {
        fakePrisma.recurringPlan.seed([seedForeignPlan()]);
        const res = await request(app).delete('/recurring/plan_other').set('Authorization', asOffice());
        expect(res.status).toBe(404);
        expect(fakePrisma.recurringPlan.rows[0].active).toBe(true);
    });
});

const plusDays = (d: Date, days: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
};

describe('backlog handling', () => {
    it('creates one job for the latest due occurrence and moves nextRunAt into the future', async () => {
        const behind = plusDays(new Date(), -20); // weekly: -20d, -13d, -6d are all due
        fakePrisma.recurringPlan.seed([seedPlan({ frequency: 'WEEKLY', nextRunAt: behind })]);

        const first = await request(app).post('/recurring/run-due').set('Authorization', asOffice());
        expect(first.body.data.created).toBe(1);
        expect(fakePrisma.job.rows).toHaveLength(1);
        expect(fakePrisma.job.rows[0].scheduledStart.getTime()).toBe(plusDays(behind, 14).getTime());
        expect(fakePrisma.recurringPlan.rows[0].nextRunAt.getTime()).toBeGreaterThan(Date.now());

        // A second tick has nothing left to do.
        const second = await request(app).post('/recurring/run-due').set('Authorization', asOffice());
        expect(second.body.data.created).toBe(0);
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('does not create a job for an occurrence past the end date', async () => {
        const nextRunAt = plusDays(new Date(), -5);
        fakePrisma.recurringPlan.seed([seedPlan({ nextRunAt, endDate: plusDays(new Date(), -10) })]);

        const res = await request(app).post('/recurring/run-due').set('Authorization', asOffice());
        expect(res.body.data.created).toBe(0);
        expect(fakePrisma.job.rows).toHaveLength(0);
        expect(fakePrisma.recurringPlan.rows[0].nextRunAt.getTime()).toBe(nextRunAt.getTime());
    });

    it('rolls nextRunAt forward on reactivation without creating a job', async () => {
        const behind = plusDays(new Date(), -20);
        fakePrisma.recurringPlan.seed([seedPlan({ frequency: 'WEEKLY', nextRunAt: behind, active: false })]);

        const res = await request(app)
            .patch('/recurring/plan_1')
            .set('Authorization', asOffice())
            .send({ active: true });

        expect(res.status).toBe(200);
        const row = fakePrisma.recurringPlan.rows[0];
        expect(row.active).toBe(true);
        // Behind -20d weekly: first occurrence on or after now is behind + 21d.
        expect(row.nextRunAt.getTime()).toBe(plusDays(behind, 21).getTime());
        expect(row.nextRunAt.getTime()).toBeGreaterThanOrEqual(Date.now());
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('leaves a future nextRunAt alone on reactivation', async () => {
        const future = plusDays(new Date(), 10);
        fakePrisma.recurringPlan.seed([seedPlan({ nextRunAt: future, active: false })]);

        await request(app).patch('/recurring/plan_1').set('Authorization', asOffice()).send({ active: true });
        expect(fakePrisma.recurringPlan.rows[0].nextRunAt.getTime()).toBe(future.getTime());
    });
});

describe('claiming, failures and end dates', () => {
    // fakePrisma treats a Date in a where clause as always matching, which would
    // hide the claim check. Give updateMany real Date equality for these tests.
    beforeEach(() => {
        vi.spyOn(fakePrisma.recurringPlan, 'updateMany').mockImplementation(async (args: any) => {
            const rows = fakePrisma.recurringPlan.rows.filter((r: any) =>
                Object.entries(args.where).every(([k, v]) =>
                    v instanceof Date ? r[k] instanceof Date && r[k].getTime() === v.getTime() : r[k] === v,
                ),
            );
            for (const r of rows) Object.assign(r, args.data);
            return { count: rows.length };
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('two parallel runs create exactly one job', async () => {
        fakePrisma.recurringPlan.seed([seedPlan({ frequency: 'WEEKLY' })]);

        const [a, b] = await Promise.all([recurringService.runDuePlans(), recurringService.runDuePlans()]);

        expect(a.created + b.created).toBe(1);
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('a run holding a stale nextRunAt creates nothing', async () => {
        const stale = new Date(Date.now() - DAY);
        // The plan has already been claimed: its nextRunAt moved on.
        fakePrisma.recurringPlan.seed([seedPlan({ nextRunAt: new Date(Date.now() + 6 * DAY) })]);
        const findMany = vi.spyOn(fakePrisma.recurringPlan, 'findMany').mockResolvedValueOnce([
            { ...fakePrisma.recurringPlan.rows[0], nextRunAt: stale },
        ]);

        const res = await recurringService.runDuePlans();
        findMany.mockRestore();

        expect(res.created).toBe(0);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('does not generate for a plan deactivated before the claim', async () => {
        fakePrisma.recurringPlan.seed([seedPlan({ active: false })]);
        const findMany = vi.spyOn(fakePrisma.recurringPlan, 'findMany').mockResolvedValueOnce([
            { ...fakePrisma.recurringPlan.rows[0], active: true },
        ]);

        const res = await recurringService.runDuePlans();
        findMany.mockRestore();

        expect(res.created).toBe(0);
        expect(fakePrisma.job.rows).toHaveLength(0);
    });

    it('one failing plan does not abort the batch', async () => {
        fakePrisma.recurringPlan.seed([
            seedPlan({ id: 'plan_bad' }),
            seedPlan({ id: 'plan_good' }),
        ]);
        const create = vi.spyOn(fakePrisma.job, 'create').mockRejectedValueOnce(new Error('boom'));

        const res = await recurringService.runDuePlans();
        create.mockRestore();

        expect(res).toEqual({ created: 1, failed: 1 });
        expect(fakePrisma.job.rows).toHaveLength(1);
    });

    it('exposes failed in the run-due response', async () => {
        const res = await request(app).post('/recurring/run-due').set('Authorization', asOffice());
        expect(res.body.data).toEqual({ created: 0, failed: 0 });
    });

    it('deactivates a plan once its next occurrence is past the end date', async () => {
        fakePrisma.recurringPlan.seed([
            seedPlan({ frequency: 'WEEKLY', nextRunAt: plusDays(new Date(), -2), endDate: plusDays(new Date(), 1) }),
        ]);

        const res = await recurringService.runDuePlans();

        expect(res.created).toBe(1);
        expect(fakePrisma.recurringPlan.rows[0].active).toBe(false);
    });

    it('deactivates a plan whose due occurrence is already past the end date, without a job', async () => {
        fakePrisma.recurringPlan.seed([
            seedPlan({ nextRunAt: plusDays(new Date(), -5), endDate: plusDays(new Date(), -10) }),
        ]);

        const res = await recurringService.runDuePlans();

        expect(res.created).toBe(0);
        expect(fakePrisma.recurringPlan.rows[0].active).toBe(false);
    });

    it('does not flag an ended plan as due', async () => {
        fakePrisma.recurringPlan.seed([
            seedPlan({ id: 'ended', nextRunAt: plusDays(new Date(), -5), endDate: plusDays(new Date(), -10) }),
            seedPlan({ id: 'live' }),
        ]);

        const res = await request(app).get('/recurring').set('Authorization', asOffice());

        const byId = Object.fromEntries(res.body.data.plans.map((p: any) => [p.id, p.isDue]));
        expect(byId).toEqual({ ended: false, live: true });
    });
});

describe('reactivation guard', () => {
    it('does not roll forward when the plan is already active', async () => {
        const behind = plusDays(new Date(), -3);
        fakePrisma.recurringPlan.seed([seedPlan({ frequency: 'WEEKLY', nextRunAt: behind, active: true })]);

        await request(app).patch('/recurring/plan_1').set('Authorization', asOffice()).send({ active: true });

        expect(fakePrisma.recurringPlan.rows[0].nextRunAt.getTime()).toBe(behind.getTime());
    });
});

describe('PATCH roles', () => {
    const asDispatcher = () => authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: COMPANY });

    it('rejects a technician with 403', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app).patch('/recurring/plan_1').set('Authorization', asTech()).send({ title: 'Nope' });
        expect(res.status).toBe(403);
    });

    it('lets a dispatcher edit non-status fields', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app).patch('/recurring/plan_1').set('Authorization', asDispatcher()).send({ title: 'Renamed plan' });
        expect(res.status).toBe(200);
        expect(fakePrisma.recurringPlan.rows[0].title).toBe('Renamed plan');
    });

    it('blocks a dispatcher from changing active', async () => {
        fakePrisma.recurringPlan.seed([seedPlan()]);
        const res = await request(app).patch('/recurring/plan_1').set('Authorization', asDispatcher()).send({ active: false });
        expect(res.status).toBe(403);
        expect(fakePrisma.recurringPlan.rows[0].active).toBe(true);
    });
});

describe('month-end clamping', () => {
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0, 0);
    const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

    it('clamps to the last day of shorter months and returns to the anchor day', () => {
        const feb = advance(at(2026, 1, 31), 'MONTHLY', 31);
        expect(ymd(feb)).toEqual([2026, 2, 28]);
        expect(ymd(advance(feb, 'MONTHLY', 31))).toEqual([2026, 3, 31]);
    });

    it('clamps quarterly, semiannual and annual steps', () => {
        expect(ymd(advance(at(2026, 8, 31), 'QUARTERLY', 31))).toEqual([2026, 11, 30]);
        expect(ymd(advance(at(2026, 8, 31), 'SEMIANNUAL', 31))).toEqual([2027, 2, 28]);
        expect(ymd(advance(at(2028, 2, 29), 'ANNUAL', 29))).toEqual([2029, 2, 28]);
    });

    it('keeps the time of day', () => {
        expect(advance(at(2026, 1, 31), 'MONTHLY', 31).getHours()).toBe(10);
    });
});
