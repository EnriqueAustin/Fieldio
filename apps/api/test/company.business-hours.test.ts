import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';
import { defaultCompanySettings } from '../src/modules/company/company-settings';

const app = buildTestApp();

const CO = 'company_1';

function seedCompany(settings: Record<string, any> = {}) {
    fakePrisma.company.seed([{ id: CO, name: 'Mthembu Plumbing', settings }]);
}

beforeEach(() => {
    fakePrisma.$reset();
});

describe('company business hours settings', () => {
    it('returns sensible defaults when nothing is stored', async () => {
        seedCompany({});

        const res = await request(app)
            .get('/company/me')
            .set('Authorization', authHeader({ role: 'ADMIN' }));

        expect(res.status).toBe(200);
        const hours = res.body.data.company.settings.businessHours;
        expect(hours.mon).toEqual({ open: true, start: '08:00', end: '17:00' });
        expect(hours.sat).toEqual({ open: true, start: '08:00', end: '13:00' });
        expect(hours.sun.open).toBe(false);
    });

    it('persists an ADMIN update to business hours', async () => {
        seedCompany({});

        const businessHours = {
            ...defaultCompanySettings.businessHours,
            mon: { open: true, start: '07:30', end: '16:00' },
            sun: { open: true, start: '09:00', end: '12:00' },
        };

        const res = await request(app)
            .patch('/company/me')
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ settings: { businessHours } });

        expect(res.status).toBe(200);
        expect(res.body.data.company.settings.businessHours.mon).toEqual({
            open: true,
            start: '07:30',
            end: '16:00',
        });
        expect(res.body.data.company.settings.businessHours.sun).toEqual({
            open: true,
            start: '09:00',
            end: '12:00',
        });

        // Round-trips through the store.
        const after = await request(app)
            .get('/company/me')
            .set('Authorization', authHeader({ role: 'ADMIN' }));
        expect(after.body.data.company.settings.businessHours.mon.start).toBe('07:30');
    });

    it('rejects an open day whose close is not after its open', async () => {
        seedCompany({});

        const businessHours = {
            ...defaultCompanySettings.businessHours,
            mon: { open: true, start: '17:00', end: '08:00' },
        };

        const res = await request(app)
            .patch('/company/me')
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ settings: { businessHours } });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Validation failed');
    });

    it('allows a closed day to keep an inverted window (ignored while closed)', async () => {
        seedCompany({});

        const businessHours = {
            ...defaultCompanySettings.businessHours,
            sun: { open: false, start: '17:00', end: '08:00' },
        };

        const res = await request(app)
            .patch('/company/me')
            .set('Authorization', authHeader({ role: 'ADMIN' }))
            .send({ settings: { businessHours } });

        expect(res.status).toBe(200);
        expect(res.body.data.company.settings.businessHours.sun.open).toBe(false);
    });

    it('forbids non-ADMIN roles from changing business hours', async () => {
        seedCompany({});

        for (const role of ['OFFICE', 'DISPATCHER', 'TECHNICIAN'] as const) {
            const res = await request(app)
                .patch('/company/me')
                .set('Authorization', authHeader({ role }))
                .send({ settings: { businessHours: defaultCompanySettings.businessHours } });
            expect(res.status).toBe(403);
        }
    });

    it('does not expose business hours in the technician company view', async () => {
        seedCompany({});

        const res = await request(app)
            .get('/company/me')
            .set('Authorization', authHeader({ role: 'TECHNICIAN' }));

        expect(res.status).toBe(200);
        expect(res.body.data.company.settings.businessHours).toBeUndefined();
    });
});
