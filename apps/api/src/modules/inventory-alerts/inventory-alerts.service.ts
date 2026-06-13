import { prisma } from '@fieldio/database';
import { logger } from '../../utils/logger';
import { socketService } from '../../services/socket.service';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { normalizeCompanySettings } from '../company/company-settings';

export const inventoryAlertsService = {
    listTargets: (companyId: string, vanId?: string) =>
        prisma.vanInventoryTarget.findMany({
            where: { companyId, active: true, ...(vanId && { vanId }) },
            orderBy: { createdAt: 'asc' },
        }),

    setTarget: async (
        companyId: string,
        data: { vanId: string; inventoryItemId: string; parLevel: number }
    ) =>
        prisma.vanInventoryTarget.upsert({
            where: { vanId_inventoryItemId: { vanId: data.vanId, inventoryItemId: data.inventoryItemId } },
            update: { parLevel: data.parLevel, active: true },
            create: { companyId, ...data },
        }),

    removeTarget: (companyId: string, id: string) =>
        prisma.vanInventoryTarget.updateMany({ where: { id, companyId }, data: { active: false } }),

    listAlerts: (companyId: string, status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' = 'OPEN') =>
        prisma.inventoryAlert.findMany({
            where: { companyId, status },
            include: { van: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 200,
        }),

    acknowledge: (companyId: string, id: string) =>
        prisma.inventoryAlert.updateMany({ where: { companyId, id }, data: { status: 'ACKNOWLEDGED' } }),

    resolve: (companyId: string, id: string) =>
        prisma.inventoryAlert.updateMany({ where: { companyId, id }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),

    /** Draft a PO from one or more open alerts, grouped by supplier. */
    createPOFromAlerts: async (companyId: string, userId: string, alertIds: string[]) => {
        if (alertIds.length === 0) throw new AppError('No alerts selected', StatusCodes.BAD_REQUEST);

        const alerts = await prisma.inventoryAlert.findMany({
            where: { companyId, id: { in: alertIds }, status: 'OPEN' },
        });
        if (alerts.length === 0) throw new AppError('No matching open alerts', StatusCodes.NOT_FOUND);

        const itemIds = Array.from(new Set(alerts.map(a => a.inventoryItemId)));
        const items = await prisma.inventoryItem.findMany({
            where: { companyId, id: { in: itemIds } },
            include: { defaultSupplier: true },
        });
        const itemById = new Map(items.map(i => [i.id, i]));

        // Group by supplier
        const bySupplier = new Map<string, { items: any[]; alertIds: string[] }>();
        const orphans: string[] = [];
        for (const a of alerts) {
            const item = itemById.get(a.inventoryItemId);
            if (!item) continue;
            if (!item.defaultSupplierId) {
                orphans.push(item.name);
                continue;
            }
            const qty = Math.max(
                a.targetQty - a.currentQty,
                item.reorderQty || (a.targetQty - a.currentQty),
                1
            );
            const entry = bySupplier.get(item.defaultSupplierId) ?? { items: [], alertIds: [] };
            entry.items.push({
                name: item.name,
                description: item.sku ? `SKU ${item.sku}` : undefined,
                quantity: qty,
                unitPrice: Number(item.unitCost ?? 0),
            });
            entry.alertIds.push(a.id);
            bySupplier.set(item.defaultSupplierId, entry);
        }

        if (bySupplier.size === 0) {
            throw new AppError(
                `No default supplier set for: ${orphans.join(', ') || 'these items'}. Edit the inventory items and assign a supplier first.`,
                StatusCodes.BAD_REQUEST,
            );
        }

        const company = await prisma.company.findUnique({ where: { id: companyId } });
        const settings = normalizeCompanySettings(company?.settings);
        const taxRate = settings.billing.taxRate / 100;

        const created: any[] = [];
        for (const [supplierId, group] of bySupplier.entries()) {
            const subtotal = group.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
            const tax = subtotal * taxRate;
            const total = subtotal + tax;

            const poCount = await prisma.purchaseOrder.count({ where: { companyId } });
            const orderNumber = `PO-${String(poCount + 1).padStart(5, '0')}`;

            const po = await prisma.purchaseOrder.create({
                data: {
                    companyId,
                    supplierId,
                    orderNumber,
                    items: group.items as any,
                    subtotal,
                    tax,
                    total,
                    notes: `Auto-drafted from low-stock alerts (${group.alertIds.length}).`,
                },
                include: { supplier: { select: { id: true, name: true } } },
            });

            await prisma.inventoryAlert.updateMany({
                where: { id: { in: group.alertIds } },
                data: { status: 'ACKNOWLEDGED' },
            });

            await prisma.auditLog.create({
                data: {
                    companyId, userId,
                    action: 'PO_AUTO_DRAFTED',
                    entityId: po.id,
                    entityType: 'PURCHASE_ORDER',
                    metadata: { fromAlerts: group.alertIds, orderNumber },
                },
            });

            created.push(po);
        }

        return { purchaseOrders: created, skipped: orphans };
    },

    /** Daily sweep across all targets — fire alerts for under-par stock. */
    runSweep: async () => {
        const targets = await prisma.vanInventoryTarget.findMany({
            where: { active: true },
            include: { van: true },
        });

        let created = 0;
        for (const t of targets) {
            const item = await prisma.inventoryItem.findFirst({ where: { id: t.inventoryItemId } });
            if (!item) continue;
            if (item.quantity >= t.parLevel) continue;

            // De-dupe: skip if there's an open alert already
            const existing = await prisma.inventoryAlert.findFirst({
                where: { companyId: t.companyId, vanId: t.vanId, inventoryItemId: t.inventoryItemId, status: 'OPEN' },
            });
            if (existing) continue;

            await prisma.inventoryAlert.create({
                data: {
                    companyId: t.companyId,
                    vanId: t.vanId,
                    inventoryItemId: t.inventoryItemId,
                    message: `${item.name} on ${t.van.name} is below par (${item.quantity}/${t.parLevel}).`,
                    currentQty: item.quantity,
                    targetQty: t.parLevel,
                },
            });
            socketService.emitToCompany(t.companyId, 'inventory:alert', {
                vanId: t.vanId,
                itemId: t.inventoryItemId,
                current: item.quantity,
                target: t.parLevel,
            });
            created++;
        }
        logger.info({ created, scanned: targets.length }, 'Inventory alert sweep complete');
        return { created, scanned: targets.length };
    },
};

export const startInventoryAlertScheduler = () => {
    const interval = 6 * 60 * 60 * 1000; // 4×/day
    const run = async () => {
        try { await inventoryAlertsService.runSweep(); }
        catch (err) { logger.error({ err }, 'Inventory alert sweep crashed'); }
    };
    setInterval(run, interval);
    setTimeout(run, 120_000);
};
