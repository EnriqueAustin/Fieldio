import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';

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
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
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
    templateId: z.string().uuid().optional(),
});

const JOB_NOTE_ACTION = 'JOB_NOTE_ADDED';

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
                include: { customer: true, property: true, tech: true, van: true },
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
                        ? new Date(job.scheduledStart).toLocaleString('en-ZA')
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
            include: { customer: true, property: true, tech: true, van: true },
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
                        ? new Date(updated.scheduledStart).toLocaleString('en-ZA')
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

    getOne: async (id: string, companyId: string) => {
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

        return { ...job, notes, costSummary };
    },

    getAssignedToTech: async (companyId: string, userId: string) => {
        const vanMembership = await prisma.vanMember.findFirst({
            where: { userId, van: { companyId, active: true } },
            select: { vanId: true },
        });

        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                deletedAt: null,
                status: { notIn: ['COMPLETED', 'CANCELED'] },
                OR: [
                    { techId: userId },
                    ...(vanMembership ? [{ vanId: vanMembership.vanId }] : []),
                ],
            },
            orderBy: [{ scheduledStart: 'asc' }, { updatedAt: 'desc' }],
            include: {
                customer: { select: { id: true, name: true, phone: true, email: true } },
                property: true,
                checklist: { orderBy: { id: 'asc' } },
                photos: { orderBy: { createdAt: 'desc' } },
                signatures: { orderBy: { signedAt: 'desc' } },
                lineItems: true,
                van: { select: { id: true, name: true } },
                // Timestamp only — techs must never see invoice amounts/totals.
                invoice: { select: { createdAt: true } },
            },
        });

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
        return jobs.map((job) => {
            const { invoice, ...rest } = job;
            return {
                ...rest,
                lineItems: job.lineItems.map(({ unitPrice, total, ...item }) => item),
                invoicedAt: invoice?.createdAt ?? null,
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

    updateStatus: async (id: string, companyId: string, status: string, userId: string) => {
        const job = await prisma.job.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { checklist: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        if (status === 'COMPLETED' && job.checklist.length > 0) {
            const incomplete = job.checklist.filter(c => !c.isCompleted);
            if (incomplete.length > 0) {
                throw new AppError(
                    `Cannot complete job: ${incomplete.length} checklist item${incomplete.length > 1 ? 's' : ''} not done`,
                    StatusCodes.BAD_REQUEST
                );
            }
        }

        // Generate tracker token on first EN_ROUTE so the customer's SMS link works.
        const trackerToken = (status === 'EN_ROUTE' && !job.customerTrackingToken)
            ? require('crypto').randomBytes(20).toString('hex')
            : undefined;

        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                status: status as any,
                ...(status === 'EN_ROUTE' && !job.actualStart ? { actualStart: new Date() } : {}),
                ...(status === 'ON_SITE' && !job.actualStart ? { actualStart: new Date() } : {}),
                ...(status === 'COMPLETED' ? { actualEnd: new Date() } : {}),
                ...(trackerToken ? { customerTrackingToken: trackerToken, onMyWaySentAt: new Date() } : {}),
                ...(status === 'ON_SITE' ? { arrivedNotifiedAt: new Date() } : {}),
            },
            include: {
                tech: { select: { id: true, email: true, firstName: true, lastName: true } },
                customer: true,
            },
        });

        // Timeline event
        await prisma.jobTimelineEvent.create({
            data: {
                companyId, jobId: id,
                type: 'STATUS_CHANGE',
                message: `Status: ${job.status} → ${status}`,
                actorId: userId,
            },
        }).catch(() => undefined);

        // Auto time-entries: TRAVEL during EN_ROUTE, WRENCH while ON_SITE.
        if (updatedJob.techId) {
            // Stop any open time entry for this job + user when leaving an active state
            if (status === 'ON_SITE' || status === 'COMPLETED' || status === 'PAUSED' || status === 'CANCELED') {
                const openEntries = await prisma.timeEntry.findMany({
                    where: { jobId: id, userId: updatedJob.techId, endTime: null },
                });
                for (const e of openEntries) {
                    const end = new Date();
                    await prisma.timeEntry.update({
                        where: { id: e.id },
                        data: {
                            endTime: end,
                            duration: Math.floor((end.getTime() - e.startTime.getTime()) / 1000),
                        },
                    });
                }
            }
            // Start the appropriate entry on entering EN_ROUTE / ON_SITE
            if (status === 'EN_ROUTE') {
                await prisma.timeEntry.create({
                    data: {
                        companyId, jobId: id, userId: updatedJob.techId,
                        type: 'TRAVEL', startTime: new Date(),
                        description: 'Auto-clocked on EN_ROUTE',
                    },
                });
            }
            if (status === 'ON_SITE') {
                await prisma.timeEntry.create({
                    data: {
                        companyId, jobId: id, userId: updatedJob.techId,
                        type: 'WRENCH', startTime: new Date(),
                        description: 'Auto-clocked on ON_SITE',
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
                metadata: { oldStatus: job.status, newStatus: status },
            },
        });

        const techName = updatedJob.tech
            ? [updatedJob.tech.firstName, updatedJob.tech.lastName].filter(Boolean).join(' ') || updatedJob.tech.email
            : 'Your technician';

        if (status === 'EN_ROUTE' && updatedJob.customer) {
            const token = updatedJob.customerTrackingToken;
            const trackingUrl = token ? `${process.env.WEB_URL || ''}/track/${token}` : '';
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_EN_ROUTE', {
                techName,
                trackingUrl,
            });
        }

        if (status === 'ON_SITE' && updatedJob.customer) {
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

            const property = await tx.property.create({
                data: {
                    companyId,
                    customerId,
                    addressLine1: parsed.addressLine1,
                    addressLine2: parsed.addressLine2,
                    city: parsed.city,
                    state: parsed.state || '',
                    zip: parsed.zip || '',
                },
            });

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
                include: { customer: true, property: true, tech: true, van: true },
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

        if (result.customer && result.customerId) {
            const techName = result.tech
                ? [result.tech.firstName, result.tech.lastName].filter(Boolean).join(' ') || result.tech.email
                : undefined;
            if (techName) {
                await notificationService.notifyCustomer(result.customerId, companyId, 'JOB_EN_ROUTE', {
                    techName,
                    trackingUrl: `${process.env.WEB_URL || ''}/track/${result.id}`,
                });
            }
        }

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
