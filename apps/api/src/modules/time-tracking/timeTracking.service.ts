import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';

export const timeTrackingService = {
    startEntry: async (companyId: string, userId: string, data: any) => {
        // Check if there's an ongoing entry for this user
        const ongoing = await prisma.timeEntry.findFirst({
            where: { userId, companyId, endTime: null }
        });

        if (ongoing) {
            throw new AppError('An ongoing time entry already exists for this user', StatusCodes.BAD_REQUEST);
        }

        return await prisma.timeEntry.create({
            data: {
                ...data,
                companyId,
                userId,
                startTime: data.startTime || new Date(),
            },
        });
    },

    stopEntry: async (id: string, companyId: string, userId: string, endTime?: Date) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, userId }
        });

        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);
        if (entry.endTime) throw new AppError('Time entry is already completed', StatusCodes.BAD_REQUEST);

        const end = endTime || new Date();
        const duration = Math.floor((end.getTime() - entry.startTime.getTime()) / 1000);

        return await prisma.timeEntry.update({
            where: { id },
            data: {
                endTime: end,
                duration,
            }
        });
    },

    updateEntry: async (id: string, companyId: string, userId: string, data: any) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId, userId }
        });

        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        let duration = entry.duration;
        let endTime = data.endTime || entry.endTime;
        let startTime = data.startTime || entry.startTime;

        if (endTime && startTime) {
            duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
        }

        return await prisma.timeEntry.update({
            where: { id },
            data: {
                ...data,
                duration,
            }
        });
    },

    getOne: async (id: string, companyId: string) => {
        const entry = await prisma.timeEntry.findFirst({
            where: { id, companyId },
            include: { user: true, job: true }
        });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);
        return entry;
    },

    getAll: async (companyId: string, userId?: string, jobId?: string, page: number = 1, limit: number = 20) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId };
        if (userId) where.userId = userId;
        if (jobId) where.jobId = jobId;

        const [entries, total] = await Promise.all([
            prisma.timeEntry.findMany({
                where,
                skip,
                take: limit,
                orderBy: { startTime: 'desc' },
                include: { user: true, job: true }
            }),
            prisma.timeEntry.count({ where })
        ]);

        return {
            entries,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    deleteEntry: async (id: string, companyId: string, userId: string) => {
        const entry = await prisma.timeEntry.findFirst({ where: { id, companyId, userId } });
        if (!entry) throw new AppError('Time entry not found', StatusCodes.NOT_FOUND);

        return await prisma.timeEntry.delete({
            where: { id }
        });
    }
};
