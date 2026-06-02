import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createSubcontractorSchema = z.object({
    name: z.string().min(1),
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    specialty: z.string().optional(),
    licenseNumber: z.string().optional(),
    licenseExpiry: z.coerce.date().optional(),
    insuranceProvider: z.string().optional(),
    insurancePolicyNumber: z.string().optional(),
    insuranceExpiry: z.coerce.date().optional(),
    taxId: z.string().optional(),
    hourlyRate: z.number().min(0).optional(),
    notes: z.string().optional(),
});

const updateSubcontractorSchema = createSubcontractorSchema.partial().extend({
    status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION']).optional(),
});

const createAssignmentSchema = z.object({
    subcontractorId: z.string().uuid(),
    jobId: z.string().uuid(),
    description: z.string().optional(),
    agreedRate: z.number().min(0).optional(),
    notes: z.string().optional(),
});

const updateAssignmentSchema = z.object({
    hoursWorked: z.number().min(0).optional(),
    totalPayout: z.number().min(0).optional(),
    paidAt: z.coerce.date().optional(),
    invoiceReference: z.string().optional(),
    notes: z.string().optional(),
});

export const subcontractorService = {
    getAll: async (companyId: string, includeInactive = false) => {
        const where: any = { companyId };
        if (!includeInactive) where.status = 'ACTIVE';
        return prisma.subcontractor.findMany({
            where,
            orderBy: { name: 'asc' },
            include: { _count: { select: { assignments: true } } },
        });
    },

    getOne: async (id: string, companyId: string) => {
        const sub = await prisma.subcontractor.findFirst({
            where: { id, companyId },
            include: {
                assignments: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    include: { job: { select: { id: true, title: true, status: true } } },
                },
            },
        });
        if (!sub) throw new AppError('Subcontractor not found', StatusCodes.NOT_FOUND);
        return sub;
    },

    create: async (companyId: string, input: z.infer<typeof createSubcontractorSchema>) => {
        const parsed = createSubcontractorSchema.parse(input);
        return prisma.subcontractor.create({
            data: { companyId, ...parsed, email: parsed.email || null },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateSubcontractorSchema>) => {
        const parsed = updateSubcontractorSchema.parse(input);
        const sub = await prisma.subcontractor.findFirst({ where: { id, companyId } });
        if (!sub) throw new AppError('Subcontractor not found', StatusCodes.NOT_FOUND);
        return prisma.subcontractor.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const sub = await prisma.subcontractor.findFirst({ where: { id, companyId } });
        if (!sub) throw new AppError('Subcontractor not found', StatusCodes.NOT_FOUND);
        return prisma.subcontractor.update({ where: { id }, data: { status: 'INACTIVE' } });
    },

    getExpiringDocuments: async (companyId: string) => {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        return prisma.subcontractor.findMany({
            where: {
                companyId,
                status: 'ACTIVE',
                OR: [
                    { licenseExpiry: { lte: thirtyDaysFromNow } },
                    { insuranceExpiry: { lte: thirtyDaysFromNow } },
                ],
            },
            orderBy: { name: 'asc' },
        });
    },

    // --- Assignments ---
    createAssignment: async (companyId: string, input: z.infer<typeof createAssignmentSchema>) => {
        const parsed = createAssignmentSchema.parse(input);
        const [sub, job] = await Promise.all([
            prisma.subcontractor.findFirst({ where: { id: parsed.subcontractorId, companyId, status: 'ACTIVE' } }),
            prisma.job.findFirst({ where: { id: parsed.jobId, companyId, deletedAt: null } }),
        ]);
        if (!sub) throw new AppError('Subcontractor not found or inactive', StatusCodes.BAD_REQUEST);
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        return prisma.subcontractorAssignment.create({
            data: parsed,
            include: { subcontractor: { select: { name: true } }, job: { select: { title: true } } },
        });
    },

    updateAssignment: async (id: string, companyId: string, input: z.infer<typeof updateAssignmentSchema>) => {
        const parsed = updateAssignmentSchema.parse(input);
        const assignment = await prisma.subcontractorAssignment.findFirst({
            where: { id },
            include: { subcontractor: { select: { companyId: true } } },
        });
        if (!assignment || assignment.subcontractor.companyId !== companyId) {
            throw new AppError('Assignment not found', StatusCodes.NOT_FOUND);
        }
        return prisma.subcontractorAssignment.update({ where: { id }, data: parsed });
    },

    getAssignmentsByJob: async (jobId: string, companyId: string) => {
        return prisma.subcontractorAssignment.findMany({
            where: { jobId, subcontractor: { companyId } },
            include: { subcontractor: { select: { id: true, name: true, phone: true, specialty: true } } },
            orderBy: { createdAt: 'desc' },
        });
    },

    getPayoutSummary: async (companyId: string, from?: Date, to?: Date) => {
        const now = new Date();
        const rangeFrom = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const rangeTo = to ?? now;

        const assignments = await prisma.subcontractorAssignment.findMany({
            where: {
                subcontractor: { companyId },
                createdAt: { gte: rangeFrom, lte: rangeTo },
            },
            include: {
                subcontractor: { select: { id: true, name: true } },
                job: { select: { id: true, title: true } },
            },
        });

        const bySubcontractor = new Map<string, { name: string; totalPayout: number; jobCount: number; unpaid: number }>();
        for (const a of assignments) {
            const key = a.subcontractorId;
            if (!bySubcontractor.has(key)) {
                bySubcontractor.set(key, { name: a.subcontractor.name, totalPayout: 0, jobCount: 0, unpaid: 0 });
            }
            const entry = bySubcontractor.get(key)!;
            entry.jobCount++;
            const payout = Number(a.totalPayout ?? 0);
            entry.totalPayout += payout;
            if (!a.paidAt) entry.unpaid += payout;
        }

        return {
            range: { from: rangeFrom, to: rangeTo },
            subcontractors: Array.from(bySubcontractor.entries()).map(([id, data]) => ({ id, ...data })),
        };
    },
};
