import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// The price book feeds quotes, job line items and field quoting, so a new
// company must be able to fill it. Office roles manage it; technicians may read
// it but never see prices or costs.

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { priceBookRouter } from '../src/routes/priceBook';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/price-book', priceBookRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const COMPANY = 'company_1';
const EXISTING = 'pb_existing';

const tech = authHeader({ role: 'TECHNICIAN', userId: 'tech_1' });
const office = authHeader({ role: 'OFFICE' });
const admin = authHeader({ role: 'ADMIN' });

beforeEach(() => {
    fakePrisma.$reset();
    fakePrisma.priceBookItem.seed([
        { id: EXISTING, companyId: COMPANY, name: 'Geyser valve', sku: 'GV-01', unitPrice: 450, costPrice: 210, type: 'MATERIAL', category: 'Parts', active: true },
    ]);
});

describe('reads', () => {
    it('lists items with pagination meta for office', async () => {
        const res = await request(app).get('/price-book').set('Authorization', office);
        expect(res.status).toBe(200);
        expect(res.body.data.items[0].name).toBe('Geyser valve');
        expect(res.body.data.items[0].unitPrice).toBe(450);
        expect(res.body.data.items[0].costPrice).toBe(210);
        expect(res.body.data.count).toBe(1);
        expect(res.body.data.totalPages).toBe(1);
    });

    it('strips unitPrice and costPrice for technicians on list and detail', async () => {
        const list = await request(app).get('/price-book').set('Authorization', tech);
        expect(list.status).toBe(200);
        expect(list.body.data.items[0].name).toBe('Geyser valve');
        expect(list.body.data.items[0]).not.toHaveProperty('unitPrice');
        expect(list.body.data.items[0]).not.toHaveProperty('costPrice');

        const one = await request(app).get(`/price-book/${EXISTING}`).set('Authorization', tech);
        expect(one.status).toBe(200);
        expect(one.body.data.item).not.toHaveProperty('unitPrice');
        expect(one.body.data.item).not.toHaveProperty('costPrice');
    });
});

describe('writes are restricted to office roles', () => {
    it('TECHNICIAN gets 403 on create, update, bulk and delete', async () => {
        const create = await request(app).post('/price-book').set('Authorization', tech).send({ name: 'x', unitPrice: 10 });
        expect(create.status).toBe(403);

        const update = await request(app).patch(`/price-book/${EXISTING}`).set('Authorization', tech).send({ unitPrice: 5 });
        expect(update.status).toBe(403);

        const bulk = await request(app).post('/price-book/bulk').set('Authorization', tech).send({ rows: [] });
        expect(bulk.status).toBe(403);

        const del = await request(app).delete(`/price-book/${EXISTING}`).set('Authorization', tech);
        expect(del.status).toBe(403);
    });

    it('OFFICE can create and the price rounds to cents', async () => {
        const res = await request(app)
            .post('/price-book')
            .set('Authorization', office)
            .send({ name: 'Call-out fee', unitPrice: 350.555, costPrice: 100, type: 'SERVICE', category: 'Labour' });
        expect(res.status).toBe(201);
        expect(res.body.data.item.name).toBe('Call-out fee');
        expect(res.body.data.item.unitPrice).toBe(350.56);
    });

    it('OFFICE can update an item', async () => {
        const res = await request(app)
            .patch(`/price-book/${EXISTING}`)
            .set('Authorization', office)
            .send({ unitPrice: 500 });
        expect(res.status).toBe(200);
        expect(res.body.data.item.unitPrice).toBe(500);
    });

    it('ADMIN can archive (soft-delete) an item', async () => {
        const res = await request(app).delete(`/price-book/${EXISTING}`).set('Authorization', admin);
        expect(res.status).toBe(200);
        expect(res.body.data.item.active).toBe(false);
        const row = await fakePrisma.priceBookItem.findFirst({ where: { id: EXISTING } });
        expect(row.active).toBe(false);
    });
});

describe('bulk import', () => {
    it('upserts by SKU, creates new rows, and reports row errors', async () => {
        const res = await request(app)
            .post('/price-book/bulk')
            .set('Authorization', office)
            .send({
                rows: [
                    // Matches existing SKU GV-01 -> update
                    { name: 'Geyser valve XL', sku: 'GV-01', unitPrice: '499.99', costPrice: '250' },
                    // New SKU -> create
                    { name: 'Copper pipe 15mm', sku: 'CP-15', unitPrice: '89.00', type: 'material' },
                    // No name -> error
                    { sku: 'BAD-1', unitPrice: '10' },
                    // Bad price -> error
                    { name: 'No price', unitPrice: 'abc' },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.data.created).toBe(1);
        expect(res.body.data.updated).toBe(1);
        expect(res.body.data.errors).toHaveLength(2);
        expect(res.body.data.errors.map((e: any) => e.row).sort()).toEqual([3, 4]);

        // The existing item was updated in place, not duplicated.
        const updated = await fakePrisma.priceBookItem.findFirst({ where: { sku: 'GV-01' } });
        expect(updated.name).toBe('Geyser valve XL');
        expect(updated.unitPrice).toBe(499.99);

        // New item was created with upper-cased type.
        const created = await fakePrisma.priceBookItem.findFirst({ where: { sku: 'CP-15' } });
        expect(created.type).toBe('MATERIAL');
    });

    it('rejects an import over the 2000-row cap', async () => {
        const rows = Array.from({ length: 2001 }, (_, i) => ({ name: `Item ${i}`, unitPrice: 1 }));
        const res = await request(app).post('/price-book/bulk').set('Authorization', office).send({ rows });
        expect(res.status).toBe(400);
    });
});
