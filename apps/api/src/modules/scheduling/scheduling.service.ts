import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { socketService } from '../../services/socket.service';

const createJobSchema = z.object({
    customerId: z.string(),
    propertyId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    scheduledStart: z.string().or(z.date()), // Accepts ISO string
    scheduledEnd: z.string().or(z.date()),
    techId: z.string().optional(),
});

const updateJobScheduleSchema = z.object({
    scheduledStart: z.string().or(z.date()).optional(),
    scheduledEnd: z.string().or(z.date()).optional(),
    techId: z.string().optional().nullable(),
});

export const schedulingService = {
    getEvents: async (companyId: string, start: string, end: string) => {
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                scheduledStart: {
                    gte: new Date(start),
                    lte: new Date(end),
                }
            },
            include: {
                customer: { select: { name: true } },
                property: { select: { addressLine1: true, city: true } },
                tech: { select: { id: true, email: true, avatarUrl: true } }
            }
        });

        // Transform to FullCalendar Events
        return jobs.map(job => ({
            id: job.id,
            title: `${job.title} - ${job.customer.name}`,
            start: job.scheduledStart,
            end: job.scheduledEnd,
            resourceId: job.techId || 'unassigned', // For resource view if used
            extendedProps: {
                customerId: job.customerId,
                techId: job.techId,
                status: job.status,
                address: `${job.property.addressLine1}, ${job.property.city}`
            },
            backgroundColor: job.techId ? '#3b82f6' : '#9ca3af', // Blue if assigned, Gray if not
        }));
    },

    createJob: async (companyId: string, input: z.infer<typeof createJobSchema>) => {
        const job = await prisma.job.create({
            data: {
                companyId,
                ...input,
                status: input.techId ? 'ASSIGNED' : 'REQUESTED'
            },
            include: { customer: true, tech: true }
        });

        socketService.emitToCompany(companyId, 'job:created', job);
        return job;
    },

    updateSchedule: async (jobId: string, companyId: string, input: z.infer<typeof updateJobScheduleSchema>) => {
        const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data: {
                ...input,
                status: input.techId ? 'ASSIGNED' : (job.techId ? 'ASSIGNED' : 'REQUESTED') // Simple logic for now
            },
            include: { tech: true, customer: true }
        });

        socketService.emitToCompany(companyId, 'schedule:updated', updatedJob);
        return updatedJob;
    }
};
