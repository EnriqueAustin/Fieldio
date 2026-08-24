import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Swap the real database for the shared in-memory fake before any router
// (and its service layer) is imported.
vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

import { fakePrisma } from './helpers/db';
import { buildTestApp, authHeader } from './helpers/app';

const app = buildTestApp();
const COMPANY = 'company_1';
const TECH = 'user_test'; // matches authHeader default userId
const JOB = '44444444-4444-4444-4444-444444444444';

function seedVanWithStock(overrides: { item?: Record<string, any>; member?: boolean } = {}) {
    fakePrisma.van.seed([{ id: 'van_1', companyId: COMPANY, name: 'Van 1', active: true }]);
    fakePrisma.inventoryItem.seed([
        {
            id: 'item_1',
            companyId: COMPANY,
            vanId: 'van_1',
            name: 'Copper Pipe 15mm',
            sku: 'CP-15',
            quantity: 10,
            minLevel: 3,
            reorderQty: 20,
            unitCost: 42.5,
            location: 'VAN',
            ...overrides.item,
        },
    ]);
    if (overrides.member !== false) {
        fakePrisma.vanMember.seed([{ id: 'vm_1', vanId: 'van_1', userId: TECH, role: 'MEMBER' }]);
    }
}

function seedJob(overrides: Record<string, any> = {}) {
    fakePrisma.job.seed([
        {
            id: JOB,
            companyId: COMPANY,
            techId: TECH,
            vanId: 'van_1',
            customerId: 'cust_1',
            status: 'ON_SITE',
            ...overrides,
        },
    ]);
}

beforeEach(() => {
    fakePrisma.$reset();
});

describe('POST /vans/:id/inventory/:itemId/request-restock', () => {
    it('lets an assigned technician raise an OPEN restock alert', async () => {
        seedVanWithStock({ item: { quantity: 2 } });

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(201);
        expect(res.body.data.alreadyRequested).toBe(false);
        expect(res.body.data.alert.status).toBe('OPEN');

        const alerts = await fakePrisma.inventoryAlert.findMany({ where: { inventoryItemId: 'item_1' } });
        expect(alerts).toHaveLength(1);
        // Target falls back to reorderQty when no par level is configured.
        expect(alerts[0].targetQty).toBe(20);
    });

    it('de-dupes: a second request reuses the open alert instead of stacking', async () => {
        seedVanWithStock({ item: { quantity: 2 } });

        const first = await request(app)
            .post('/vans/van_1/inventory/item_1/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});
        expect(first.body.data.alreadyRequested).toBe(false);

        const second = await request(app)
            .post('/vans/van_1/inventory/item_1/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});
        expect(second.status).toBe(201);
        expect(second.body.data.alreadyRequested).toBe(true);

        const alerts = await fakePrisma.inventoryAlert.findMany({ where: { inventoryItemId: 'item_1' } });
        expect(alerts).toHaveLength(1);
    });

    it('rejects a technician who is not a member of the van', async () => {
        seedVanWithStock({ member: false });

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/your own van/i);
    });

    it('404s when the item is not on this van', async () => {
        seedVanWithStock();

        const res = await request(app)
            .post('/vans/van_1/inventory/missing_item/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({});

        expect(res.status).toBe(404);
    });

    it('404s for a van in another company', async () => {
        seedVanWithStock();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/request-restock')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH, companyId: 'other_co' }))
            .send({});

        expect(res.status).toBe(404);
    });
});

describe('POST /vans/:id/inventory/:itemId/use', () => {
    it('decrements van stock and writes a job-attributed audit log', async () => {
        seedVanWithStock({ item: { quantity: 10 } });
        seedJob();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 3 });

        expect(res.status).toBe(201);
        expect(res.body.data.item.quantity).toBe(7);

        const item = await fakePrisma.inventoryItem.findFirst({ where: { id: 'item_1' } });
        expect(item.quantity).toBe(7);

        const logs = await fakePrisma.auditLog.findMany({ where: { action: 'VAN_STOCK_USED' } });
        expect(logs).toHaveLength(1);
        expect(logs[0].metadata).toMatchObject({ vanId: 'van_1', jobId: JOB, quantityUsed: 3, remaining: 7 });
    });

    it('never leaks unit cost to a technician', async () => {
        seedVanWithStock({ item: { quantity: 10 } });
        seedJob();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 1 });

        expect(res.status).toBe(201);
        expect(res.body.data.item).not.toHaveProperty('unitCost');
        expect(JSON.stringify(res.body)).not.toMatch(/unitCost/i);
    });

    it('auto-raises a restock alert when usage drops the item to par', async () => {
        seedVanWithStock({ item: { quantity: 4, minLevel: 3 } });
        seedJob();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 2 }); // 4 -> 2, at/below minLevel 3

        expect(res.status).toBe(201);
        const alerts = await fakePrisma.inventoryAlert.findMany({ where: { inventoryItemId: 'item_1' } });
        expect(alerts).toHaveLength(1);
        expect(alerts[0].currentQty).toBe(2);
    });

    it('rejects using more than what is on the van', async () => {
        seedVanWithStock({ item: { quantity: 1 } });
        seedJob();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 5 });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/not enough/i);
    });

    it('rejects logging usage against a job not assigned to the technician', async () => {
        seedVanWithStock({ item: { quantity: 10 } });
        // Job belongs to someone else and a different van.
        seedJob({ techId: 'other_tech', vanId: 'van_other' });

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 1 });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/assigned to you/i);
    });

    it('rejects a technician who is not a member of the van', async () => {
        seedVanWithStock({ item: { quantity: 10 }, member: false });
        seedJob();

        const res = await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 1 });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/your own van/i);
    });
});

describe('GET /vans/:id/stock-usage', () => {
    it('returns this van\'s usage trail enriched with job title and tech name', async () => {
        seedVanWithStock({ item: { quantity: 10 } });
        seedJob({ title: 'Geyser swap — 12 Oak Ave' });
        fakePrisma.user.seed([{ id: TECH, companyId: COMPANY, firstName: 'Sipho', lastName: 'M' }]);

        // One usage on this van, one on a different van (must be filtered out).
        await request(app)
            .post('/vans/van_1/inventory/item_1/use')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }))
            .send({ jobId: JOB, quantity: 2 });
        fakePrisma.auditLog.seed([
            {
                id: 'al_other',
                companyId: COMPANY,
                userId: TECH,
                action: 'VAN_STOCK_USED',
                entityType: 'INVENTORY_ITEM',
                entityId: 'item_other',
                metadata: { vanId: 'van_other', jobId: JOB, itemName: 'Elsewhere', quantityUsed: 9, remaining: 1 },
            },
        ]);

        const res = await request(app)
            .get('/vans/van_1/stock-usage')
            .set('Authorization', authHeader({ role: 'OFFICE' }));

        expect(res.status).toBe(200);
        expect(res.body.data.usage).toHaveLength(1);
        expect(res.body.data.usage[0]).toMatchObject({
            itemName: 'Copper Pipe 15mm',
            quantityUsed: 2,
            jobTitle: 'Geyser swap — 12 Oak Ave',
            userName: 'Sipho M',
        });
    });

    it('forbids a technician from the office usage view', async () => {
        seedVanWithStock();

        const res = await request(app)
            .get('/vans/van_1/stock-usage')
            .set('Authorization', authHeader({ role: 'TECHNICIAN', userId: TECH }));

        expect(res.status).toBe(403);
    });

    it('404s for a van in another company', async () => {
        seedVanWithStock();

        const res = await request(app)
            .get('/vans/van_1/stock-usage')
            .set('Authorization', authHeader({ role: 'OFFICE', companyId: 'other_co' }));

        expect(res.status).toBe(404);
    });
});
