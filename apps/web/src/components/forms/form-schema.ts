/**
 * Digital form / CoC record template types shared by the office builder, the
 * office submission views and the technician fill sheet. Mirrors the API's
 * apps/api/src/modules/digital-forms/form-schema.ts (validated server-side).
 */

export type FormFieldType =
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "checkbox"
    | "boolean"
    | "select"
    | "multiselect"
    | "passfail"
    | "signature"
    | "photo"
    | "table"
    | "section";

export type FormColumnType = "text" | "number" | "select" | "passfail";

export type FormFieldRole = "certificateNumber" | "registeredPerson" | "registrationCategory" | "registrationNumber";

export interface FormColumn {
    key: string;
    label: string;
    type: FormColumnType;
    unit?: string;
    options?: string[];
    required?: boolean;
}

export interface FormField {
    // Templates are authored in two places: the office builder uses `key`, the
    // old seed templates use `name`. Support both so every template renders.
    key?: string;
    name?: string;
    label: string;
    type: FormFieldType;
    required?: boolean;
    options?: string[];
    unit?: string;
    /** Hint under the field; for a section, the paragraph shown (e.g. a declaration). */
    help?: string;
    role?: FormFieldRole;
    minCount?: number;
    maxCount?: number;
    columns?: FormColumn[];
    minRows?: number;
}

export interface FormSchema {
    fields?: FormField[];
    /** CoC / compliance certificate — only users with canIssueCoC may submit. */
    requiresCoc?: boolean;
    /** Opt-in: block job completion until a submission exists for this template. */
    requiredForCompletion?: boolean;
    /** Email the certificate to the customer as soon as it's submitted. */
    autoSendToCustomer?: boolean;
    /** Sent with the job summary. Unset = only CoC / record templates. */
    customerFacing?: boolean;
    certificateTitle?: string;
    kind?: "record" | "form";
    libraryKey?: string;
}

/** A stored photo answer: an uploaded job photo, or an inline image fallback. */
export interface PhotoAnswer {
    photoId?: string;
    url?: string;
    thumbnailUrl?: string | null;
    dataUrl?: string;
}

export const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
    { value: "section", label: "Section heading" },
    { value: "text", label: "Short text" },
    { value: "textarea", label: "Paragraph" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "checkbox", label: "Tick box (confirm)" },
    { value: "boolean", label: "Yes / No question" },
    { value: "select", label: "Dropdown" },
    { value: "multiselect", label: "Multiple choice" },
    { value: "passfail", label: "Pass / Fail / N/A" },
    { value: "table", label: "Table (repeating rows)" },
    { value: "photo", label: "Photos" },
    { value: "signature", label: "Signature" },
];

export const COLUMN_TYPE_OPTIONS: { value: FormColumnType; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "select", label: "Dropdown" },
    { value: "passfail", label: "Pass / Fail" },
];

export const FIELD_ROLE_OPTIONS: { value: FormFieldRole; label: string }[] = [
    { value: "certificateNumber", label: "Official certificate number" },
    { value: "registeredPerson", label: "Registered person name" },
    { value: "registrationCategory", label: "Registration category" },
    { value: "registrationNumber", label: "Registration number" },
];

export const PASS_FAIL_OPTIONS = [
    { value: "pass", label: "Pass" },
    { value: "fail", label: "Fail" },
    { value: "na", label: "N/A" },
] as const;

export function fieldId(field: FormField, index?: number): string {
    return field.key ?? field.name ?? (index !== undefined ? `section_${index + 1}` : "");
}

export function readSchema(schema: unknown): FormSchema {
    return (schema && typeof schema === "object" ? schema : {}) as FormSchema;
}

export function schemaFields(schema: unknown): FormField[] {
    const fields = readSchema(schema).fields;
    return Array.isArray(fields) ? fields : [];
}

/** Questions only (sections are headings, not answers). */
export function answerableFields(schema: unknown): FormField[] {
    return schemaFields(schema).filter((f) => f.type !== "section");
}

/** A stable, JSON-safe key from a label (letters, digits, underscores; starts with a letter). */
export function slugifyKey(label: string, fallback = "field"): string {
    const slug = label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
    if (!slug) return `${fallback}_${Date.now().toString(36)}`;
    return /^[a-z]/.test(slug) ? slug : `f_${slug}`;
}

const PASS_FAIL_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", na: "N/A" };

/** Human display of a single answer (tables/photos/signatures are rendered separately). */
export function displayAnswer(type: FormFieldType | FormColumnType, value: unknown, unit?: string): string {
    if (value === undefined || value === null || value === "") return "—";
    if (type === "checkbox" || type === "boolean") return value === true ? "Yes" : "No";
    if (type === "passfail") return PASS_FAIL_LABEL[String(value)] ?? String(value);
    if (Array.isArray(value)) return value.map(String).join(", ") || "—";
    if (typeof value === "object") return "—";
    return unit ? `${String(value)} ${unit}` : String(value);
}

/** Office view of a submission, as returned by GET /digital-forms/submissions. */
export interface FormSubmissionView {
    id: string;
    templateId: string;
    jobId: string | null;
    customerId: string | null;
    userId: string;
    data: Record<string, unknown>;
    signatureUrl: string | null;
    createdAt: string;
    template: { name: string; schema?: unknown } | null;
    user: { firstName: string | null; lastName: string | null } | null;
    /** The template exactly as it was when this was filled in. */
    templateSnapshot: { id: string; name: string; description: string | null; schema: unknown } | null;
    certificateNumber: string | null;
    requiresCoc: boolean;
    sentAt: string | null;
    sentChannels: string[];
    sentTo: { email?: string | null; phone?: string | null } | null;
    /** Customer-facing PDF link, once one has been sent. */
    pdfUrl?: string | null;
}

export function submissionTitle(s: Pick<FormSubmissionView, "templateSnapshot" | "template">): string {
    return s.templateSnapshot?.name ?? s.template?.name ?? "Form";
}

export function submitterName(s: Pick<FormSubmissionView, "user">): string {
    return [s.user?.firstName, s.user?.lastName].filter(Boolean).join(" ") || "Technician";
}
