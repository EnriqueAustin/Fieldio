import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createPermitSchema = z.object({
    jobId: z.string().uuid(),
    permitNumber: z.string().optional(),
    permitType: z.string().min(1),
    authority: z.string().optional(),
    applicationDate: z.coerce.date().optional(),
    fee: z.number().min(0).optional(),
    notes: z.string().optional(),
});

const updatePermitSchema = z.object({
    permitNumber: z.string().optional(),
    status: z.enum(['APPLIED', 'ISSUED', 'INSPECTION_SCHEDULED', 'PASSED', 'FAILED', 'EXPIRED']).optional(),
    issueDate: z.coerce.date().optional(),
    expirationDate: z.coerce.date().optional(),
    fee: z.number().min(0).optional(),
    notes: z.string().optional(),
});

const createInspectionSchema = z.object({
    scheduledDate: z.coerce.date(),
    inspectorName: z.string().optional(),
    inspectorPhone: z.string().optional(),
    notes: z.string().optional(),
});

const updateInspectionSchema = z.object({
    completedDate: z.coerce.date().optional(),
    result: z.enum(['PASS', 'FAIL', 'CONDITIONAL']).optional(),
    notes: z.string().optional(),
    followUpRequired: z.boolean().optional(),
});

export const permitService = {
    getAll: async (companyId: string, jobId?: string) => {
        const where: any = { companyId };
        if (jobId) where.jobId = jobId;
        return prisma.permit.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                job: { select: { id: true, title: true } },
                inspections: { orderBy: { scheduledDate: 'desc' } },
            },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const permit = await prisma.permit.findFirst({
            where: { id, companyId },
            include: {
                job: { select: { id: true, title: true, customer: { select: { name: true } } } },
                inspections: { orderBy: { scheduledDate: 'desc' } },
            },
        });
        if (!permit) throw new AppError('Permit not found', StatusCodes.NOT_FOUND);
        return permit;
    },

    create: async (companyId: string, input: z.infer<typeof createPermitSchema>) => {
        const parsed = createPermitSchema.parse(input);
        const job = await prisma.job.findFirst({ where: { id: parsed.jobId, companyId, deletedAt: null } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);
        return prisma.permit.create({
            data: { companyId, ...parsed },
            include: { inspections: true },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updatePermitSchema>) => {
        const parsed = updatePermitSchema.parse(input);
        const permit = await prisma.permit.findFirst({ where: { id, companyId } });
        if (!permit) throw new AppError('Permit not found', StatusCodes.NOT_FOUND);
        return prisma.permit.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const permit = await prisma.permit.findFirst({ where: { id, companyId } });
        if (!permit) throw new AppError('Permit not found', StatusCodes.NOT_FOUND);
        await prisma.inspection.deleteMany({ where: { permitId: id } });
        await prisma.permit.delete({ where: { id } });
        return { deleted: true };
    },

    // --- Inspections ---
    addInspection: async (permitId: string, companyId: string, input: z.infer<typeof createInspectionSchema>) => {
        const parsed = createInspectionSchema.parse(input);
        const permit = await prisma.permit.findFirst({ where: { id: permitId, companyId } });
        if (!permit) throw new AppError('Permit not found', StatusCodes.NOT_FOUND);

        const inspection = await prisma.inspection.create({
            data: { permitId, ...parsed },
        });

        await prisma.permit.update({
            where: { id: permitId },
            data: { status: 'INSPECTION_SCHEDULED' },
        });

        return inspection;
    },

    updateInspection: async (inspectionId: string, companyId: string, input: z.infer<typeof updateInspectionSchema>) => {
        const parsed = updateInspectionSchema.parse(input);
        const inspection = await prisma.inspection.findFirst({
            where: { id: inspectionId },
            include: { permit: { select: { companyId: true, id: true } } },
        });
        if (!inspection || inspection.permit.companyId !== companyId) {
            throw new AppError('Inspection not found', StatusCodes.NOT_FOUND);
        }

        const updated = await prisma.inspection.update({ where: { id: inspectionId }, data: parsed });

        if (parsed.result) {
            const newStatus = parsed.result === 'PASS' ? 'PASSED' : parsed.result === 'FAIL' ? 'FAILED' : 'INSPECTION_SCHEDULED';
            await prisma.permit.update({
                where: { id: inspection.permitId },
                data: { status: newStatus as any },
            });
        }

        return updated;
    },

    getUpcoming: async (companyId: string) => {
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        return prisma.inspection.findMany({
            where: {
                permit: { companyId },
                scheduledDate: { gte: now, lte: nextWeek },
                completedDate: null,
            },
            include: {
                permit: {
                    select: {
                        id: true, permitNumber: true, permitType: true,
                        job: { select: { id: true, title: true, customer: { select: { name: true } } } },
                    },
                },
            },
            orderBy: { scheduledDate: 'asc' },
        });
    },
};
