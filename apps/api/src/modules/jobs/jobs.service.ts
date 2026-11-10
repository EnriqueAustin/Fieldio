import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';
import { PUBLIC_USER_SELECT } from '../../utils/publicSelects';
import { closeOpenEntries } from '../time-tracking/timeTracking.service';
import { formatInTimeZone, getCompanyTimezone, startOfDayInTimeZone } from '../../utils/timezone';
import { getMissingRequiredForm } from '../digital-forms/digital-forms.service';

const createJobSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    customerId: z.string().uuid(),
    propertyId: z.string().uuid(),
    techId: z.string().uuid().optional(),
    vanId: z.string().uuid().optional().nullable(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd: z.string().datetime().optional(),
    lineItems: z.array(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        quantity: z.number().positive().default(1),
        unitPrice: z.number().min(0),
        type: z.enum(['SERVICE', 'MATERIAL', 'LABOR']).default('SERVICE'),
    })).optional(),
    checklist: z.array(z.string().min(1)).optional(),
});

const updateJobSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
    techId: z.string().uuid().nullable().optional(),
    vanId: z.string().uuid().nullable().optional(),
    scheduledStart: z.string().datetime().nullable().optional(),
    scheduledEnd: z.string().datetime().nullable().optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELED']),
});

const addNoteSchema = z.object({
    message: z.string().min(1),
});

const addSignatureSchema = z.object({
    signerName: z.string().min(1),
    signatureDataUrl: z.string().optional(),
    signatureUrl: z.string().optional(),
});

const addLineItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().min(0),
    type: z.enum(['SERVICE', 'MATERIAL', 'LABOR']).default('SERVICE'),
    priceBookItemId: z.string().uuid().optional(),
});

const addChecklistSchema = z.object({
    label: z.string().min(1),
});

const quickCreateSchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    customerName: z.string().min(1),
    customerPhone: z.string().optional(),
    customerEmail: z.string().email().optional().or(z.literal('')),
    // Optional here, then required below only when no existing site was picked.
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional().default(''),
    zip: z.string().optional().default(''),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
    techId: z.string().uuid().optional(),
    vanId: z.string().uuid().optional().nullable(),
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd: z.string().datetime().optional(),
    existingCustomerId: z.string().uuid().optional(),
    existingPropertyId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
}).superRefine((val, ctx) => {
    if (val.existingPropertyId) return;
    if (!val.addressLine1?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addressLine1'], message: 'Required' });
    }
    if (!val.city?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'Required' });
    }
});

const JOB_NOTE_ACTION = 'JOB_NOTE_ADDED';

// Forward lifecycle order for the field status transitions this endpoint accepts.
// CANCELED is terminal and reachable from any state, so it sits outside the chain.
const STATUS_FORWARD_ORDER = ['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'] as const;

/**
 * A replayed offline action can arrive out of order — e.g. an "ON_SITE" tap that
 * only reaches the server after "COMPLETED" was already recorded. Such a move
 * backwards through the lifecycle is ignored (the job is not reopened and its
 * clock is not restarted). Re-sending the same status is allowed (idempotent).
 */
function isBackwardsTransition(current: string, next: string): boolean {
    if (next === current) return false;
    if (next === 'CANCELED') return false; // a job can be canceled from any state
    const c = STATUS_FORWARD_ORDER.indexOf(current as (typeof STATUS_FORWARD_ORDER)[number]);
    const n = STATUS_FORWARD_ORDER.indexOf(next as (typeof STATUS_FORWARD_ORDER)[number]);
    if (c === -1) {
        // `current` is terminal (CANCELED): any move back into the field lifecycle
        // is a stale replay.
        return STATUS_FORWARD_ORDER.includes(next as (typeof STATUS_FORWARD_ORDER)[number]);
    }
    if (n === -1) return false;
    return n < c;
}

/**
 * The timestamp a status change should stamp. An offline tap replays later, so
 * the phone sends the real tap time as `clientAt`; we trust it only when it is a
 * valid instant inside [now - 24h, now + 2min] and not earlier than the job's
 * previous stamp. Anything else falls back to server time.
 */
function resolveEffectiveTime(
    clientAt: string | undefined,
    job: { actualStart?: Date | null; createdAt?: Date | null },
    now: Date,
): Date {
    if (!clientAt) return now;
    const d = new Date(clientAt);
    if (Number.isNaN(d.getTime())) return now;
    const earliest = now.getTime() - 24 * 60 * 60 * 1000;
    const latest = now.getTime() + 2 * 60 * 1000;
    if (d.getTime() < earliest || d.getTime() > latest) return now;
    const prior = job.actualStart ?? job.createdAt ?? null;
    if (prior && d.getTime() < new Date(prior).getTime()) return now;
    return d;
}

async function getJobNotes(companyId: string, jobIds: string[]) {
    if (jobIds.length === 0) return [];

    const notes = await prisma.auditLog.findMany({
        where: {
            companyId,
            entityType: 'JOB',
            entityId: { in: jobIds },
            action: JOB_NOTE_ACTION,
        },
        orderBy: { createdAt: 'desc' },
        include: {
            user: {
                select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
            },
        },
    });

    return notes.map((note) => ({
        id: note.id,
        jobId: note.entityId,
        message: typeof note.metadata === 'object' && note.metadata && 'message' in note.metadata
            ? String((note.metadata as Record<string, unknown>).message ?? '')
            : '',
        createdAt: note.createdAt,
        author: {
            ...note.user,
            name: [note.user.firstName, note.user.lastName].filter(Boolean).join(' ') || note.user.email,
        },
    }));
}

export const jobsService = {
    create: async (companyId: string, userId: string, input: z.infer<typeof createJobSchema>) => {
        const parsed = createJobSchema.parse(input);

        const customer = await prisma.customer.findFirst({
            where: { id: parsed.customerId, companyId, deletedAt: null },
        });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        const property = await prisma.property.findFirst({
            where: { id: parsed.propertyId, companyId, customerId: parsed.customerId },
        });
        if (!property) throw new AppError('Property not found', StatusCodes.NOT_FOUND);

        if (parsed.techId) {
            const tech = await prisma.user.findFirst({
                where: { id: parsed.techId, companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            });
            if (!tech) throw new AppError('Technician not found', StatusCodes.NOT_FOUND);
        }

        const job = await prisma.$transaction(async (tx) => {
            const created = await tx.job.create({
                data: {
                    companyId,
                    projectId: parsed.projectId,
                    customerId: parsed.customerId,
                    propertyId: parsed.propertyId,
                    techId: parsed.techId,
                    vanId: parsed.vanId ?? null,
                    title: parsed.title,
                    description: parsed.description,
                    priority: parsed.priority ?? 'MEDIUM',
                    status: (parsed.techId || parsed.vanId) ? 'ASSIGNED' : 'REQUESTED',
                    scheduledStart: parsed.scheduledStart ? new Date(parsed.scheduledStart) : null,
                    scheduledEnd: parsed.scheduledEnd ? new Date(parsed.scheduledEnd) : null,
                },
                include: { customer: true, property: true, tech: { select: PUBLIC_USER_SELECT }, van: true },
            });

            if (parsed.lineItems?.length) {
                await tx.jobLineItem.createMany({
                    data: parsed.lineItems.map((item) => ({
                        jobId: created.id,
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        total: item.quantity * item.unitPrice,
                        type: item.type,
                    })),
                });
            }

            if (parsed.checklist?.length) {
                await tx.jobChecklist.createMany({
                    data: parsed.checklist.map((label) => ({
                        jobId: created.id,
                        label,
                    })),
                });
            }

            await tx.auditLog.create({
                data: {
                    companyId,
                    userId,
                    action: 'JOB_CREATED',
                    entityId: created.id,
                    entityType: 'JOB',
                    metadata: { title: parsed.title },
                },
            });

            return created;
        });

        socketService.emitToCompany(companyId, 'job:created', job);

        if (job.techId) {
            const tech = await prisma.user.findUnique({ where: { id: job.techId } });
            if (tech) {
                await notificationService.notifyUser(
                    tech.id, companyId, 'JOB_ASSIGNED',
                    'New job assigned', `You have been assigned to: ${job.title}`
                );
                const techName = [tech.firstName, tech.lastName].filter(Boolean).join(' ') || tech.email;
                await notificationService.notifyCustomer(job.customerId, companyId, 'APPOINTMENT_REMINDER', {
                    when: job.scheduledStart
                        ? formatInTimeZone(job.scheduledStart, await getCompanyTimezone(companyId))
                        : `soon (technician: ${techName})`,
                });
            }
        }

        if (job.vanId) {
            const vanMembers = await prisma.vanMember.findMany({
                where: { vanId: job.vanId },
                include: { user: true },
            });
            for (const member of vanMembers) {
                if (member.userId !== job.techId) {
                    await notificationService.notifyUser(
                        member.userId, companyId, 'JOB_ASSIGNED',
                        'New van job', `Your van has been assigned to: ${job.title}`
                    );
                }
            }
        }

        return job;
    },

    update: async (id: string, companyId: string, userId: string, input: z.infer<typeof updateJobSchema>) => {
        const parsed = updateJobSchema.parse(input);
        const job = await prisma.job.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (parsed.techId) {
            const tech = await prisma.user.findFirst({
                where: { id: parsed.techId, companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            });
            if (!tech) throw new AppError('Technician not found', StatusCodes.NOT_FOUND);
        }

        const wasUnassigned = !job.techId && !job.vanId;
        const updated = await prisma.job.update({
            where: { id },
            data: {
                ...parsed,
                projectId: parsed.projectId,
                scheduledStart: parsed.scheduledStart !== undefined
                    ? (parsed.scheduledStart ? new Date(parsed.scheduledStart) : null)
                    : undefined,
                scheduledEnd: parsed.scheduledEnd !== undefined
                    ? (parsed.scheduledEnd ? new Date(parsed.scheduledEnd) : null)
                    : undefined,
                status: wasUnassigned && (parsed.techId || parsed.vanId) ? 'ASSIGNED' : undefined,
            },
            include: { customer: true, property: true, tech: { select: PUBLIC_USER_SELECT }, van: true },
        });

        await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: 'JOB_UPDATED',
                entityId: id,
                entityType: 'JOB',
                metadata: parsed as any,
            },
        });

        if (wasUnassigned && parsed.techId) {
            await notificationService.notifyUser(
                parsed.techId, companyId, 'JOB_ASSIGNED',
                'New job assigned', `You have been assigned to: ${updated.title}`
            );
            const tech = await prisma.user.findUnique({ where: { id: parsed.techId } });
            if (tech) {
                const techName = [tech.firstName, tech.lastName].filter(Boolean).join(' ') || tech.email;
                await notificationService.notifyCustomer(updated.customerId, companyId, 'APPOINTMENT_REMINDER', {
                    when: updated.scheduledStart
                        ? formatInTimeZone(updated.scheduledStart, await getCompanyTimezone(companyId))
                        : `soon (technician: ${techName})`,
                });
            }
        }

        socketService.emitToCompany(companyId, 'job:updated', updated);
        return updated;
    },

    addLineItem: async (jobId: string, companyId: string, input: z.infer<typeof addLineItemSchema>, userId?: string, userRole?: string) => {
        const parsed = addLineItemSchema.parse(input);
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (userRole === 'TECHNICIAN' && userId) {
            const isAssigned = job.techId === userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError('You can only add items to jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }

        if (parsed.priceBookItemId) {
            const pbItem = await prisma.priceBookItem.findFirst({
                where: { id: parsed.priceBookItemId, companyId, active: true },
            });
            if (pbItem) {
                parsed.name = pbItem.name;
                parsed.unitPrice = Number(pbItem.unitPrice);
                parsed.type = pbItem.type as any;
                if (pbItem.description) parsed.description = pbItem.description;
            }
        }

        const item = await prisma.jobLineItem.create({
            data: {
                jobId,
                name: parsed.name,
                description: parsed.description,
                quantity: parsed.quantity,
                unitPrice: parsed.unitPrice,
                total: parsed.quantity * parsed.unitPrice,
                type: parsed.type,
            },
        });

        if (parsed.type === 'MATERIAL') {
            const techId = job.techId;
            const inventoryItem = await prisma.inventoryItem.findFirst({
                where: {
                    companyId,
                    name: { equals: parsed.name, mode: 'insensitive' },
                    ...(techId ? { assignedUserId: techId, location: 'VAN' } : {}),
                },
            });

            if (inventoryItem && inventoryItem.quantity >= parsed.quantity) {
                const newQty = inventoryItem.quantity - Math.floor(parsed.quantity);
                await prisma.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: { quantity: newQty },
                });
                socketService.emitToCompany(companyId, 'inventory:deducted', {
                    itemId: inventoryItem.id,
                    name: inventoryItem.name,
                    deducted: parsed.quantity,
                    remaining: newQty,
                });

                // Immediate par-level check for the affected van
                if (inventoryItem.vanId) {
                    const target = await prisma.vanInventoryTarget.findFirst({
                        where: { vanId: inventoryItem.vanId, inventoryItemId: inventoryItem.id, active: true },
                    });
                    if (target && newQty < target.parLevel) {
                        const open = await prisma.inventoryAlert.findFirst({
                            where: {
                                companyId, vanId: inventoryItem.vanId, inventoryItemId: inventoryItem.id, status: 'OPEN',
                            },
                        });
                        if (!open) {
                            await prisma.inventoryAlert.create({
                                data: {
                                    companyId,
                                    vanId: inventoryItem.vanId,
                                    inventoryItemId: inventoryItem.id,
                                    message: `${inventoryItem.name} dropped below par after job consumption (${newQty}/${target.parLevel}).`,
                                    currentQty: newQty,
                                    targetQty: target.parLevel,
                                },
                            });
                            socketService.emitToCompany(companyId, 'inventory:alert', {
                                itemId: inventoryItem.id, vanId: inventoryItem.vanId, current: newQty, target: target.parLevel,
                            });
                        }
                    }
                }
            }
        }

        socketService.emitToCompany(companyId, 'job:lineitem:added', { jobId, item });
        return item;
    },

    removeLineItem: async (jobId: string, itemId: string, companyId: string, userId?: string, userRole?: string) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (userRole === 'TECHNICIAN' && userId) {
            const isAssigned = job.techId === userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError('You can only modify items on jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }

        const item = await prisma.jobLineItem.findFirst({ where: { id: itemId, jobId } });
        if (!item) throw new AppError('Line item not found', StatusCodes.NOT_FOUND);

        await prisma.jobLineItem.delete({ where: { id: itemId } });
        socketService.emitToCompany(companyId, 'job:lineitem:removed', { jobId, itemId });
        return { deleted: true };
    },

    addChecklistItem: async (jobId: string, companyId: string, input: z.infer<typeof addChecklistSchema>, userId?: string, userRole?: string) => {
        const parsed = addChecklistSchema.parse(input);
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (userRole === 'TECHNICIAN' && userId) {
            const isAssigned = job.techId === userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError('You can only add checklist items to jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }

        const item = await prisma.jobChecklist.create({
            data: { jobId, label: parsed.label },
        });

        socketService.emitToCompany(companyId, 'job:checklist:added', { jobId, item });
        return item;
    },

    removeChecklistItem: async (jobId: string, checkId: string, companyId: string) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const item = await prisma.jobChecklist.findFirst({ where: { id: checkId, jobId } });
        if (!item) throw new AppError('Checklist item not found', StatusCodes.NOT_FOUND);

        await prisma.jobChecklist.delete({ where: { id: checkId } });
        socketService.emitToCompany(companyId, 'job:checklist:removed', { jobId, checkId });
        return { deleted: true };
    },

    getOne: async (id: string, companyId: string, userId?: string, userRole?: string) => {
        const job = await prisma.job.findFirst({
            where: { id, companyId, deletedAt: null },
            include: {
                customer: true,
                property: { include: { assets: true } },
                tech: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
                van: { include: { members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } } } },
                lineItems: true,
                checklist: { orderBy: { id: 'asc' } },
                estimate: true,
                invoice: true,
                photos: { orderBy: { createdAt: 'desc' } },
                signatures: { orderBy: { signedAt: 'desc' } },
                expenses: { orderBy: { createdAt: 'desc' } },
                purchaseOrders: { include: { supplier: { select: { name: true } } } },
            },
        });

        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // A technician may only open a job that is theirs or their van's — the
        // same rule the assigned-jobs feed enforces.
        if (userRole === 'TECHNICIAN' && userId) {
            const isAssigned = job.techId === userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError(
                    'You can only view jobs assigned to you or your van',
                    StatusCodes.FORBIDDEN
                );
            }
        }

        const notes = await getJobNotes(companyId, [job.id]);

        const materialsCost = job.lineItems
            .filter(li => li.type === 'MATERIAL')
            .reduce((s, li) => s + Number(li.total), 0);
        const laborRevenue = job.lineItems
            .filter(li => li.type === 'LABOR')
            .reduce((s, li) => s + Number(li.total), 0);
        const serviceRevenue = job.lineItems
            .filter(li => li.type === 'SERVICE')
            .reduce((s, li) => s + Number(li.total), 0);
        const totalRevenue = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
        const totalExpenses = job.expenses.reduce((s, e) => s + Number(e.amount), 0);

        const costSummary = {
            materialsCost,
            laborRevenue,
            serviceRevenue,
            totalRevenue,
            totalExpenses,
            margin: totalRevenue - materialsCost - totalExpenses,
        };

        // Techs record what they used but must never see what the company
        // charges, so drop every priced field before the job leaves the server.
        if (userRole === 'TECHNICIAN') {
            const { invoice, estimate, expenses, purchaseOrders, summaryPdfUrl: _pdf, ...rest } = job;
            return {
                ...rest,
                lineItems: job.lineItems.map(({ unitPrice, total, ...item }) => item),
                // Supplier orders carry buy prices — the tech sees what was
                // ordered and whether it landed, never what it cost.
                purchaseOrders: purchaseOrders.map((po) => ({
                    id: po.id,
                    orderNumber: po.orderNumber,
                    status: po.status,
                    expectedDate: po.expectedDate,
                    receivedAt: po.receivedAt,
                    supplier: po.supplier,
                    items: Array.isArray(po.items)
                        ? (po.items as any[]).map((i) => ({ name: i?.name, qty: i?.qty }))
                        : [],
                })),
                invoicedAt: invoice?.createdAt ?? null,
                notes,
            };
        }

        return { ...job, notes, costSummary };
    },

    getAssignedToTech: async (companyId: string, userId: string) => {
        const vanMembership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            select: { vanId: true },
        });

        const assignmentOr = [
            { techId: userId },
            ...(vanMembership ? [{ vanId: vanMembership.vanId }] : []),
        ];

        // "Today" and the look-ahead window are in the company's zone, not the
        // (often UTC) server's.
        const tz = await getCompanyTimezone(companyId);
        const now = new Date();
        const startToday = startOfDayInTimeZone(now, tz);
        // Open work is limited to overdue + today + the next 7 days so the phone
        // list stays short; anything scheduled further out isn't surfaced yet.
        const endWindow = new Date(startOfDayInTimeZone(now, tz, 8).getTime() - 1);

        const listInclude = {
            customer: { select: { id: true, name: true, phone: true, email: true } },
            property: true,
            checklist: { orderBy: { id: 'asc' as const } },
            photos: { orderBy: { createdAt: 'desc' as const } },
            signatures: { orderBy: { signedAt: 'desc' as const } },
            lineItems: true,
            van: { select: { id: true, name: true } },
            // Timestamp only — techs must never see invoice amounts/totals.
            invoice: { select: { createdAt: true } },
        };

        const [openJobs, completedTodayJobs] = await Promise.all([
            prisma.job.findMany({
                where: {
                    companyId,
                    deletedAt: null,
                    status: { notIn: ['COMPLETED', 'CANCELED'] },
                    OR: assignmentOr,
                },
                orderBy: [{ scheduledStart: 'asc' }, { updatedAt: 'desc' }],
                include: listInclude,
            }),
            // Jobs finished today stay on the list so the tech can still send the
            // pay link / summary and add after-photos.
            prisma.job.findMany({
                where: {
                    companyId,
                    deletedAt: null,
                    status: 'COMPLETED',
                    actualEnd: { gte: startToday },
                    OR: assignmentOr,
                },
                orderBy: [{ actualEnd: 'desc' }],
                include: listInclude,
            }),
        ]);

        const windowedOpen = openJobs.filter((job) => {
            // Unscheduled assigned work is always shown; far-future work is not.
            if (!job.scheduledStart) return true;
            return new Date(job.scheduledStart).getTime() <= endWindow.getTime();
        });

        const jobs = [...windowedOpen, ...completedTodayJobs];

        const notes = await getJobNotes(companyId, jobs.map((j) => j.id));
        const notesByJobId = new Map<string, typeof notes>();
        for (const note of notes) {
            const existing = notesByJobId.get(note.jobId) ?? [];
            existing.push(note);
            notesByJobId.set(note.jobId, existing);
        }

        // Techs record what they used (item + quantity) but must not see what the
        // company charges — strip pricing from line items before returning them.
        // The raw `invoice` relation is dropped in favour of a bare timestamp so no
        // amount can leak; the field console uses it only to show "invoice sent".
        // The list also drops the heavy signature image payloads (dataUrl) — the
        // job-detail GET still returns them for the signoff view.
        return jobs.map((job) => {
            // summaryPdfUrl points at the priced PDF, so it never goes to a tech.
            const { invoice, summaryPdfUrl: _pdf, signatures, ...rest } = job as typeof job & {
                summaryPdfUrl?: string | null;
                signatures?: Array<{ id: string; signerName: string; signedAt: Date }>;
            };
            return {
                ...rest,
                lineItems: job.lineItems.map(({ unitPrice, total, ...item }) => item),
                signatures: (signatures ?? []).map((s) => ({
                    id: s.id,
                    signerName: s.signerName,
                    signedAt: s.signedAt,
                })),
                invoicedAt: invoice?.createdAt ?? null,
                // Only completed-today jobs reach this list in COMPLETED status.
                completedToday: job.status === 'COMPLETED',
                notes: notesByJobId.get(job.id) ?? [],
            };
        });
    },

    getAll: async (companyId: string, page = 1, limit = 20, status?: string, branchId?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId, deletedAt: null };
        if (status) where.status = status;
        if (branchId) where.branchId = branchId;

        const [items, total] = await Promise.all([
            prisma.job.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                include: {
                    customer: { select: { name: true } },
                    tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                },
            }),
            prisma.job.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    updateStatus: async (id: string, companyId: string, status: string, userId: string, clientAt?: string, actorRole?: string) => {
        const job = await prisma.job.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { checklist: true, signatures: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // Out-of-order guard: a replayed offline tap that would move the job
        // backwards (e.g. ON_SITE landing after COMPLETED was recorded) is a no-op.
        // We never reopen a finished job or restart its clock — return the job as-is.
        if (isBackwardsTransition(job.status, status)) {
            const current = await prisma.job.findFirst({
                where: { id, companyId, deletedAt: null },
                include: {
                    tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                    customer: true,
                },
            });
            return current;
        }

        if (status === 'COMPLETED' && job.checklist.length > 0) {
            const incomplete = job.checklist.filter(c => !c.isCompleted);
            if (incomplete.length > 0) {
                throw new AppError(
                    `Cannot complete job: ${incomplete.length} checklist item${incomplete.length > 1 ? 's' : ''} not done`,
                    StatusCodes.BAD_REQUEST
                );
            }
        }

        // Server-side completion gating mirrors the field console (apps/web
        // .../technician-view.tsx + .../job-detail.tsx): a customer signature must
        // be on file, and every form the office marked requiredForCompletion must
        // have a submission for this job. Only enforced for technicians closing
        // a job on site; the office can still close a job (e.g. confirmed by phone).
        if (status === 'COMPLETED' && actorRole === 'TECHNICIAN') {
            const signatures = (job as typeof job & { signatures?: unknown[] }).signatures ?? [];
            if (signatures.length === 0) {
                throw new AppError("Collect the customer's signature first", StatusCodes.BAD_REQUEST);
            }
            const missingForm = await getMissingRequiredForm(companyId, id);
            if (missingForm) {
                throw new AppError(`Submit the required form: ${missingForm}`, StatusCodes.BAD_REQUEST);
            }
        }

        const now = new Date();
        // Offline taps replay later: stamp with the real tap time when the phone
        // sent a trustworthy `clientAt`, otherwise with server time.
        const effective = resolveEffectiveTime(clientAt, job, now);
        // A replayed action whose real tap was long ago must not fire time-sensitive
        // "on my way"/"arrived" customer messages when it finally lands.
        const isStale = now.getTime() - effective.getTime() > 15 * 60 * 1000;

        // Generate tracker token on first EN_ROUTE so the customer's SMS link works.
        const trackerToken = (status === 'EN_ROUTE' && !job.customerTrackingToken)
            ? require('crypto').randomBytes(20).toString('hex')
            : undefined;

        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                status: status as any,
                ...(status === 'EN_ROUTE' && !job.actualStart ? { actualStart: effective } : {}),
                ...(status === 'ON_SITE' && !job.actualStart ? { actualStart: effective } : {}),
                ...(status === 'COMPLETED' ? { actualEnd: effective } : {}),
                ...(trackerToken ? { customerTrackingToken: trackerToken, onMyWaySentAt: effective } : {}),
                ...(status === 'ON_SITE' ? { arrivedNotifiedAt: effective } : {}),
            },
            include: {
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                customer: true,
            },
        });

        // Timeline event — stamped at the effective (tap) time, not replay time.
        await prisma.jobTimelineEvent.create({
            data: {
                companyId, jobId: id,
                type: 'STATUS_CHANGE',
                message: `Status: ${job.status} → ${status}`,
                actorId: userId,
                createdAt: effective,
            },
        }).catch(() => undefined);

        // The technician's timesheet is derived entirely from these transitions —
        // they never log hours by hand. TRAVEL runs while EN_ROUTE, WRENCH while
        // ON_SITE, and the clock stops on completion. The clock uses the effective
        // tap time so a replayed transition bills the hours when they happened.
        if (updatedJob.techId) {
            // The clock simply mirrors the status: travelling while EN_ROUTE,
            // on site while ON_SITE, off otherwise.
            const clockType =
                status === 'EN_ROUTE' ? 'TRAVEL' : status === 'ON_SITE' ? 'WRENCH' : null;

            const openForTech = await prisma.timeEntry.findMany({
                where: { companyId, userId: updatedJob.techId, endTime: null },
            });

            // Re-sending the status the job is already in (an office correction,
            // a double tap, a retried offline mutation) must leave the running
            // clock alone rather than splitting it into two entries.
            const alreadyRunning = clockType
                ? openForTech.find((e) => e.jobId === id && e.type === clockType)
                : undefined;

            // Everything else stops — including entries on *other* jobs. Scoping
            // this to the current job used to leave two clocks going at once:
            // arriving at job B while job A was still marked on site billed both,
            // doubling the hours.
            await closeOpenEntries(companyId, updatedJob.techId, effective, alreadyRunning?.id);

            if (clockType && !alreadyRunning) {
                await prisma.timeEntry.create({
                    data: {
                        companyId, jobId: id, userId: updatedJob.techId,
                        type: clockType, startTime: effective,
                        description: `Auto-clocked on ${status}`,
                    },
                });
            }
        }

        await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: 'JOB_STATUS_CHANGE',
                entityId: id,
                entityType: 'JOB',
                metadata: {
                    oldStatus: job.status,
                    newStatus: status,
                    clientAt: clientAt ?? null,
                    effectiveAt: effective.toISOString(),
                },
            },
        });

        const techName = updatedJob.tech
            ? [updatedJob.tech.firstName, updatedJob.tech.lastName].filter(Boolean).join(' ') || updatedJob.tech.email
            : 'Your technician';

        // Time-sensitive customer messages are skipped for stale (replayed) taps;
        // internal realtime updates and completion artefacts still go out.
        if (status === 'EN_ROUTE' && updatedJob.customer && !isStale) {
            const token = updatedJob.customerTrackingToken;
            const trackingUrl = token ? `${process.env.WEB_URL || ''}/track/${token}` : '';
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_EN_ROUTE', {
                techName,
                trackingUrl,
            });
        }

        if (status === 'ON_SITE' && updatedJob.customer && !isStale) {
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_STARTED', {
                techName,
            });
        }

        if (status === 'COMPLETED' && updatedJob.customer) {
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_COMPLETED', {
                jobTitle: updatedJob.title,
            });

            // Leave-behind summary PDF — fire & forget so completion doesn't block on storage/email.
            const { jobSummaryService } = await import('./summary-pdf.service');
            jobSummaryService
                .generateAndSend(id, companyId, { email: true, whatsapp: true })
                .catch((err) => {
                    require('../../utils/logger').logger.warn(
                        { jobId: id, err: err.message },
                        'Job summary PDF generation failed',
                    );
                });
        }

        socketService.emitToCompany(companyId, 'job:updated', updatedJob);
        return updatedJob;
    },

    toggleChecklist: async (jobId: string, checklistId: string, companyId: string, isCompleted: boolean) => {
        const count = await prisma.job.count({ where: { id: jobId, companyId, deletedAt: null } });
        if (count === 0) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const item = await prisma.jobChecklist.update({
            where: { id: checklistId },
            data: { isCompleted, completedAt: isCompleted ? new Date() : null },
        });

        socketService.emitToCompany(companyId, 'job:checklist_updated', { jobId, checklistId, isCompleted });
        return item;
    },

    addNote: async (jobId: string, companyId: string, userId: string, message: string) => {
        const parsed = addNoteSchema.parse({ message });
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId, deletedAt: null },
            select: { id: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const note = await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: JOB_NOTE_ACTION,
                entityId: jobId,
                entityType: 'JOB',
                metadata: { message: parsed.message, kind: 'internal_note' },
            },
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
            },
        });

        const payload = {
            id: note.id,
            jobId,
            message: parsed.message,
            createdAt: note.createdAt,
            author: {
                ...note.user,
                name: [note.user.firstName, note.user.lastName].filter(Boolean).join(' ') || note.user.email,
            },
        };

        socketService.emitToCompany(companyId, 'job:note:added', payload);
        return payload;
    },

    addSignature: async (
        jobId: string,
        companyId: string,
        userId: string,
        signerName: string,
        signatureDataUrl?: string,
        signatureUrl?: string,
    ) => {
        const parsed = addSignatureSchema.parse({ signerName, signatureDataUrl, signatureUrl });
        if (!parsed.signatureDataUrl && !parsed.signatureUrl) {
            throw new AppError('Either signatureDataUrl or signatureUrl is required', StatusCodes.BAD_REQUEST);
        }

        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId, deletedAt: null },
            select: { id: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const signature = await prisma.jobSignature.create({
            data: {
                jobId,
                signerName: parsed.signerName,
                signatureDataUrl: parsed.signatureDataUrl,
                signatureUrl: parsed.signatureUrl,
            },
        });

        await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: 'JOB_SIGNATURE_CAPTURED',
                entityId: jobId,
                entityType: 'JOB',
                metadata: { signerName: parsed.signerName, signatureId: signature.id },
            },
        });

        socketService.emitToCompany(companyId, 'job:signature:added', { jobId, signature });
        return signature;
    },

    quickCreate: async (companyId: string, userId: string, input: z.infer<typeof quickCreateSchema>) => {
        const parsed = quickCreateSchema.parse(input);

        if (parsed.techId) {
            const tech = await prisma.user.findFirst({
                where: { id: parsed.techId, companyId, role: 'TECHNICIAN', status: 'ACTIVE' },
            });
            if (!tech) throw new AppError('Technician not found', StatusCodes.NOT_FOUND);
        }

        const result = await prisma.$transaction(async (tx) => {
            let customerId = parsed.existingCustomerId;

            if (!customerId) {
                const customer = await tx.customer.create({
                    data: {
                        companyId,
                        name: parsed.customerName,
                        email: parsed.customerEmail || null,
                        phone: parsed.customerPhone,
                    },
                });
                customerId = customer.id;
            }

            // Repeat customers are booked at a site they already have. Without
            // this the same address is duplicated on every visit, which splits
            // their service history and equipment records across copies.
            let property = parsed.existingPropertyId
                ? await tx.property.findFirst({
                      where: { id: parsed.existingPropertyId, companyId, customerId },
                  })
                : null;

            if (parsed.existingPropertyId && !property) {
                throw new AppError('Service address not found for this customer', StatusCodes.NOT_FOUND);
            }

            if (!property) {
                property = await tx.property.create({
                    data: {
                        companyId,
                        customerId,
                        // superRefine above guarantees both are present here.
                        addressLine1: parsed.addressLine1!,
                        addressLine2: parsed.addressLine2,
                        city: parsed.city!,
                        state: parsed.state || '',
                        zip: parsed.zip || '',
                    },
                });
            }

            const template = parsed.templateId
                ? await tx.jobTemplate.findFirst({ where: { id: parsed.templateId, companyId } })
                : null;

            const job = await tx.job.create({
                data: {
                    companyId,
                    projectId: parsed.projectId,
                    customerId,
                    propertyId: property.id,
                    techId: parsed.techId,
                    vanId: parsed.vanId ?? null,
                    templateId: template?.id,
                    title: parsed.title,
                    description: parsed.description ?? template?.defaultDescription ?? undefined,
                    priority: parsed.priority ?? template?.defaultPriority ?? 'MEDIUM',
                    requiredSkills: template?.requiredSkills ?? [],
                    status: (parsed.techId || parsed.vanId) ? 'ASSIGNED' : 'REQUESTED',
                    scheduledStart: parsed.scheduledStart ? new Date(parsed.scheduledStart) : null,
                    scheduledEnd: parsed.scheduledEnd ? new Date(parsed.scheduledEnd) : null,
                },
                include: { customer: true, property: true, tech: { select: PUBLIC_USER_SELECT }, van: true },
            });

            if (template) {
                const tplLineItems = (template.defaultLineItems as any[]) ?? [];
                if (tplLineItems.length) {
                    await tx.jobLineItem.createMany({
                        data: tplLineItems.map((li) => ({
                            jobId: job.id,
                            name: li.name,
                            description: li.description,
                            quantity: li.quantity,
                            unitPrice: li.unitPrice,
                            total: li.quantity * li.unitPrice,
                            type: (li.type ?? 'SERVICE') as any,
                        })),
                    });
                }
                const tplChecklist = (template.defaultChecklist as any[]) ?? [];
                if (tplChecklist.length) {
                    await tx.jobChecklist.createMany({
                        data: tplChecklist.map((c) => ({ jobId: job.id, label: c.label })),
                    });
                }
            }

            await tx.auditLog.create({
                data: {
                    companyId, userId,
                    action: 'JOB_CREATED',
                    entityId: job.id,
                    entityType: 'JOB',
                    metadata: { title: parsed.title, quickCreate: true, templateId: template?.id },
                },
            });

            return job;
        });

        socketService.emitToCompany(companyId, 'job:created', result);

        if (result.techId) {
            await notificationService.notifyUser(
                result.techId, companyId, 'JOB_ASSIGNED',
                'New job assigned', `You have been assigned to: ${result.title}`
            );
        }

        // No customer "on the way" message here: the job was only booked. The
        // real EN_ROUTE transition (updateStatus) sends it with a tracking token.

        return result;
    },

    /**
     * Prior service history for the job's customer (and property), for the field
     * console so a tech can see what happened here before they knock. Returns the
     * last ~5 COMPLETED jobs with date, title, tech, note excerpt, photo count and
     * any linked warranty claims. NEVER includes pricing — no line items, amounts
     * or totals are read or returned, regardless of caller role.
     *
     * RBAC: a TECHNICIAN may only view history for a job assigned to them or to
     * their van (assigned-or-van-mate, matching the other tech-scoped endpoints).
     * ADMIN / OFFICE / DISPATCHER may view any job in their company.
     */
    getSiteHistory: async (jobId: string, companyId: string, userId?: string, userRole?: string) => {
        const job = await prisma.job.findFirst({
            where: { id: jobId, companyId, deletedAt: null },
            select: { id: true, customerId: true, propertyId: true, techId: true, vanId: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (userRole === 'TECHNICIAN' && userId) {
            const isAssigned = job.techId === userId;
            let isVanMate = false;
            if (!isAssigned && job.vanId) {
                const membership = await prisma.vanMember.findFirst({
                    where: { userId, van: { id: job.vanId, companyId } },
                });
                isVanMate = !!membership;
            }
            if (!isAssigned && !isVanMate) {
                throw new AppError('You can only view history for jobs assigned to you or your van', StatusCodes.FORBIDDEN);
            }
        }

        // Prior completed visits for the same customer. The current job is excluded,
        // and pricing relations (lineItems / invoice / estimate) are deliberately
        // never selected so nothing chargeable can leak.
        const priorJobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                customerId: job.customerId,
                status: 'COMPLETED',
                id: { not: jobId },
            },
            orderBy: [{ actualEnd: 'desc' }, { updatedAt: 'desc' }],
            take: 5,
            include: {
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                photos: { select: { id: true } },
            },
        });

        const priorJobIds = priorJobs.map((j) => j.id);

        // Internal notes (stored as audit-log entries) — used for the note excerpt.
        const notes = await getJobNotes(companyId, priorJobIds);
        const notesByJobId = new Map<string, typeof notes>();
        for (const note of notes) {
            const existing = notesByJobId.get(note.jobId) ?? [];
            existing.push(note);
            notesByJobId.set(note.jobId, existing);
        }

        // Warranty claims linked to those jobs, if any (WarrantyClaim.jobId is a
        // loose scalar link — there is no relation field on Job).
        const warrantyClaims = priorJobIds.length
            ? await prisma.warrantyClaim.findMany({
                where: { companyId, jobId: { in: priorJobIds } },
                select: {
                    id: true, jobId: true, claimNumber: true, status: true,
                    issueDescription: true, submittedDate: true, resolvedDate: true,
                },
            })
            : [];
        const claimsByJobId = new Map<string, typeof warrantyClaims>();
        for (const claim of warrantyClaims) {
            if (!claim.jobId) continue;
            const existing = claimsByJobId.get(claim.jobId) ?? [];
            existing.push(claim);
            claimsByJobId.set(claim.jobId, existing);
        }

        return priorJobs.map((prior) => {
            const jobNotes = notesByJobId.get(prior.id) ?? [];
            const latestNote = jobNotes[0]; // getJobNotes orders desc
            const techName = prior.tech
                ? [prior.tech.firstName, prior.tech.lastName].filter(Boolean).join(' ') || prior.tech.email
                : null;

            return {
                id: prior.id,
                date: prior.actualEnd ?? prior.scheduledEnd ?? prior.updatedAt,
                title: prior.title,
                description: prior.description ?? null,
                status: prior.status,
                technicianName: techName,
                isSameProperty: prior.propertyId === job.propertyId,
                noteExcerpt: latestNote?.message ?? null,
                noteCount: jobNotes.length,
                photoCount: prior.photos.length,
                warrantyClaims: (claimsByJobId.get(prior.id) ?? []).map((claim) => ({
                    id: claim.id,
                    claimNumber: claim.claimNumber,
                    status: claim.status,
                    issueDescription: claim.issueDescription,
                    submittedDate: claim.submittedDate,
                    resolvedDate: claim.resolvedDate,
                })),
            };
        });
    },

    softDelete: async (id: string, companyId: string, userId: string) => {
        const job = await prisma.job.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        await prisma.job.update({ where: { id }, data: { deletedAt: new Date() } });

        await prisma.auditLog.create({
            data: {
                companyId, userId,
                action: 'JOB_DELETED',
                entityId: id,
                entityType: 'JOB',
            },
        });

        return { deleted: true };
    },
};
