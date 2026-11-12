import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { timeTrackingRouter } from '../src/routes/timeTracking';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/time-tracking', timeTrackingRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const TECH = 'user_test'; // matches authHeader default userId

// Entries carry the whole related User on purpose: the endpoint must name the
// person without ever passing the credential and pay-rate columns through.
// startTime is "now" so the entries land inside the default (this-week) window
// the office timesheet now queries over.
const NOW = new Date();
function seed() {
    fakePrisma.timeEntry.seed([
        {
            id: 'te_1',
            companyId: COMPANY,
            userId: TECH,
            jobId: 'job_1',
            type: 'WRENCH',
            startTime: NOW,
            duration: 3600,
            user: {
                id: TECH,
                email: 'sipho@acme.test',
                firstName: 'Sipho',
                lastName: 'Ndaba',
                passwordHash: '$2a$12$notarealhashbutlooksdangerous',
                hourlyCost: 250,
                commissionPct: 8,
            },
            job: { id: 'job_1', title: 'Geyser callout', status: 'COMPLETED', customer: { name: 'Acme' } },
        },
        {
            id: 'te_2',
            companyId: COMPANY,
            userId: 'other_tech',
            jobId: 'job_2',
            type: 'WRENCH',
            startTime: NOW,
            duration: 1800,
            user: {
                id: 'other_tech',
                email: 'pieter@acme.test',
                firstName: 'Pieter',
                lastName: 'van der Merwe',
                passwordHash: '$2a$12$anotherhash',
                hourlyCost: 310,
                commissionPct: 10,
            },
            job: { id: 'job_2', title: 'Drain clear', status: 'COMPLETED', customer: { name: 'Beta' } },
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
    seed();
});

describe('GET /time-tracking', () => {
    it('never returns password hashes or pay rates', async () => {
        const res = await request(app)
            .get('/time-tracking')
            .set('Authorization', authHeader({ role: 'ADMIN' }));

        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toContain('passwordHash');
        expect(body).not.toContain('hourlyCost');
        expect(body).not.toContain('commissionPct');
        expect(body).not.toContain('$2a$12$');
    });

    it('scopes a TECHNICIAN to their own entries', async () => {
        const res = await request(app)
            .get('/time-tracking')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        const entries = res.body.data.entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].userId).toBe(TECH);
    });

    it('ignores a technician trying to read a colleague via ?userId', async () => {
        const res = await request(app)
            .get('/time-tracking?userId=other_tech')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(200);
        const entries = res.body.data.entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].userId).toBe(TECH);
    });

    it('lets the office read the whole company timesheet', async () => {
        const res = await request(app)
            .get('/time-tracking')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.body.data.entries).toHaveLength(2);
    });
});

describe('GET /time-tracking/:id', () => {
    it('refuses a technician reading a colleague entry', async () => {
        const res = await request(app)
            .get('/time-tracking/te_2')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(404);
    });
});
