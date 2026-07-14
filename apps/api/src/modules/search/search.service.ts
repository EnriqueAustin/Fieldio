import { prisma } from '@fieldio/database';

/**
 * Global quick-search across the entities a user jumps between most: customers,
 * jobs and invoices. Always company-scoped; results are capped so the topbar
 * dropdown stays snappy.
 */
export const searchService = {
    globalSearch: async (companyId: string, q: string) => {
        const term = q.trim();
        if (term.length < 2) {
            return { customers: [], jobs: [], invoices: [] };
        }

        const insensitive = { contains: term, mode: 'insensitive' as const };

        const [customers, jobs, invoices] = await Promise.all([
            prisma.customer.findMany({
                where: {
                    companyId,
                    deletedAt: null,
                    OR: [{ name: insensitive }, { email: insensitive }, { phone: { contains: term } }],
                },
                select: { id: true, name: true, email: true, phone: true },
                take: 5,
            }),
            prisma.job.findMany({
                where: {
                    companyId,
                    deletedAt: null,
                    OR: [{ title: insensitive }, { description: insensitive }],
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    customer: { select: { name: true } },
                },
                orderBy: { updatedAt: 'desc' },
                take: 5,
            }),
            prisma.invoice.findMany({
                where: { companyId, deletedAt: null, invoiceNumber: insensitive },
                select: { id: true, invoiceNumber: true, status: true, total: true },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
        ]);

        return { customers, jobs, invoices };
    },
};
