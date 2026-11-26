import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import {
    answerForRole,
    normalizeTemplateSchema,
    readTemplateSchema,
    validateSubmissionData,
    type PhotoResolver,
} from './form-schema';
import { COC_LIBRARY, findLibraryTemplate } from './coc-library';
import { readAnswers, readMeta, withMeta } from './submission-meta';
import { generateCertificatePdf, loadCertificateSource, schemaForSubmission } from './coc-pdf.service';
import { autoSendIfEnabled, sendCertificateToCustomer, type SendCertificateOptions } from './coc-delivery.service';

const createTemplateSchema = z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    schema: z.record(z.any()),
});

const updateTemplateSchema = z
    .object({
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(2000).optional().nullable(),
        schema: z.record(z.any()).optional(),
        active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const submitFormSchema = z.object({
    templateId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    propertyAssetId: z.string().uuid().optional(),
    data: z.record(z.any()),
    signatureUrl: z.string().max(400_000).optional(),
});

const sendSchema = z.object({
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
});

/** Roles that review every submission (office side). */
export const SUBMISSION_READ_ROLES = ['ADMIN', 'OFFICE', 'DISPATCHER'] as const;
const isOfficeReader = (role: string | undefined) => (SUBMISSION_READ_ROLES as readonly string[]).includes(role ?? '');

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

interface SubmissionRow {
    data: unknown;
    pdfUrl?: string | null;
    template?: { schema?: unknown } | null;
}

/**
 * Office view of a submission: answers split from server metadata, plus the
 * schema snapshot it was filled against and its delivery state. The public
 * token never leaves the server except inside the pdfUrl link (office only).
 */
function toSubmissionView<T extends SubmissionRow>(s: T, opts: { includeLink: boolean }) {
    const meta = readMeta(s.data);
    const schema = schemaForSubmission(s.data, s.template?.schema);
    const answers = readAnswers(s.data);
    const { pdfUrl, data: _data, ...rest } = s;
    return {
        ...rest,
        data: answers,
        templateSnapshot: meta.template ?? null,
        certificateNumber: answerForRole(schema, answers, 'certificateNumber'),
        requiresCoc: Boolean(schema.requiresCoc),
        sentAt: meta.sentAt ?? null,
        sentChannels: meta.sentChannels ?? [],
        sentTo: meta.sentTo ?? null,
        ...(opts.includeLink ? { pdfUrl: pdfUrl ?? null } : {}),
    };
}

export const digitalFormsService = {
    createTemplate: async (companyId: string, input: z.infer<typeof createTemplateSchema>) => {
        const parsed = createTemplateSchema.parse(input);
        return prisma.digitalFormTemplate.create({
            data: {
                companyId,
                name: parsed.name,
                description: parsed.description,
                schema: normalizeTemplateSchema(parsed.schema),
            },
        });
    },

    /**
     * Full edit (name / description / fields / flags). Safe for existing
     * certificates: every submission carries a snapshot of the schema it was
     * filled against, so editing the live template never rewrites history.
     */
    updateTemplate: async (companyId: string, id: string, input: z.infer<typeof updateTemplateSchema>) => {
        const parsed = updateTemplateSchema.parse(input);
        const template = await prisma.digitalFormTemplate.findFirst({ where: { id, companyId } });
        if (!template) throw new AppError('Template not found', StatusCodes.NOT_FOUND);

        return prisma.digitalFormTemplate.update({
            where: { id },
            data: {
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.description !== undefined ? { description: parsed.description } : {}),
                ...(parsed.schema !== undefined ? { schema: normalizeTemplateSchema(parsed.schema) } : {}),
                ...(parsed.active !== undefined ? { active: parsed.active } : {}),
            },
        });
    },

    getTemplates: async (companyId: string) => {
        return prisma.digitalFormTemplate.findMany({
            where: { companyId, active: true },
            orderBy: { name: 'asc' },
        });
    },

    /** Starter CoC record templates the office can add in one click. */
    getLibrary: () =>
        COC_LIBRARY.map((t) => ({
            key: t.key,
            name: t.name,
            description: t.description,
            trade: t.trade,
            fieldCount: t.schema.fields.filter((f) => f.type !== 'section').length,
        })),

    addFromLibrary: async (companyId: string, key: string) => {
        const entry = findLibraryTemplate(key);
        if (!entry) throw new AppError('Library template not found', StatusCodes.NOT_FOUND);
        return prisma.digitalFormTemplate.create({
            data: {
                companyId,
                name: entry.name,
                description: entry.description,
                schema: normalizeTemplateSchema(entry.schema),
            },
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
                    userId: true,
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
        const job = parsed.jobId ? await assertJobAccess(companyId, userId, userRole, parsed.jobId) : null;

        const template = await prisma.digitalFormTemplate.findFirst({
            where: { id: parsed.templateId, companyId, active: true },
        });

        if (!template) {
            throw new AppError('Template not found or inactive', StatusCodes.NOT_FOUND);
        }

        const schema = readTemplateSchema(template.schema);

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

        // Photo answers may only reference photos already on this job.
        const resolvePhotos: PhotoResolver = async (ids) => {
            if (!job) return new Map();
            const rows = await prisma.jobPhoto.findMany({
                where: { id: { in: ids }, jobId: job.id, companyId },
                select: { id: true, url: true, thumbnailUrl: true },
            });
            return new Map(rows.map((r) => [r.id, r]));
        };
        const answers = await validateSubmissionData(schema, parsed.data, resolvePhotos);

        // Snapshot the schema it was filled against so later template edits can't
        // change what this certificate says.
        const data = withMeta(answers, {
            template: {
                id: template.id,
                name: template.name,
                description: template.description ?? null,
                schema: template.schema,
                updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : null,
            },
        });

        // readTemplateSchema gives every field a key, so `f.key` is set here.
        const signatureKey = schema.fields.find((f) => f.type === 'signature' && typeof answers[f.key ?? ''] === 'string')?.key;
        const signatureUrl = parsed.signatureUrl ?? (signatureKey ? (answers[signatureKey] as string) : undefined);

        // The certificate goes to this customer, so never trust the client's id:
        // a job's form always belongs to the job's customer; otherwise the id
        // must be a customer of this company.
        let customerId: string | undefined;
        if (job) {
            customerId = job.customerId;
        } else if (parsed.customerId) {
            const customer = await prisma.customer.findFirst({
                where: { id: parsed.customerId, companyId },
                select: { id: true },
            });
            if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
            customerId = customer.id;
        }

        const submission = await prisma.digitalFormSubmission.create({
            data: {
                companyId,
                templateId: parsed.templateId,
                jobId: parsed.jobId,
                customerId,
                propertyAssetId: parsed.propertyAssetId,
                userId,
                data: data as object,
                signatureUrl,
            },
        });

        autoSendIfEnabled(submission.id, companyId, template.schema);

        return toSubmissionView(submission, { includeLink: false });
    },

    getSubmissions: async (
        companyId: string,
        query: { templateId?: string; jobId?: string; customerId?: string; take?: number }
    ) => {
        const where: { companyId: string; templateId?: string; jobId?: string; customerId?: string } = { companyId };

        if (query.templateId) where.templateId = query.templateId;
        if (query.jobId) where.jobId = query.jobId;
        if (query.customerId) where.customerId = query.customerId;

        const rows = await prisma.digitalFormSubmission.findMany({
            where,
            include: {
                template: { select: { name: true, schema: true } },
                user: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(query.take ?? 100, 1), 200),
        });
        return rows.map((s) => toSubmissionView(s, { includeLink: true }));
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

        return toSubmissionView(submission, { includeLink: true });
    },

    /**
     * Certificate PDF. Office roles may read any in their company; a technician
     * only the ones they submitted. Other tenants get a 404 (no existence leak).
     */
    getSubmissionPdf: async (id: string, companyId: string, userId: string, role: string | undefined) => {
        const { source, submission } = await loadCertificateSource(id, companyId);
        const ownSubmission = role === 'TECHNICIAN' && submission.userId === userId;
        if (!isOfficeReader(role) && !ownSubmission) {
            throw new AppError('You can only download certificates you submitted', StatusCodes.FORBIDDEN);
        }
        return generateCertificatePdf(source);
    },

    sendSubmission: async (id: string, companyId: string, input: SendCertificateOptions) => {
        const opts = sendSchema.parse(input ?? {});
        return sendCertificateToCustomer(id, companyId, opts);
    },
};

/**
 * Completion-gate helper used by jobs.service: returns the name of the first
 * active template the office flagged `requiredForCompletion` that still has no
 * submission for this job, or null when every required form is in. Mirrors the
 * field console's `requiredPending` check (apps/web .../use-forms.ts) and keeps
 * the form-schema read in one place. (`requiresCoc` is a permission gate, not a
 * completion gate, so it is deliberately not considered here.)
 */
export async function getMissingRequiredForm(companyId: string, jobId: string): Promise<string | null> {
    const templates = await prisma.digitalFormTemplate.findMany({
        where: { companyId, active: true },
    });
    const required = templates.filter((t) =>
        Boolean((t.schema as Record<string, unknown> | null)?.requiredForCompletion),
    );
    if (required.length === 0) return null;

    const submissions = await prisma.digitalFormSubmission.findMany({
        where: { companyId, jobId },
        select: { templateId: true },
    });
    const submitted = new Set(submissions.map((s) => s.templateId));

    const missing = required.find((t) => !submitted.has(t.id));
    return missing ? missing.name : null;
}
