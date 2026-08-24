import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';

const createVanSchema = z.object({
    name: z.string().min(1),
    registration: z.string().optional(),
});

const updateVanSchema = z.object({
    name: z.string().min(1).optional(),
    registration: z.string().optional().nullable(),
    active: z.boolean().optional(),
    branchId: z.string().uuid().optional().nullable(),
    odometerKm: z.number().int().optional().nullable(),
    fuelType: z.string().optional().nullable(),
    nextServiceKm: z.number().int().optional().nullable(),
    nextServiceAt: z.string().datetime().optional().nullable(),
    serviceIntervalKm: z.number().int().optional().nullable(),
});

const addMemberSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(['DRIVER', 'MEMBER']).default('MEMBER'),
});

const useStockSchema = z.object({
    jobId: z.string().uuid(),
    quantity: z.number().int().positive().default(1),
});

export const vansService = {
    create: async (companyId: string, input: unknown) => {
        const parsed = createVanSchema.parse(input);
        return prisma.van.create({
            data: { companyId, ...parsed },
            include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } } } },
        });
    },

    getAll: async (companyId: string) => {
        return prisma.van.findMany({
            where: { companyId },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } },
                    },
                },
                _count: { select: { jobs: true, inventory: true } },
            },
            orderBy: { name: 'asc' },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const van = await prisma.van.findFirst({
            where: { id, companyId },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
                    },
                },
                inventory: { orderBy: { name: 'asc' } },
                jobs: {
                    where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELED'] } },
                    orderBy: { scheduledStart: 'asc' },
                    include: {
                        customer: { select: { name: true } },
                        property: { select: { addressLine1: true, city: true } },
                    },
                },
            },
        });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);
        return van;
    },

    update: async (id: string, companyId: string, input: unknown) => {
        const parsed = updateVanSchema.parse(input);
        const van = await prisma.van.findFirst({ where: { id, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const data: any = { ...parsed };
        if (parsed.nextServiceAt !== undefined) {
            data.nextServiceAt = parsed.nextServiceAt ? new Date(parsed.nextServiceAt) : null;
        }
        // Clear alert suppression when next-service moves forward.
        if (parsed.nextServiceAt || parsed.nextServiceKm != null) {
            data.serviceAlertSentAt = null;
        }

        return prisma.van.update({
            where: { id },
            data,
            include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } } },
        });
    },

    addMember: async (vanId: string, companyId: string, input: unknown) => {
        const parsed = addMemberSchema.parse(input);
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const user = await prisma.user.findFirst({ where: { id: parsed.userId, companyId, status: 'ACTIVE' } });
        if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);

        const existing = await prisma.vanMember.findUnique({ where: { vanId_userId: { vanId, userId: parsed.userId } } });
        if (existing) throw new AppError('User is already a member of this van', StatusCodes.CONFLICT);

        if (parsed.role === 'DRIVER') {
            await prisma.vanMember.updateMany({
                where: { vanId, role: 'DRIVER' },
                data: { role: 'MEMBER' },
            });
        }

        return prisma.vanMember.create({
            data: { vanId, userId: parsed.userId, role: parsed.role },
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
        });
    },

    removeMember: async (vanId: string, userId: string, companyId: string) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const member = await prisma.vanMember.findUnique({ where: { vanId_userId: { vanId, userId } } });
        if (!member) throw new AppError('Member not found on this van', StatusCodes.NOT_FOUND);

        await prisma.vanMember.delete({ where: { id: member.id } });
        return { deleted: true };
    },

    getVanForUser: async (userId: string, companyId: string) => {
        const membership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            include: {
                van: {
                    include: {
                        members: {
                            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
                        },
                    },
                },
            },
        });
        return membership?.van ?? null;
    },

    getVanInventory: async (vanId: string, companyId: string, role?: string) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const items = await prisma.inventoryItem.findMany({
            where: { companyId, vanId },
            orderBy: { name: 'asc' },
        });

        // Techs manage stock counts but must not see what parts cost the company.
        if (role === 'TECHNICIAN') {
            return items.map(({ unitCost, ...rest }) => rest);
        }
        return items;
    },

    /**
     * Tech-initiated restock request for a single van item. Creates an OPEN
     * InventoryAlert (the same record the office already triages / drafts POs
     * from) so no new model or migration is needed. De-dupes against any open
     * alert for the same item so repeated taps don't spam the office queue.
     */
    requestRestock: async (
        vanId: string,
        itemId: string,
        companyId: string,
        userId: string,
        role?: string,
    ) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        // Techs may only request restock for a van they belong to.
        if (role === 'TECHNICIAN') {
            const membership = await prisma.vanMember.findFirst({
                where: { userId, van: { id: vanId, companyId } },
            });
            if (!membership) {
                throw new AppError('You can only request restock for your own van', StatusCodes.FORBIDDEN);
            }
        }

        const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, companyId, vanId } });
        if (!item) throw new AppError('Item not found on this van', StatusCodes.NOT_FOUND);

        // Target: an existing par level if configured, else reorderQty / minLevel.
        const target = await prisma.vanInventoryTarget.findFirst({
            where: { companyId, vanId, inventoryItemId: itemId, active: true },
        });
        const targetQty = target?.parLevel || item.reorderQty || Math.max(item.minLevel * 2, item.minLevel + 1, 1);

        // De-dupe: reuse the existing open alert if one is already queued.
        const existing = await prisma.inventoryAlert.findFirst({
            where: { companyId, vanId, inventoryItemId: itemId, status: 'OPEN' },
        });
        if (existing) return { alert: existing, alreadyRequested: true };

        const alert = await prisma.inventoryAlert.create({
            data: {
                companyId,
                vanId,
                inventoryItemId: itemId,
                status: 'OPEN',
                message: `Restock requested: ${item.name} on ${van.name} (${item.quantity} on hand).`,
                currentQty: item.quantity,
                targetQty,
            },
        });

        socketService.emitToCompany(companyId, 'inventory:alert', {
            vanId,
            itemId,
            current: item.quantity,
            target: targetQty,
            requested: true,
        });

        return { alert, alreadyRequested: false };
    },

    /**
     * Record stock consumed on a job. Decrements the van item's quantity and
     * writes an AuditLog row attributing the drop to a job, so the office can
     * see *why* van stock moved (audit #9 "used on job") without a new model or
     * migration. Techs may only draw from a van they crew, for a job assigned to
     * them or their van. Returns the updated item, with cost stripped for techs.
     */
    useStock: async (
        vanId: string,
        itemId: string,
        companyId: string,
        userId: string,
        role: string | undefined,
        input: unknown,
    ) => {
        const { jobId, quantity } = useStockSchema.parse(input);

        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        // Techs may only draw from a van they belong to.
        if (role === 'TECHNICIAN') {
            const membership = await prisma.vanMember.findFirst({
                where: { userId, van: { id: vanId, companyId } },
            });
            if (!membership) {
                throw new AppError('You can only use stock from your own van', StatusCodes.FORBIDDEN);
            }
        }

        const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, companyId, vanId } });
        if (!item) throw new AppError('Item not found on this van', StatusCodes.NOT_FOUND);
        if (item.quantity < quantity) {
            throw new AppError('Not enough stock on the van to use that quantity', StatusCodes.BAD_REQUEST);
        }

        // The job must exist in the company; a tech must be assigned to it (or its van).
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        if (role === 'TECHNICIAN') {
            const assigned = job.techId === userId || (job.vanId != null && job.vanId === vanId);
            if (!assigned) {
                throw new AppError('You can only log usage against a job assigned to you', StatusCodes.FORBIDDEN);
            }
        }

        const remaining = item.quantity - quantity;
        const updated = await prisma.inventoryItem.update({
            where: { id: itemId },
            data: { quantity: remaining },
        });

        await prisma.auditLog.create({
            data: {
                companyId,
                userId,
                action: 'VAN_STOCK_USED',
                entityId: itemId,
                entityType: 'INVENTORY_ITEM',
                metadata: { vanId, jobId, itemName: item.name, quantityUsed: quantity, remaining },
            },
        });

        // Auto-raise a restock request when usage drops the item to/below par.
        if (remaining <= item.minLevel) {
            const openAlert = await prisma.inventoryAlert.findFirst({
                where: { companyId, vanId, inventoryItemId: itemId, status: 'OPEN' },
            });
            if (!openAlert) {
                await prisma.inventoryAlert.create({
                    data: {
                        companyId,
                        vanId,
                        inventoryItemId: itemId,
                        status: 'OPEN',
                        message: `Low after job usage: ${item.name} on ${van.name} (${remaining} on hand).`,
                        currentQty: remaining,
                        targetQty: item.reorderQty || Math.max(item.minLevel * 2, item.minLevel + 1, 1),
                    },
                });
            }
        }

        socketService.emitToCompany(companyId, 'inventory:used', {
            vanId,
            itemId,
            jobId,
            quantityUsed: quantity,
            remaining,
        });

        // Strip cost for techs, mirroring getVanInventory.
        if (role === 'TECHNICIAN') {
            const { unitCost, ...rest } = updated as Record<string, unknown>;
            return { item: rest };
        }
        return { item: updated };
    },

    /**
     * Office/dispatch view of parts consumed on this van, per job. Reads the
     * VAN_STOCK_USED audit trail written by `useStock` and enriches each entry
     * with the job title and the tech's name. metadata.vanId is the source of
     * truth (items can move vans), so we filter on it rather than the item's
     * current van.
     */
    getStockUsage: async (vanId: string, companyId: string, limit = 100) => {
        const van = await prisma.van.findFirst({ where: { id: vanId, companyId } });
        if (!van) throw new AppError('Van not found', StatusCodes.NOT_FOUND);

        const logs = await prisma.auditLog.findMany({
            where: { companyId, action: 'VAN_STOCK_USED', entityType: 'INVENTORY_ITEM' },
            orderBy: { createdAt: 'desc' },
            take: limit * 4, // over-fetch: we filter to this van in memory below
        });

        const forVan = logs
            .filter((l) => (l.metadata as Record<string, unknown> | null)?.vanId === vanId)
            .slice(0, limit);

        const jobIds = [...new Set(forVan.map((l) => (l.metadata as any)?.jobId).filter(Boolean))];
        const userIds = [...new Set(forVan.map((l) => l.userId).filter(Boolean))];

        const [jobs, users] = await Promise.all([
            jobIds.length
                ? prisma.job.findMany({ where: { id: { in: jobIds }, companyId }, select: { id: true, title: true } })
                : Promise.resolve([]),
            userIds.length
                ? prisma.user.findMany({
                      where: { id: { in: userIds }, companyId },
                      select: { id: true, firstName: true, lastName: true, email: true },
                  })
                : Promise.resolve([]),
        ]);

        const jobTitle = new Map(jobs.map((j: any) => [j.id, j.title]));
        const userName = new Map(
            users.map((u: any) => [
                u.id,
                [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Technician',
            ])
        );

        return {
            usage: forVan.map((l) => {
                const meta = (l.metadata as any) ?? {};
                return {
                    id: l.id,
                    createdAt: l.createdAt,
                    itemName: meta.itemName ?? 'Item',
                    quantityUsed: meta.quantityUsed ?? 0,
                    remaining: meta.remaining ?? null,
                    jobId: meta.jobId ?? null,
                    jobTitle: meta.jobId ? jobTitle.get(meta.jobId) ?? 'Job' : null,
                    userName: l.userId ? userName.get(l.userId) ?? 'Technician' : 'Technician',
                };
            }),
        };
    },
};
