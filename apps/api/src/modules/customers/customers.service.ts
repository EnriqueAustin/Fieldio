import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// SARS requires the buyer's VAT number and billing address on a tax invoice
// over R5,000, so the office must be able to capture (and later clear) them.
// A SA VAT number is exactly 10 digits and starts with 4. Empty string / null
// are allowed so a value can be cleared; a non-empty value must match the format.
const vatNumberSchema = z
    .string()
    .trim()
    .regex(/^4\d{9}$/, 'VAT number must be 10 digits starting with 4')
    .optional()
    .or(z.literal(''))
    .nullable();

const billingAddressSchema = z.string().trim().optional().or(z.literal('')).nullable();

const createCustomerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    notes: z.string().optional(),
    vatNumber: vatNumberSchema,
    billingAddress: billingAddressSchema,
    property: z.object({
        addressLine1: z.string(),
        addressLine2: z.string().optional(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
    }).optional(),
});

const updateCustomerSchema = z.object({
    name: z.string().min(2).optional(),
    // email / phone accept null so the office can clear them from the edit form.
    email: z.string().email().optional().or(z.literal('')).nullable(),
    phone: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    vatNumber: vatNumberSchema,
    billingAddress: billingAddressSchema,
    status: z.enum(['ACTIVE', 'LEAD', 'ARCHIVED']).optional(),
});

// One row of a bulk customer import. Only `name` is required; everything else
// is optional so a spreadsheet can carry as little as a name + phone.
const importRowSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
    phone: z.string().trim().optional().or(z.literal('')),
    notes: z.string().trim().optional().or(z.literal('')),
    addressLine1: z.string().trim().optional().or(z.literal('')),
    addressLine2: z.string().trim().optional().or(z.literal('')),
    city: z.string().trim().optional().or(z.literal('')),
    state: z.string().trim().optional().or(z.literal('')),
    zip: z.string().trim().optional().or(z.literal('')),
    // A row may also carry the buyer's tax details for SARS-compliant invoices.
    // An invalid VAT number fails just that row (reported), not the whole import.
    vatNumber: z.string().trim().regex(/^4\d{9}$/, 'VAT number must be 10 digits starting with 4').optional().or(z.literal('')),
    billingAddress: z.string().trim().optional().or(z.literal('')),
});

const bulkImportSchema = z.object({
    rows: z.array(z.record(z.string(), z.any())).min(1, 'No rows to import').max(2000, 'Import is limited to 2000 rows at a time'),
});

// Dedup key for a customer that has no email: normalized name + digits of phone.
const namePhoneKey = (name?: string | null, phone?: string | null) =>
    `${(name ?? '').trim().toLowerCase()}|${(phone ?? '').replace(/\D/g, '')}`;

export const customerService = {
    findAll: async (companyId: string, page = 1, limit = 20, search?: string, branchId?: string) => {
        const skip = (page - 1) * limit;
        const where: any = { companyId, deletedAt: null };
        if (branchId) where.branchId = branchId;

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                include: { _count: { select: { properties: true, jobs: true } } },
            }),
            prisma.customer.count({ where }),
        ]);

        return { items, total, page, totalPages: Math.ceil(total / limit) };
    },

    findOne: async (id: string, companyId: string) => {
        const customer = await prisma.customer.findFirst({
            where: { id, companyId, deletedAt: null },
            include: {
                properties: { include: { assets: true } },
                jobs: {
                    where: { deletedAt: null },
                    orderBy: { createdAt: 'desc' },
                    take: 25,
                    include: {
                        tech: { select: { id: true, firstName: true, lastName: true, email: true } },
                        invoice: { select: { id: true, status: true, total: true, balance: true } },
                    },
                },
                _count: { select: { jobs: true, properties: true } },
            },
        });

        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        // Lifetime value and what they owe must cover every invoice this customer
        // ever had, not just the page of recent jobs loaded above — otherwise the
        // headline numbers silently under-report as soon as they have history.
        const invoices = await prisma.invoice.findMany({
            where: { companyId, deletedAt: null, job: { customerId: id } },
            select: { status: true, total: true, balance: true },
        });

        const lifetimeValue = invoices
            .filter((i) => i.status !== 'VOID')
            .reduce((sum, i) => sum + (Number(i.total) - Number(i.balance)), 0);
        const outstanding = invoices
            .filter((i) => i.status !== 'VOID' && i.status !== 'PAID')
            .reduce((sum, i) => sum + Number(i.balance), 0);

        const openJobs = await prisma.job.count({
            where: {
                companyId,
                customerId: id,
                deletedAt: null,
                status: { notIn: ['COMPLETED', 'CANCELED'] },
            },
        });

        return {
            ...customer,
            summary: {
                lifetimeValue,
                outstanding,
                invoiceCount: invoices.length,
                jobCount: customer._count.jobs,
                openJobs,
                propertyCount: customer._count.properties,
            },
        };
    },

    create: async (companyId: string, input: unknown) => {
        const data = createCustomerSchema.parse(input);
        return prisma.$transaction(async (tx) => {
            const customer = await tx.customer.create({
                data: {
                    companyId,
                    name: data.name,
                    email: data.email || null,
                    phone: data.phone,
                    notes: data.notes,
                    vatNumber: data.vatNumber || null,
                    billingAddress: data.billingAddress || null,
                },
            });

            if (data.property) {
                await tx.property.create({
                    data: { companyId, customerId: customer.id, ...data.property },
                });
            }

            return customer;
        });
    },

    update: async (id: string, companyId: string, input: unknown) => {
        const data = updateCustomerSchema.parse(input);
        const customer = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);

        // Normalize the optional tax fields so an empty value clears them to null
        // rather than storing an empty string.
        const updateData: Record<string, unknown> = { ...data };
        if ('vatNumber' in data) updateData.vatNumber = data.vatNumber || null;
        if ('billingAddress' in data) updateData.billingAddress = data.billingAddress || null;

        return prisma.customer.update({ where: { id }, data: updateData });
    },

    softDelete: async (id: string, companyId: string) => {
        const customer = await prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
        if (!customer) throw new AppError('Customer not found', StatusCodes.NOT_FOUND);
        await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
        return { deleted: true };
    },

    /**
     * Bulk-create customers (and their primary property) from parsed spreadsheet rows.
     * Rows that fail validation are reported; rows that duplicate an existing customer
     * — or an earlier row in the same file — are skipped. Valid, unique rows are
     * inserted in a single transaction via createMany for speed.
     */
    bulkImport: async (companyId: string, payload: unknown) => {
        const { rows } = bulkImportSchema.parse(payload);

        // Preload existing dedup keys so we don't re-import customers already on file.
        const existing = await prisma.customer.findMany({
            where: { companyId, deletedAt: null },
            select: { name: true, email: true, phone: true },
        });
        const existingEmails = new Set(existing.filter(c => c.email).map(c => c.email!.trim().toLowerCase()));
        const existingNamePhone = new Set(existing.map(c => namePhoneKey(c.name, c.phone)));

        const seenEmails = new Set<string>();
        const seenNamePhone = new Set<string>();
        const errors: { row: number; message: string }[] = [];

        const customerData: { id: string; companyId: string; name: string; email: string | null; phone: string | null; notes: string | null; vatNumber: string | null; billingAddress: string | null }[] = [];
        const propertyData: { companyId: string; customerId: string; addressLine1: string; addressLine2: string | null; city: string; state: string; zip: string }[] = [];
        let skipped = 0;

        rows.forEach((raw, i) => {
            const rowNum = i + 1;
            const parsed = importRowSchema.safeParse(raw);
            if (!parsed.success) {
                errors.push({ row: rowNum, message: parsed.error.issues[0]?.message ?? 'Invalid row' });
                return;
            }
            const d = parsed.data;
            const email = (d.email ?? '').trim().toLowerCase();
            const npKey = namePhoneKey(d.name, d.phone);

            const isDuplicate = (email && (existingEmails.has(email) || seenEmails.has(email)))
                || existingNamePhone.has(npKey) || seenNamePhone.has(npKey);
            if (isDuplicate) {
                skipped++;
                return;
            }
            if (email) seenEmails.add(email);
            seenNamePhone.add(npKey);

            const id = randomUUID();
            customerData.push({
                id,
                companyId,
                name: d.name,
                email: d.email ? d.email.trim() : null,
                phone: d.phone ? d.phone.trim() : null,
                notes: d.notes ? d.notes.trim() : null,
                vatNumber: d.vatNumber ? d.vatNumber.trim() : null,
                billingAddress: d.billingAddress ? d.billingAddress.trim() : null,
            });

            // Only attach a property when we have at least a street address.
            if (d.addressLine1 && d.addressLine1.trim()) {
                propertyData.push({
                    companyId,
                    customerId: id,
                    addressLine1: d.addressLine1.trim(),
                    addressLine2: d.addressLine2 ? d.addressLine2.trim() : null,
                    city: d.city?.trim() ?? '',
                    state: d.state?.trim() ?? '',
                    zip: d.zip?.trim() ?? '',
                });
            }
        });

        if (customerData.length > 0) {
            await prisma.$transaction([
                prisma.customer.createMany({ data: customerData }),
                ...(propertyData.length > 0 ? [prisma.property.createMany({ data: propertyData })] : []),
            ]);
        }

        return {
            total: rows.length,
            created: customerData.length,
            skipped,
            failed: errors.length,
            errors,
        };
    },
};
