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

    submitForm: async (companyId: string, userId: string, input: z.infer<typeof submitFormSchema>) => {
        const parsed = submitFormSchema.parse(input);
        
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
