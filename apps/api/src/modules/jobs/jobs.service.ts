import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';
import { notificationService } from '../../services/notifications/notification.service';

const updateStatusSchema = z.object({
    status: z.enum(['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELED']),
});

const addNoteSchema = z.object({
    message: z.string().min(1),
});

export const jobsService = {
    getOne: async (id: string, companyId: string) => {
        const job = await prisma.job.findFirst({
            where: { id, companyId },
            include: {
                customer: true,
                property: true,
                tech: { select: { id: true, email: true, avatarUrl: true } },
                lineItems: true,
                checklist: { orderBy: { id: 'asc' } }, // Assuming we want them ordered
                estimate: true,
                invoice: true,
            },
        });

        if (!job) {
            throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        }

        return job;
    },

    getAll: async (companyId: string, page = 1, limit = 20, status?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId };

        if (status) {
            where.status = status;
        }

        const [items, total] = await Promise.all([
            prisma.job.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                include: {
                    customer: { select: { name: true } },
                    tech: { select: { email: true } }
                }
            }),
            prisma.job.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    updateStatus: async (id: string, companyId: string, status: string, userId: string) => {
        const job = await prisma.job.findFirst({ where: { id, companyId } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        // Initial Status Transition Logic could go here (e.g. valid next states)

        // Update Job & Add Audit Log (Stub for log)
        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                status: status as any,
                // Capture timestamps based on status
                ...(status === 'EN_ROUTE' && !job.actualStart ? { actualStart: new Date() } : {}), // Maybe start tracking here?
                ...(status === 'ON_SITE' && !job.actualStart ? { actualStart: new Date() } : {}),
                ...(status === 'COMPLETED' ? { actualEnd: new Date() } : {}),
            },
            include: { tech: true, customer: true }
        });

        // Create Audit Log
        await prisma.auditLog.create({
            data: {
                companyId,
                userId,
                action: 'JOB_STATUS_CHANGE',
                entityId: id,
                entityType: 'JOB',
                metadata: { oldStatus: job.status, newStatus: status }
            }
        });

        // Notifications Logic
        if (status === 'EN_ROUTE' && updatedJob.tech && updatedJob.customer) {
            // Notify Customer
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_EN_ROUTE', {
                techName: updatedJob.tech.email // Using email as name for now
            });
        }

        if (status === 'COMPLETED' && updatedJob.customer) {
            await notificationService.notifyCustomer(updatedJob.customerId, companyId, 'JOB_COMPLETED', {
                jobTitle: updatedJob.title
            });
        }

        socketService.emitToCompany(companyId, 'job:updated', updatedJob);
        return updatedJob;
    },

    toggleChecklist: async (jobId: string, checklistId: string, companyId: string, isCompleted: boolean) => {
        // Verify ownership via Job
        const count = await prisma.job.count({ where: { id: jobId, companyId } });
        if (count === 0) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const item = await prisma.jobChecklist.update({
            where: { id: checklistId },
            data: {
                isCompleted,
                completedAt: isCompleted ? new Date() : null
            }
        });

        socketService.emitToCompany(companyId, 'job:checklist_updated', { jobId, checklistId, isCompleted });
        return item;
    }
};
