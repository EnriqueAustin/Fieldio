import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const createTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    schema: z.record(z.any()),
});

const submitFormSchema = z.object({
    templateId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    propertyAssetId: z.string().uuid().optional(),
    data: z.record(z.any()),
    signatureUrl: z.string().optional(),
});

/**
 * A technician may only touch forms for a job assigned to them (or their van).
 * Mirrors the assignment guard used in jobs.service (line items / status).
 * OFFICE/ADMIN callers are unrestricted. Returns the job so callers can reuse it.
 */
async function assertJobAccess(companyId: string, userId: string, userRole: string | undefined, jobId: string) {
    const job = await prisma.job.findFirst({ where: { id: jobId, companyId, deletedAt: null } });
    if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

    if (userRole === 'TECHNICIAN') {
        let hasAccess = job.techId === userId;
        if (!hasAccess && job.vanId) {
            const membership = await prisma.vanMember.findFirst({
                where: { userId, van: { id: job.vanId, companyId } },
            });
            hasAccess = !!membership;
        }
        if (!hasAccess) {
            throw new AppError(
                'You can only work with forms for jobs assigned to you or your van',
                StatusCodes.FORBIDDEN
            );
        }
    }

    return job;
}

export const digitalFormsService = {
    createTemplate: async (companyId: string, input: z.infer<typeof createTemplateSchema>) => {
        const parsed = createTemplateSchema.parse(input);
        return prisma.digitalFormTemplate.create({
            data: {
                companyId,
                name: parsed.name,
                description: parsed.description,
                schema: parsed.schema,
            },
        });
    },

    getTemplates: async (companyId: string) => {
        return prisma.digitalFormTemplate.findMany({
            where: { companyId, active: true },
            orderBy: { name: 'asc' },
        });
    },

    // Forms surfaced to a technician for a specific job: all active company
    // templates, this job's submissions, and whether the caller may issue CoCs.
    // Assignment is enforced so a tech can't read another crew's job forms.
    getJobForms: async (companyId: string, userId: string, userRole: string | undefined, jobId: string) => {
        await assertJobAccess(companyId, userId, userRole, jobId);

        const [templates, submissions, submitter] = await Promise.all([
            prisma.digitalFormTemplate.findMany({
                where: { companyId, active: true },
                orderBy: { name: 'asc' },
            }),
            prisma.digitalFormSubmission.findMany({
                where: { companyId, jobId },
                select: {
                    id: true,
                    templateId: true,
                    signatureUrl: true,
                    createdAt: true,
                    user: { select: { firstName: true, lastName: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.findFirst({
                where: { id: userId, companyId },
                select: { permissions: true },
            }),
        ]);

        const canIssueCoC = Boolean((submitter?.permissions as Record<string, unknown> | null)?.canIssueCoC);

        return { templates, submissions, canIssueCoC };
    },

    submitForm: async (companyId: string, userId: string, input: z.infer<typeof submitFormSchema>, userRole?: string) => {
        const parsed = submitFormSchema.parse(input);

        // Technicians may only submit against jobs assigned to them / their van.
        if (parsed.jobId) {
            await assertJobAccess(companyId, userId, userRole, parsed.jobId);
        }

        const template = await prisma.digitalFormTemplate.findFirst({
            where: { id: parsed.templateId, companyId, active: true },
        });

        if (!template) {
            throw new AppError('Template not found or inactive', StatusCodes.NOT_FOUND);
        }

        // Certificate-of-Compliance templates are restricted: only users the admin
        // has granted the `canIssueCoC` capability may submit them.
        const requiresCoc = Boolean((template.schema as Record<string, unknown> | null)?.requiresCoc);
        if (requiresCoc) {
            const submitter = await prisma.user.findFirst({
                where: { id: userId, companyId },
                select: { permissions: true },
            });
            const canIssueCoC = Boolean(
                (submitter?.permissions as Record<string, unknown> | null)?.canIssueCoC
            );
            if (!canIssueCoC) {
                throw new AppError(
                    'You are not authorised to issue Certificates of Compliance. Ask an admin to grant this permission.',
                    StatusCodes.FORBIDDEN
                );
            }
        }

        return prisma.digitalFormSubmission.create({
            data: {
                companyId,
                templateId: parsed.templateId,
                jobId: parsed.jobId,
                customerId: parsed.customerId,
                propertyAssetId: parsed.propertyAssetId,
                userId,
                data: parsed.data,
                signatureUrl: parsed.signatureUrl,
            },
        });
    },

    getSubmissions: async (companyId: string, query: { templateId?: string; jobId?: string; customerId?: string }) => {
        const where: any = { companyId };
        
        if (query.templateId) where.templateId = query.templateId;
        if (query.jobId) where.jobId = query.jobId;
        if (query.customerId) where.customerId = query.customerId;

        return prisma.digitalFormSubmission.findMany({
            where,
            include: {
                template: { select: { name: true } },
                user: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    getSubmissionDetails: async (id: string, companyId: string) => {
        const submission = await prisma.digitalFormSubmission.findFirst({
            where: { id, companyId },
            include: {
                template: true,
                user: { select: { firstName: true, lastName: true } },
            },
        });

        if (!submission) {
            throw new AppError('Form submission not found', StatusCodes.NOT_FOUND);
        }

        return submission;
    }
};
