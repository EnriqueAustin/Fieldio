import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createExpenseSchema = z.object({
    jobId: z.string(),
    description: z.string(),
    amount: z.number(),
    date: z.string().or(z.date()),
});

export const expensesService = {
    create: async (companyId: string, input: z.infer<typeof createExpenseSchema>) => {
        // Verify job exists
        const job = await prisma.job.findFirst({ where: { id: input.jobId, companyId } });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        return prisma.expense.create({
            data: {
                companyId,
                ...input,
                date: new Date(input.date)
            },
        });
    },

    getByJob: async (jobId: string, companyId: string) => {
        return prisma.expense.findMany({
            where: { jobId, companyId },
            orderBy: { date: 'desc' }
        });
    }
};
