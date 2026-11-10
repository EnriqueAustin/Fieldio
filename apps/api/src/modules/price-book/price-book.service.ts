import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const ITEM_TYPES = ['SERVICE', 'MATERIAL', 'LABOR'] as const;

// Money is stored as Decimal; always round to cents before it lands in the DB so
// a stray fraction from a CSV or JS float can't leak into prices or costs.
const toCents = (n: number) => Math.round(n * 100) / 100;

const createItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    unitPrice: z.number().min(0),
    costPrice: z.number().min(0).optional(),
    type: z.enum(ITEM_TYPES).default('SERVICE'),
    category: z.string().optional(),
    sku: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial().extend({
    active: z.boolean().optional(),
});

// The schema has no `unit`/`taxable` columns yet, so we accept them (common in
// supplier exports) and ignore them rather than failing the whole row.
const importRowSchema = z.object({
    name: z.string().min(1),
    sku: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    type: z.enum(ITEM_TYPES).optional(),
    unit: z.string().optional().nullable(),
    unitPrice: z.coerce.number().min(0),
    costPrice: z.coerce.number().min(0).optional().nullable(),
    description: z.string().optional().nullable(),
    taxable: z.coerce.boolean().optional().nullable(),
});

const MAX_IMPORT_ROWS = 2000;
// Callers that don't paginate (estimate picker, job line items, field quoting)
// expect the whole book, so the default page is generous and also the hard cap.
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 500;

export interface ListOptions {
    search?: string;
    category?: string;
    type?: string;
    includeInactive?: boolean;
    page?: number;
    pageSize?: number;
}

/**
 * Technicians work the field and select items by name/SKU only — they must not
 * see what the company charges. Strip pricing before it ever leaves the API so
 * it can't be read from the network response or client memory either.
 */
function hidePricesForTech<T extends { unitPrice?: unknown; costPrice?: unknown }>(items: T[], role?: string) {
    if (role !== 'TECHNICIAN') return items;
    return items.map(({ unitPrice: _unitPrice, costPrice: _costPrice, ...rest }) => rest);
}

export const priceBookService = {
    getAll: async (companyId: string, opts: ListOptions = {}, role?: string) => {
        const where: any = { companyId };
        if (!opts.includeInactive) where.active = true;
        if (opts.category) where.category = opts.category;
        if (opts.type && ITEM_TYPES.includes(opts.type as any)) where.type = opts.type;
        if (opts.search) {
            const q = opts.search.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ];
        }

        const page = Math.max(1, opts.page ?? 1);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));

        const [items, total] = await Promise.all([
            prisma.priceBookItem.findMany({
                where,
                orderBy: [{ category: 'asc' }, { name: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.priceBookItem.count({ where }),
        ]);

        return {
            items: hidePricesForTech(items, role),
            // Named `count` (not `total`) so a row count is never mistaken for a
            // money field by the technician price-leak guards.
            count: total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
    },

    getCategories: async (companyId: string) => {
        const items = await prisma.priceBookItem.findMany({
            where: { companyId, active: true, category: { not: null } },
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });
        return items.map((i) => i.category).filter(Boolean);
    },

    getOne: async (id: string, companyId: string, role?: string) => {
        const item = await prisma.priceBookItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Price book item not found', StatusCodes.NOT_FOUND);
        return hidePricesForTech([item], role)[0];
    },

    create: async (companyId: string, input: unknown) => {
        const parsed = createItemSchema.parse(input);
        return prisma.priceBookItem.create({
            data: {
                companyId,
                ...parsed,
                unitPrice: toCents(parsed.unitPrice),
                costPrice: parsed.costPrice != null ? toCents(parsed.costPrice) : null,
            },
        });
    },

    update: async (id: string, companyId: string, input: unknown) => {
        const parsed = updateItemSchema.parse(input);
        const item = await prisma.priceBookItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Price book item not found', StatusCodes.NOT_FOUND);

        const data: any = { ...parsed };
        if (parsed.unitPrice != null) data.unitPrice = toCents(parsed.unitPrice);
        if (parsed.costPrice != null) data.costPrice = toCents(parsed.costPrice);

        return prisma.priceBookItem.update({ where: { id }, data });
    },

    // Soft-delete: the model has no `deletedAt`, so archiving flips `active`.
    // Nothing is destroyed, and the item can be reactivated via update.
    archive: async (id: string, companyId: string) => {
        const item = await prisma.priceBookItem.findFirst({ where: { id, companyId } });
        if (!item) throw new AppError('Price book item not found', StatusCodes.NOT_FOUND);
        return prisma.priceBookItem.update({ where: { id }, data: { active: false } });
    },

    /**
     * Bulk import JSON rows. Upserts by SKU when a row carries one, otherwise by
     * name + category, scoped to the company. Returns per-row outcome so the
     * client can show exactly which rows failed and why.
     */
    bulkImport: async (companyId: string, rows: unknown) => {
        if (!Array.isArray(rows)) {
            throw new AppError('Expected an array of rows', StatusCodes.BAD_REQUEST);
        }
        if (rows.length > MAX_IMPORT_ROWS) {
            throw new AppError(`Too many rows — ${MAX_IMPORT_ROWS} maximum per import`, StatusCodes.BAD_REQUEST);
        }

        const result = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as { row: number; message: string }[],
        };

        // Track keys already handled in this batch so a file that lists the same
        // item twice updates it once and reports the rest as skipped.
        const seen = new Set<string>();

        for (let i = 0; i < rows.length; i++) {
            const rowNumber = i + 1;
            const raw = rows[i] as Record<string, unknown>;

            // Normalise before validating: trim strings, blank out empties, upper-case type.
            const normalized: Record<string, unknown> = { ...raw };
            for (const k of Object.keys(normalized)) {
                if (typeof normalized[k] === 'string') {
                    const t = (normalized[k] as string).trim();
                    normalized[k] = t === '' ? undefined : t;
                }
            }
            if (typeof normalized.type === 'string') normalized.type = (normalized.type as string).toUpperCase();

            const parsed = importRowSchema.safeParse(normalized);
            if (!parsed.success) {
                result.errors.push({ row: rowNumber, message: parsed.error.issues[0]?.message ?? 'Invalid row' });
                continue;
            }
            const data = parsed.data;

            const sku = data.sku?.trim() || undefined;
            const category = data.category?.trim() || undefined;
            const key = sku ? `sku:${sku.toLowerCase()}` : `nc:${data.name.toLowerCase()}|${(category ?? '').toLowerCase()}`;
            if (seen.has(key)) {
                result.skipped++;
                continue;
            }
            seen.add(key);

            const existing = sku
                ? await prisma.priceBookItem.findFirst({ where: { companyId, sku } })
                : await prisma.priceBookItem.findFirst({ where: { companyId, name: data.name, category: category ?? null } });

            const payload = {
                name: data.name,
                description: data.description ?? undefined,
                unitPrice: toCents(data.unitPrice),
                costPrice: data.costPrice != null ? toCents(data.costPrice) : null,
                type: data.type ?? 'SERVICE',
                category: category ?? null,
                sku: sku ?? null,
            };

            try {
                if (existing) {
                    await prisma.priceBookItem.update({ where: { id: existing.id }, data: { ...payload, active: true } });
                    result.updated++;
                } else {
                    await prisma.priceBookItem.create({ data: { companyId, ...payload } });
                    result.created++;
                }
            } catch (err: any) {
                result.errors.push({ row: rowNumber, message: err?.message ?? 'Failed to save row' });
            }
        }

        return result;
    },
};
