import { prisma } from '@fieldio/database';

interface SearchActor {
    role?: string;
    userId?: string;
}

/**
 * Global quick-search across the entities a user jumps between most: customers,
 * jobs and invoices. Always company-scoped; results are capped so the topbar
 * dropdown stays snappy.
 *
 * Technicians are deliberately restricted, mirroring the price-hiding rule the
 * rest of the stack enforces server-side:
 *   - invoices are never returned (they carry monetary totals techs must not see);
 *   - jobs are limited to the ones assigned to the tech (directly or via their van),
 *     so search can't be used to browse other crews' work.
 */
export const searchService = {
    globalSearch: async (companyId: string, q: string, actor: SearchActor = {}) => {
        const term = q.trim();
        if (term.length < 2) {
            return { customers: [], jobs: [], invoices: [] };
        }

        const isTechnician = actor.role === 'TECHNICIAN';
        const insensitive = { contains: term, mode: 'insensitive' as const };

        // For a technician, scope the job search to jobs assigned to them or to a
        // van they crew. Everyone else searches the whole company.
        let jobAssignment: Record<string, unknown> = {};
        if (isTechnician && actor.userId) {
            const memberships = await prisma.vanMember.findMany({
                where: { userId: actor.userId, van: { companyId } },
                select: { vanId: true },
            });
            const vanIds = memberships.map((m) => m.vanId);
            jobAssignment = {
                OR: [
                    { techId: actor.userId },
                    ...(vanIds.length ? [{ vanId: { in: vanIds } }] : []),
                ],
            };
        }

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
                    AND: [
                        { OR: [{ title: insensitive }, { description: insensitive }] },
                        jobAssignment,
                    ],
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
            // Techs never see invoices (monetary data). Skip the query entirely.
            isTechnician
                ? Promise.resolve([])
                : prisma.invoice.findMany({
                      where: { companyId, deletedAt: null, invoiceNumber: insensitive },
                      select: { id: true, invoiceNumber: true, status: true, total: true },
                      orderBy: { createdAt: 'desc' },
                      take: 5,
                  }),
        ]);

        return { customers, jobs, invoices };
    },
};
