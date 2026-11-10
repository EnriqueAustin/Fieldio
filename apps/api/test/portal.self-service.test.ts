import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp } from './helpers/app';
import { computeSlots, checkEligibility } from '../src/modules/portal/portal-reschedule';
import { defaultCompanySettings } from '../src/modules/company/company-settings';

const app = buildTestApp();

const CO_A = 'company_A';
const CO_B = 'company_B';
const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const TZ = 'Africa/Johannesburg';
const DAY = 86400_000;

const rules = (over: Partial<typeof defaultCompanySettings.portal.selfReschedule> = {}) => ({
    ...defaultCompanySettings.portal.selfReschedule,
    enabled: true,
    ...over,
});

function seed(settingsA: Record<string, any>) {
    fakePrisma.company.seed([
        { id: CO_A, name: 'Mthembu Plumbing', settings: settingsA },
        { id: CO_B, name: 'Other Co', settings: {} },
    ]);
    fakePrisma.customer.seed([
        { id: 'custA', companyId: CO_A, name: 'Alice' },
        { id: 'custB', companyId: CO_B, name: 'Bob' },
    ]);
    // The fake doesn't resolve `include`, so the related customer rides on the row.
    fakePrisma.customerPortalToken.seed([
        { id: 't1', token: 'tok-A', customerId: 'custA', companyId: CO_A, expiresAt: FUTURE, customer: { id: 'custA', name: 'Alice', email: null, phone: null } },
        { id: 't2', token: 'tok-B', customerId: 'custB', companyId: CO_B, expiresAt: FUTURE, customer: { id: 'custB', name: 'Bob', email: null, phone: null } },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
});

// ---------------------------------------------------------------------------
// Financing on portal quotes
// ---------------------------------------------------------------------------

describe('portal financing offers', () => {
    const financingOn = { financing: { enabled: true, showOnEstimates: true } };

    function seedQuotes(settings: Record<string, any>) {
        seed(settings);
        fakePrisma.financingOption.seed([
            { id: 'plan12', companyId: CO_A, name: '12 months interest-free', termMonths: 12, interestRate: 0, minAmount: 1000, maxAmount: null, active: true },
            { id: 'plan24', companyId: CO_A, name: '24 months', termMonths: 24, interestRate: 12, minAmount: 5000, maxAmount: null, active: true },
            { id: 'planOff', companyId: CO_A, name: 'Retired', termMonths: 6, interestRate: 0, minAmount: 0, maxAmount: null, active: false },
            { id: 'planB', companyId: CO_B, name: 'B plan', termMonths: 12, interestRate: 0, minAmount: 0, maxAmount: null, active: true },
        ]);
        fakePrisma.estimate.seed([
            { id: 'estBig', companyId: CO_A, customerId: 'custA', status: 'SENT', total: 6000, items: [] },
            { id: 'estSmall', companyId: CO_A, customerId: 'custA', status: 'SENT', total: 500, items: [] },
            { id: 'estDraft', companyId: CO_A, customerId: 'custA', status: 'DRAFT', total: 6000, items: [] },
            { id: 'estB', companyId: CO_B, customerId: 'custB', status: 'SENT', total: 6000, items: [] },
        ]);
    }

    it('offers only the active plans a SENT quote qualifies for, with the monthly instalment', async () => {
        seedQuotes(financingOn);
        const res = await request(app).get('/public/portal/tok-A');
        expect(res.status).toBe(200);

        const big = res.body.data.estimates.find((e: any) => e.id === 'estBig');
        expect(big.financingOffers.map((o: any) => o.optionId)).toEqual(['plan12', 'plan24']);
        expect(big.financingOffers[0].monthlyPayment).toBe(500);
        // 6000 over 24 months at 12% p.a.
        expect(big.financingOffers[1].monthlyPayment).toBeCloseTo(282.44, 2);

        const small = res.body.data.estimates.find((e: any) => e.id === 'estSmall');
        expect(small.financingOffers).toEqual([]);
        const draft = res.body.data.estimates.find((e: any) => e.id === 'estDraft');
        expect(draft.financingOffers).toEqual([]);
    });

    it('shows no offers when the company has financing switched off', async () => {
        seedQuotes({});
        const res = await request(app).get('/public/portal/tok-A');
        const big = res.body.data.estimates.find((e: any) => e.id === 'estBig');
        expect(big.financingOffers).toEqual([]);
    });

    it('creates one APPLIED application per quote, idempotently', async () => {
        seedQuotes(financingOn);
        const first = await request(app)
            .post('/public/portal/tok-A/estimates/estBig/financing')
            .send({ financingOptionId: 'plan12' });
        expect(first.status).toBe(200);
        expect(first.body.data.application.status).toBe('APPLIED');
        expect(first.body.data.application.monthlyPayment).toBe(500);
        expect(first.body.data.application.customerId).toBe('custA');

        const again = await request(app)
            .post('/public/portal/tok-A/estimates/estBig/financing')
            .send({ financingOptionId: 'plan12' });
        expect(again.body.data.application.id).toBe(first.body.data.application.id);
        expect(fakePrisma.financingApplication.rows).toHaveLength(1);

        const dash = await request(app).get('/public/portal/tok-A');
        const big = dash.body.data.estimates.find((e: any) => e.id === 'estBig');
        expect(big.financingApplication.status).toBe('APPLIED');
    });

    it('refuses a plan the quote does not qualify for, an inactive plan, or another company’s plan', async () => {
        seedQuotes(financingOn);
        for (const [est, plan] of [['estSmall', 'plan12'], ['estBig', 'planOff'], ['estBig', 'planB']]) {
            const res = await request(app)
                .post(`/public/portal/tok-A/estimates/${est}/financing`)
                .send({ financingOptionId: plan });
            expect(res.status).toBe(400);
        }
        expect(fakePrisma.financingApplication.rows).toHaveLength(0);
    });

    it('cannot finance another customer’s quote', async () => {
        seedQuotes(financingOn);
        const res = await request(app)
            .post('/public/portal/tok-A/estimates/estB/financing')
            .send({ financingOptionId: 'plan12' });
        expect(res.status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// Slot maths (pure)
// ---------------------------------------------------------------------------

describe('computeSlots', () => {
    // Monday 2 Nov 2026, 07:00 SAST (05:00Z)
    const now = new Date('2026-11-02T05:00:00.000Z');
    const job = {
        status: 'ASSIGNED',
        scheduledStart: new Date('2026-11-06T07:00:00.000Z'), // Fri 09:00 SAST
        scheduledEnd: new Date('2026-11-06T09:00:00.000Z'), // 2h
    };

    it('stays inside business hours in the company timezone, on work days, after the notice period', () => {
        const slots = computeSlots({ job, rules: rules({ horizonDays: 7 }), timeZone: TZ, busy: [], now });
        expect(slots.length).toBeGreaterThan(0);
        for (const s of slots) {
            const local = new Date(s.start.getTime() + 2 * 3600_000); // SAST is UTC+2, no DST
            expect(local.getUTCHours()).toBeGreaterThanOrEqual(8);
            expect(local.getUTCHours() + 2).toBeLessThanOrEqual(17);
            expect([1, 2, 3, 4, 5]).toContain(local.getUTCDay());
            expect(s.start.getTime()).toBeGreaterThanOrEqual(now.getTime() + 24 * 3600_000);
            expect(s.end.getTime() - s.start.getTime()).toBe(2 * 3600_000);
        }
        // First slot: Tue 3 Nov 08:00 SAST (Monday is inside the 24h notice).
        expect(slots[0].start.toISOString()).toBe('2026-11-03T06:00:00.000Z');
        // The current booking is not offered back.
        expect(slots.some((s) => s.start.getTime() === job.scheduledStart.getTime())).toBe(false);
    });

    it('skips anything overlapping the technician’s other jobs', () => {
        const busy = [{ start: new Date('2026-11-03T06:00:00.000Z'), end: new Date('2026-11-03T10:00:00.000Z') }];
        const slots = computeSlots({ job, rules: rules({ horizonDays: 2 }), timeZone: TZ, busy, now });
        for (const s of slots) {
            const overlaps = s.start < busy[0].end && s.end > busy[0].start;
            expect(overlaps).toBe(false);
        }
        expect(slots[0].start.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    });

    it('eligibility: disabled, wrong status, too close, and limit reached', () => {
        expect(checkEligibility(job, rules({ enabled: false }), 0, now)).toBe('DISABLED');
        expect(checkEligibility({ ...job, status: 'EN_ROUTE' }, rules(), 0, now)).toBe('STATUS');
        expect(checkEligibility({ ...job, scheduledStart: null }, rules(), 0, now)).toBe('NOT_SCHEDULED');
        expect(checkEligibility(job, rules({ minNoticeHours: 120 }), 0, now)).toBe('TOO_LATE');
        expect(checkEligibility(job, rules({ maxPerJob: 1 }), 1, now)).toBe('LIMIT_REACHED');
        expect(checkEligibility(job, rules(), 0, now)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Reschedule endpoints
// ---------------------------------------------------------------------------

describe('portal self-serve reschedule', () => {
    const start = new Date(Date.now() + 5 * DAY);
    start.setUTCHours(7, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600_000);

    function seedJobs(settings: Record<string, any>) {
        seed(settings);
        fakePrisma.user.seed([
            { id: 'tech1', companyId: CO_A, role: 'TECHNICIAN', status: 'ACTIVE' },
            { id: 'office1', companyId: CO_A, role: 'OFFICE', status: 'ACTIVE' },
        ]);
        fakePrisma.job.seed([
            { id: 'jobA', companyId: CO_A, customerId: 'custA', title: 'Geyser service', status: 'ASSIGNED', techId: 'tech1', scheduledStart: start, scheduledEnd: end },
            { id: 'jobRoute', companyId: CO_A, customerId: 'custA', title: 'Leak', status: 'EN_ROUTE', techId: 'tech1', scheduledStart: start, scheduledEnd: end },
            // Another customer's job blocking the tech the following morning.
            { id: 'jobOther', companyId: CO_A, customerId: 'custX', title: 'Other', status: 'ASSIGNED', techId: 'tech1', scheduledStart: new Date(start.getTime() + DAY), scheduledEnd: new Date(start.getTime() + DAY + 3 * 3600_000) },
            { id: 'jobB', companyId: CO_B, customerId: 'custB', title: 'B job', status: 'ASSIGNED', techId: null, scheduledStart: start, scheduledEnd: end },
        ]);
    }

    const enabled = { portal: { selfReschedule: { enabled: true, workDays: [0, 1, 2, 3, 4, 5, 6] } } };

    it('is off by default: no button, no slots, and a POST is refused', async () => {
        seedJobs({});
        const dash = await request(app).get('/public/portal/tok-A');
        expect(dash.body.data.jobs.find((j: any) => j.id === 'jobA').canReschedule).toBe(false);

        const opts = await request(app).get('/public/portal/tok-A/jobs/jobA/reschedule');
        expect(opts.body.data).toMatchObject({ eligible: false, reason: 'DISABLED', slots: [] });

        const post = await request(app)
            .post('/public/portal/tok-A/jobs/jobA/reschedule')
            .send({ start: new Date(start.getTime() + DAY).toISOString() });
        expect(post.status).toBe(409);
    });

    it('offers open slots that avoid the tech’s other bookings, and moves the job to one', async () => {
        seedJobs(enabled);
        const dash = await request(app).get('/public/portal/tok-A');
        expect(dash.body.data.jobs.find((j: any) => j.id === 'jobA').canReschedule).toBe(true);
        expect(dash.body.data.jobs.find((j: any) => j.id === 'jobRoute').canReschedule).toBe(false);

        const opts = await request(app).get('/public/portal/tok-A/jobs/jobA/reschedule');
        expect(opts.status).toBe(200);
        expect(opts.body.data.eligible).toBe(true);
        expect(opts.body.data.durationMinutes).toBe(120);
        const slots = opts.body.data.slots as Array<{ start: string; end: string }>;
        expect(slots.length).toBeGreaterThan(0);

        const blockStart = start.getTime() + DAY;
        const blockEnd = blockStart + 3 * 3600_000;
        for (const s of slots) {
            const a = new Date(s.start).getTime();
            const b = new Date(s.end).getTime();
            expect(a < blockEnd && b > blockStart).toBe(false);
        }

        const pick = slots[3];
        const post = await request(app).post('/public/portal/tok-A/jobs/jobA/reschedule').send({ start: pick.start });
        expect(post.status).toBe(200);

        const job = fakePrisma.job.rows.find((j: any) => j.id === 'jobA');
        expect(job.scheduledStart.toISOString()).toBe(pick.start);
        expect(job.scheduledEnd.toISOString()).toBe(pick.end);
        expect(job.status).toBe('ASSIGNED');
        expect(job.techId).toBe('tech1');

        const events = fakePrisma.jobTimelineEvent.rows.filter((e: any) => e.jobId === 'jobA');
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('CUSTOMER_RESCHEDULED');
    });

    it('refuses a time the server would not offer (e.g. on top of another booking)', async () => {
        seedJobs(enabled);
        const res = await request(app)
            .post('/public/portal/tok-A/jobs/jobA/reschedule')
            .send({ start: new Date(start.getTime() + DAY).toISOString() });
        expect(res.status).toBe(409);
        const job = fakePrisma.job.rows.find((j: any) => j.id === 'jobA');
        expect(job.scheduledStart.getTime()).toBe(start.getTime());
    });

    it('stops after the per-job limit', async () => {
        seedJobs({ portal: { selfReschedule: { ...enabled.portal.selfReschedule, maxPerJob: 1 } } });
        const opts = await request(app).get('/public/portal/tok-A/jobs/jobA/reschedule');
        const first = await request(app)
            .post('/public/portal/tok-A/jobs/jobA/reschedule')
            .send({ start: opts.body.data.slots[0].start });
        expect(first.status).toBe(200);

        const again = await request(app).get('/public/portal/tok-A/jobs/jobA/reschedule');
        expect(again.body.data).toMatchObject({ eligible: false, reason: 'LIMIT_REACHED' });
    });

    it('will not move a job once the tech is on the way', async () => {
        seedJobs(enabled);
        const res = await request(app).get('/public/portal/tok-A/jobs/jobRoute/reschedule');
        expect(res.body.data).toMatchObject({ eligible: false, reason: 'STATUS' });
    });

    it('cannot see or move another company’s job', async () => {
        seedJobs(enabled);
        const get = await request(app).get('/public/portal/tok-A/jobs/jobB/reschedule');
        expect(get.status).toBe(404);
        const post = await request(app)
            .post('/public/portal/tok-A/jobs/jobB/reschedule')
            .send({ start: new Date(start.getTime() + DAY).toISOString() });
        expect(post.status).toBe(404);
    });
});
