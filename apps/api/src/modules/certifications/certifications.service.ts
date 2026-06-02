import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createCertSchema = z.object({
    userId: z.string().uuid(),
    name: z.string().min(1),
    issuingBody: z.string().optional(),
    certificateNumber: z.string().optional(),
    issuedDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    documentUrl: z.string().optional(),
});

const updateCertSchema = createCertSchema.omit({ userId: true }).partial().extend({
    verified: z.boolean().optional(),
});

export const certificationService = {
    getByUser: async (userId: string, companyId: string) => {
        return prisma.techCertification.findMany({
            where: { userId, companyId },
            orderBy: { expiryDate: 'asc' },
        });
    },

    getAll: async (companyId: string) => {
        return prisma.techCertification.findMany({
            where: { companyId },
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            orderBy: { expiryDate: 'asc' },
        });
    },

    create: async (companyId: string, input: z.infer<typeof createCertSchema>) => {
        const parsed = createCertSchema.parse(input);
        const user = await prisma.user.findFirst({ where: { id: parsed.userId, companyId } });
        if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);
        return prisma.techCertification.create({
            data: { companyId, ...parsed },
        });
    },

    update: async (id: string, companyId: string, input: z.infer<typeof updateCertSchema>) => {
        const parsed = updateCertSchema.parse(input);
        const cert = await prisma.techCertification.findFirst({ where: { id, companyId } });
        if (!cert) throw new AppError('Certification not found', StatusCodes.NOT_FOUND);
        return prisma.techCertification.update({ where: { id }, data: parsed });
    },

    delete: async (id: string, companyId: string) => {
        const cert = await prisma.techCertification.findFirst({ where: { id, companyId } });
        if (!cert) throw new AppError('Certification not found', StatusCodes.NOT_FOUND);
        await prisma.techCertification.delete({ where: { id } });
        return { deleted: true };
    },

    getExpiring: async (companyId: string, daysAhead = 30) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + daysAhead);

        return prisma.techCertification.findMany({
            where: {
                companyId,
                expiryDate: { not: null, lte: cutoff },
            },
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            orderBy: { expiryDate: 'asc' },
        });
    },
};
