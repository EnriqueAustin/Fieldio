import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Router } from 'express';

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser, requireUser, restrictTo } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { catchAsync } from '../src/utils/catchAsync';
import { inventoryController } from '../src/modules/inventory/inventory.controller';

// Mirrors how routes/operations.ts (another worker's file) mounts the inventory
// controller, so the create/edit/strip behaviour is exercised end to end.
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    const r = Router();
    r.use(requireUser);
    r.get('/inventory', catchAsync(inventoryController.getAll));
    r.post('/inventory', restrictTo('ADMIN', 'OFFICE'), catchAsync(inventoryController.create));
    r.patch('/inventory/:id', catchAsync(inventoryController.update));
    app.use('/operations', r);
    app.use(errorHandler);
    return app;
}
const app = buildApp();

const COMPANY = 'company_1';
const office = authHeader({ role: 'OFFICE', companyId: COMPANY, userId: 'office_1' });
const tech = authHeader({ role: 'TECHNICIAN', companyId: COMPANY, userId: 'tech_1' });

beforeEach(() => {
    fakePrisma.$reset();
});

describe('POST /operations/inventory', () => {
    it('creates an item without a SKU (one is auto-generated)', async () => {
        const res = await request(app)
            .post('/operations/inventory')
            .set('Authorization', office)
            .send({ name: 'Copper Pipe 15mm', quantity: 10, minLevel: 5 });

        expect(res.status).toBe(201);
        expect(res.body.data.item.sku).toBeTruthy();
        expect(res.body.data.item.name).toBe('Copper Pipe 15mm');
    });

    it('accepts the legacy minLevel/minQuantity alias', async () => {
        const res = await request(app)
            .post('/operations/inventory')
            .set('Authorization', office)
            .send({ name: 'Ball Valve', quantity: 4, minQuantity: 3 });

        expect(res.status).toBe(201);
        expect(res.body.data.item.minLevel).toBe(3);
    });

    it('rejects a duplicate SKU within the company (409)', async () => {
        await request(app).post('/operations/inventory').set('Authorization', office)
            .send({ name: 'Elbow', sku: 'ELB-1', quantity: 1 }).expect(201);

        const res = await request(app)
            .post('/operations/inventory')
            .set('Authorization', office)
            .send({ name: 'Elbow 2', sku: 'ELB-1', quantity: 1 });

        expect(res.status).toBe(409);
    });

    it('is forbidden for a technician (403)', async () => {
        const res = await request(app)
            .post('/operations/inventory')
            .set('Authorization', tech)
            .send({ name: 'Secret part', quantity: 1 });

        expect(res.status).toBe(403);
    });
});

describe('PATCH /operations/inventory/:id (meta edit)', () => {
    const ITEM = 'item_1';
    beforeEach(() => {
        fakePrisma.inventoryItem.seed([{
            id: ITEM, companyId: COMPANY, name: 'Flux', sku: 'FLX-1',
            quantity: 20, minLevel: 5, unitCost: 42.5, location: 'WAREHOUSE', reorderQty: 0,
        }]);
    });

    it('office updates item metadata', async () => {
        const res = await request(app)
            .patch(`/operations/inventory/${ITEM}`)
            .set('Authorization', office)
            .send({ minLevel: 8, unitCost: 50 });

        expect(res.status).toBe(200);
        expect(res.body.data.item.minLevel).toBe(8);
    });

    it('is forbidden for a technician editing metadata (403)', async () => {
        const res = await request(app)
            .patch(`/operations/inventory/${ITEM}`)
            .set('Authorization', tech)
            .send({ name: 'Renamed' });

        expect(res.status).toBe(403);
    });
});

describe('GET /operations/inventory — cost visibility', () => {
    const ITEM = 'item_cost';
    beforeEach(() => {
        fakePrisma.inventoryItem.seed([{
            id: ITEM, companyId: COMPANY, name: 'Solder', sku: 'SLD-1',
            quantity: 5, minLevel: 2, unitCost: 99.99, location: 'VAN',
        }]);
    });

    it('strips unitCost for a technician', async () => {
        const res = await request(app).get('/operations/inventory').set('Authorization', tech);
        expect(res.status).toBe(200);
        expect(res.body.data.items[0]).not.toHaveProperty('unitCost');
    });

    it('keeps unitCost for the office', async () => {
        const res = await request(app).get('/operations/inventory').set('Authorization', office);
        expect(res.status).toBe(200);
        expect(res.body.data.items[0]).toHaveProperty('unitCost');
    });
});
