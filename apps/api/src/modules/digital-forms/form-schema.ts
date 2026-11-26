import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../middleware/error';

/**
 * Template schema + submission validation for digital forms / CoC records.
 *
 * A template's `schema` JSON holds its field definitions and flags. Submissions
 * are validated against it server-side (the phone is never trusted), and the
 * cleaned answers are what get stored and rendered on the certificate PDF.
 */

export const FIELD_TYPES = [
    'text',
    'textarea',
    'number',
    'date',
    'checkbox',
    'boolean',
    'select',
    'multiselect',
    'passfail',
    'signature',
    'photo',
    'table',
    'section',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const COLUMN_TYPES = ['text', 'number', 'select', 'passfail'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Fields the certificate header / signature block reads by role, not by key. */
export const FIELD_ROLES = [
    'certificateNumber',
    'registeredPerson',
    'registrationCategory',
    'registrationNumber',
] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const PASS_FAIL_VALUES = ['pass', 'fail', 'na'] as const;

// Keys become JSON property names in every submission. They can't start with
// `_` because `__` is reserved for server metadata (template snapshot, delivery
// state). Leading digits and hyphens are allowed: the old builder produced them.
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const keyString = z.string().regex(KEY_RE, 'Use letters, digits, - and _ (not starting with _)');

const MAX_PHOTOS_PER_FIELD = 12;
const MAX_TABLE_ROWS = 200;

const columnSchema = z.object({
    key: keyString,
    label: z.string().trim().min(1).max(80),
    type: z.enum(COLUMN_TYPES),
    unit: z.string().trim().max(16).optional(),
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    required: z.boolean().optional(),
});

const fieldSchema = z.object({
    key: keyString.optional(),
    // Legacy seed templates used `name` instead of `key`.
    name: keyString.optional(),
    label: z.string().trim().min(1).max(200),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    unit: z.string().trim().max(16).optional(),
    help: z.string().max(4000).optional(),
    role: z.enum(FIELD_ROLES).optional(),
    minCount: z.number().int().min(0).max(MAX_PHOTOS_PER_FIELD).optional(),
    maxCount: z.number().int().min(1).max(MAX_PHOTOS_PER_FIELD).optional(),
    columns: z.array(columnSchema).max(15).optional(),
    minRows: z.number().int().min(0).max(MAX_TABLE_ROWS).optional(),
});

export const templateSchemaSchema = z
    .object({
        fields: z.array(fieldSchema).max(200).default([]),
        requiresCoc: z.boolean().optional(),
        requiredForCompletion: z.boolean().optional(),
        /** Email the certificate PDF to the customer as soon as it's submitted. */
        autoSendToCustomer: z.boolean().optional(),
        /**
         * Goes to the customer with the job summary (listed, linked, attached).
         * Unset = only CoC / record templates; internal forms stay internal.
         */
        customerFacing: z.boolean().optional(),
        /** Heading printed on the PDF (defaults to the template name). */
        certificateTitle: z.string().trim().max(120).optional(),
        /** 'record' = a compliance record that references an official certificate number. */
        kind: z.enum(['record', 'form']).optional(),
        libraryKey: z.string().max(64).optional(),
    })
    .superRefine((schema, ctx) => {
        const seen = new Set<string>();
        schema.fields.forEach((f, i) => {
            const key = f.key ?? f.name;
            if (!key && f.type !== 'section') {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'key'], message: `"${f.label}" needs a key` });
            }
            if (key) {
                if (seen.has(key)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'key'], message: `Duplicate field key "${key}"` });
                }
                seen.add(key);
            }
            if ((f.type === 'select' || f.type === 'multiselect') && !(f.options && f.options.length > 0)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'options'], message: `"${f.label}" needs at least one option` });
            }
            if (f.type === 'table') {
                const cols = f.columns ?? [];
                if (cols.length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'columns'], message: `"${f.label}" needs at least one column` });
                }
                const colKeys = new Set<string>();
                cols.forEach((c, j) => {
                    if (colKeys.has(c.key)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'columns', j, 'key'], message: `Duplicate column key "${c.key}"` });
                    }
                    colKeys.add(c.key);
                    if (c.type === 'select' && !(c.options && c.options.length > 0)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'columns', j, 'options'], message: `Column "${c.label}" needs at least one option` });
                    }
                });
            }
            if (f.minCount !== undefined && f.maxCount !== undefined && f.minCount > f.maxCount) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', i, 'minCount'], message: `"${f.label}": minimum photos exceeds maximum` });
            }
        });
    });

export type TemplateSchema = z.infer<typeof templateSchemaSchema>;
export type FormFieldDef = TemplateSchema['fields'][number];
export type FormColumnDef = NonNullable<FormFieldDef['columns']>[number];

/** Field key, accepting the legacy `name`. Sections get a stable positional key. */
export function fieldKey(field: Pick<FormFieldDef, 'key' | 'name'>, index: number): string {
    return field.key ?? field.name ?? `section_${index + 1}`;
}

/**
 * Validate + normalise a template schema for storage: every field gets a `key`
 * (legacy `name` folded in) so submissions and the PDF have one way to read it.
 */
function withKeys(parsed: TemplateSchema): TemplateSchema {
    return {
        ...parsed,
        fields: parsed.fields.map((f, i) => {
            const { name: _legacyName, ...rest } = f;
            return { ...rest, key: fieldKey(f, i) };
        }),
    };
}

export function normalizeTemplateSchema(input: unknown): TemplateSchema {
    return withKeys(templateSchemaSchema.parse(input ?? {}));
}

/** Lenient read of a stored schema (old rows may predate validation). */
export function readTemplateSchema(raw: unknown): TemplateSchema {
    const parsed = templateSchemaSchema.safeParse(raw ?? {});
    if (parsed.success) return withKeys(parsed.data);
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        fields: [],
        requiresCoc: Boolean(obj.requiresCoc),
        requiredForCompletion: Boolean(obj.requiredForCompletion),
    };
}

// ---------------------------------------------------------------------------
// Submission validation
// ---------------------------------------------------------------------------

export interface StoredPhoto {
    photoId?: string;
    url?: string;
    thumbnailUrl?: string | null;
    dataUrl?: string;
}

/** Resolves job-photo ids to stored rows (scoped to the submission's job + tenant). */
export type PhotoResolver = (ids: string[]) => Promise<Map<string, { id: string; url: string; thumbnailUrl: string | null }>>;

// pdfkit embeds JPEG and PNG only. Caps keep a submission under the 2 MB body limit.
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE_CHARS = 400_000;
const MAX_PHOTO_DATA_URL_CHARS = 450_000;

const isBlank = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** "12,5" (SA decimal comma) and "12.5" both parse; anything else is rejected. */
function parseNumber(v: unknown): number | null | 'invalid' {
    if (isBlank(v)) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 'invalid';
    if (typeof v !== 'string') return 'invalid';
    const s = v.trim().replace(/\s/g, '').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return 'invalid';
    return Number(s);
}

class Issues {
    list: string[] = [];
    add(msg: string) {
        this.list.push(msg);
    }
    throwIfAny() {
        if (this.list.length === 0) return;
        const shown = this.list.slice(0, 3).join('; ');
        const more = this.list.length > 3 ? ` (+${this.list.length - 3} more)` : '';
        throw new AppError(`${shown}${more}`, StatusCodes.BAD_REQUEST);
    }
}

function validateCell(col: FormColumnDef, raw: unknown, where: string, issues: Issues): unknown {
    if (isBlank(raw)) {
        if (col.required) issues.add(`${where}: "${col.label}" is required`);
        return null;
    }
    switch (col.type) {
        case 'number': {
            const n = parseNumber(raw);
            if (n === 'invalid') {
                issues.add(`${where}: "${col.label}" must be a number`);
                return null;
            }
            return n;
        }
        case 'select': {
            const s = String(raw);
            if (col.options?.length && !col.options.includes(s)) {
                issues.add(`${where}: "${col.label}" must be one of ${col.options.join(', ')}`);
                return null;
            }
            return s;
        }
        case 'passfail': {
            const s = String(raw).toLowerCase();
            if (!(PASS_FAIL_VALUES as readonly string[]).includes(s)) {
                issues.add(`${where}: "${col.label}" must be pass, fail or n/a`);
                return null;
            }
            return s;
        }
        default: {
            if (typeof raw !== 'string' && typeof raw !== 'number') {
                issues.add(`${where}: "${col.label}" must be text`);
                return null;
            }
            return String(raw).trim().slice(0, 500);
        }
    }
}

/**
 * Validate raw answers against the template and return the cleaned answers to
 * store. Unknown keys are dropped. Photo ids must belong to the submission's job.
 * Throws a 400 AppError listing the first few problems.
 */
export async function validateSubmissionData(
    schema: TemplateSchema,
    raw: Record<string, unknown>,
    resolvePhotos: PhotoResolver,
): Promise<Record<string, unknown>> {
    // Legacy / free-form templates with no field definitions: keep the answers
    // as sent, minus anything in the reserved `__` namespace.
    if (schema.fields.length === 0) {
        return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('__')));
    }

    const issues = new Issues();
    const out: Record<string, unknown> = {};

    // Resolve every referenced job photo in one query.
    const photoIds: string[] = [];
    schema.fields.forEach((f, i) => {
        if (f.type !== 'photo') return;
        const v = raw[fieldKey(f, i)];
        if (!Array.isArray(v)) return;
        for (const item of v) {
            const id = (item as StoredPhoto | null)?.photoId;
            if (typeof id === 'string' && id) photoIds.push(id);
        }
    });
    const photos = photoIds.length > 0 ? await resolvePhotos(Array.from(new Set(photoIds))) : new Map();

    schema.fields.forEach((field, index) => {
        if (field.type === 'section') return;
        const key = fieldKey(field, index);
        const v = raw[key];
        const label = field.label;

        switch (field.type) {
            case 'text':
            case 'textarea': {
                if (isBlank(v)) {
                    if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                if (typeof v !== 'string' && typeof v !== 'number') {
                    issues.add(`"${label}" must be text`);
                    return;
                }
                out[key] = String(v).trim().slice(0, field.type === 'text' ? 1000 : 10000);
                return;
            }
            case 'number': {
                const n = parseNumber(v);
                if (n === 'invalid') issues.add(`"${label}" must be a number`);
                else if (n === null) {
                    if (field.required) issues.add(`"${label}" is required`);
                } else out[key] = n;
                return;
            }
            case 'date': {
                if (isBlank(v)) {
                    if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                const s = String(v);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
                    issues.add(`"${label}" must be a date (YYYY-MM-DD)`);
                    return;
                }
                out[key] = s;
                return;
            }
            case 'checkbox': {
                // A tick-box is a confirmation (e.g. a declaration): required = ticked.
                const b = v === true || v === 'true';
                if (field.required && !b) issues.add(`"${label}" must be confirmed`);
                out[key] = b;
                return;
            }
            case 'boolean': {
                // A Yes/No question: required = answered. "No" is a valid answer
                // (e.g. "Thermostat working correctly? No").
                const b = v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
                if (b === null) {
                    if (!isBlank(v)) issues.add(`"${label}" must be Yes or No`);
                    else if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                out[key] = b;
                return;
            }
            case 'select': {
                if (isBlank(v)) {
                    if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                const s = String(v);
                if (!(field.options ?? []).includes(s)) {
                    issues.add(`"${label}" must be one of: ${(field.options ?? []).join(', ')}`);
                    return;
                }
                out[key] = s;
                return;
            }
            case 'multiselect': {
                const arr = Array.isArray(v) ? v.map(String) : isBlank(v) ? [] : null;
                if (arr === null) {
                    issues.add(`"${label}" must be a list`);
                    return;
                }
                const bad = arr.filter((o) => !(field.options ?? []).includes(o));
                if (bad.length) {
                    issues.add(`"${label}" has unknown option(s): ${bad.join(', ')}`);
                    return;
                }
                if (field.required && arr.length === 0) issues.add(`"${label}" is required`);
                out[key] = Array.from(new Set(arr));
                return;
            }
            case 'passfail': {
                if (isBlank(v)) {
                    if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                const s = String(v).toLowerCase();
                if (!(PASS_FAIL_VALUES as readonly string[]).includes(s)) {
                    issues.add(`"${label}" must be pass, fail or n/a`);
                    return;
                }
                out[key] = s;
                return;
            }
            case 'signature': {
                if (isBlank(v)) {
                    if (field.required) issues.add(`"${label}" is required`);
                    return;
                }
                if (typeof v !== 'string' || !IMAGE_DATA_URL_RE.test(v) || v.length > MAX_SIGNATURE_CHARS) {
                    issues.add(`"${label}" must be a signature image`);
                    return;
                }
                out[key] = v;
                return;
            }
            case 'photo': {
                const items = Array.isArray(v) ? v : isBlank(v) ? [] : null;
                if (items === null) {
                    issues.add(`"${label}" must be a list of photos`);
                    return;
                }
                const min = Math.max(field.minCount ?? 0, field.required ? 1 : 0);
                const max = field.maxCount ?? MAX_PHOTOS_PER_FIELD;
                if (items.length < min) {
                    issues.add(`"${label}" needs at least ${min} photo${min === 1 ? '' : 's'}`);
                    return;
                }
                if (items.length > max) {
                    issues.add(`"${label}" allows at most ${max} photo${max === 1 ? '' : 's'}`);
                    return;
                }
                const stored: StoredPhoto[] = [];
                for (const item of items) {
                    const p = (item ?? {}) as StoredPhoto;
                    if (typeof p.photoId === 'string' && p.photoId) {
                        const row = photos.get(p.photoId);
                        if (!row) {
                            issues.add(`"${label}" references a photo that isn't on this job`);
                            return;
                        }
                        // URLs always come from our own photo rows, never the client.
                        stored.push({ photoId: row.id, url: row.url, thumbnailUrl: row.thumbnailUrl });
                    } else if (
                        typeof p.dataUrl === 'string' &&
                        IMAGE_DATA_URL_RE.test(p.dataUrl) &&
                        p.dataUrl.length <= MAX_PHOTO_DATA_URL_CHARS
                    ) {
                        stored.push({ dataUrl: p.dataUrl });
                    } else {
                        issues.add(`"${label}" has an invalid photo`);
                        return;
                    }
                }
                if (stored.length > 0) out[key] = stored;
                return;
            }
            case 'table': {
                const rows = Array.isArray(v) ? v : isBlank(v) ? [] : null;
                if (rows === null) {
                    issues.add(`"${label}" must be a list of rows`);
                    return;
                }
                const columns = field.columns ?? [];
                // Rows the tech added but left completely empty don't count.
                const filled = rows.filter(
                    (r) => r && typeof r === 'object' && columns.some((c) => !isBlank((r as Record<string, unknown>)[c.key])),
                ) as Record<string, unknown>[];
                const minRows = Math.max(field.minRows ?? 0, field.required ? 1 : 0);
                if (filled.length < minRows) {
                    issues.add(`"${label}" needs at least ${minRows} row${minRows === 1 ? '' : 's'}`);
                    return;
                }
                if (filled.length > MAX_TABLE_ROWS) {
                    issues.add(`"${label}" allows at most ${MAX_TABLE_ROWS} rows`);
                    return;
                }
                const cleanRows = filled.map((row, r) => {
                    const clean: Record<string, unknown> = {};
                    for (const col of columns) {
                        const cell = validateCell(col, row[col.key], `"${label}" row ${r + 1}`, issues);
                        if (cell !== null) clean[col.key] = cell;
                    }
                    return clean;
                });
                if (cleanRows.length > 0) out[key] = cleanRows;
                return;
            }
        }
    });

    issues.throwIfAny();
    return out;
}

/** Whether submissions of this template go to the customer with the job summary. */
export function isCustomerFacing(schema: TemplateSchema): boolean {
    return schema.customerFacing ?? Boolean(schema.requiresCoc || schema.kind === 'record');
}

/** First answer whose field carries this role (e.g. the official CoC number). */
export function answerForRole(schema: TemplateSchema, answers: Record<string, unknown>, role: FieldRole): string | null {
    const index = schema.fields.findIndex((f) => f.role === role);
    if (index === -1) return null;
    const v = answers[fieldKey(schema.fields[index], index)];
    return isBlank(v) ? null : String(v);
}
