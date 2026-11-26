"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, Lock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { SignaturePad } from "./signature-pad";
import { toast } from "../../ui/use-toast";
import { resizeImageForUpload } from "../../../lib/image-resize";
import { delFormPhotoBlob, putFormPhotoBlob } from "../../../lib/offline-db";
import { newClientMutationId } from "../../../lib/offline-mutations";
import { PASS_FAIL_OPTIONS, type FormColumn } from "../../forms/form-schema";
import {
    fieldId,
    getFields,
    getSchema,
    type FormField,
    type FormTemplate,
} from "./use-forms";

interface FormFillSheetProps {
    template: FormTemplate;
    jobId: string;
    /** False when the template is a CoC and the tech lacks canIssueCoC. */
    canSubmit: boolean;
    isSubmitting: boolean;
    /** Resolve `false` when the submission failed and the sheet stays open. */
    onSubmit: (payload: { data: Record<string, unknown>; signatureUrl?: string }) => Promise<boolean> | boolean;
    onClose: () => void;
}

/** A photo captured in this sheet: bytes already in IndexedDB, preview in memory. */
interface PhotoDraft {
    blobId: string;
    previewUrl: string;
}

type TableRow = Record<string, string>;

const INPUT = "min-h-[48px] w-full rounded-xl border border-input bg-background px-3.5 text-base";
const DEFAULT_MAX_PHOTOS = 6;

const isBlank = (v: unknown) =>
    v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

const isNumeric = (v: string) => /^[-+]?(\d+[.,]?\d*|[.,]\d+)$/.test(v.trim().replace(/\s/g, ""));

const emptyRow = (columns: FormColumn[]): TableRow => Object.fromEntries(columns.map((c) => [c.key, ""]));

function initialValue(field: FormField): unknown {
    switch (field.type) {
        case "checkbox":
            return false;
        case "boolean":
            return null; // a Yes/No question starts unanswered
        case "multiselect":
        case "photo":
            return [];
        case "table": {
            const columns = field.columns ?? [];
            const rows = Math.max(field.minRows ?? 0, 1);
            return Array.from({ length: rows }, () => emptyRow(columns));
        }
        default:
            return "";
    }
}

/** Mirrors the server's validation so the tech sees problems before queueing. */
function firstProblem(fields: FormField[], values: Record<string, unknown>): string | null {
    for (const [index, f] of fields.entries()) {
        if (f.type === "section") continue;
        const v = values[fieldId(f, index)];
        switch (f.type) {
            case "checkbox":
                // A tick-box is a confirmation: required = ticked.
                if (f.required && v !== true) return `Confirm “${f.label}”`;
                break;
            case "boolean":
                // A Yes/No question: required = answered; "No" is a valid answer.
                if (f.required && typeof v !== "boolean") return `Answer “${f.label}”`;
                break;
            case "number":
                if (!isBlank(v) && !isNumeric(String(v))) return `“${f.label}” must be a number`;
                if (f.required && isBlank(v)) return `“${f.label}” is required`;
                break;
            case "photo": {
                const count = Array.isArray(v) ? v.length : 0;
                const min = Math.max(f.minCount ?? 0, f.required ? 1 : 0);
                if (count < min) return `“${f.label}” needs ${min} photo${min === 1 ? "" : "s"}`;
                break;
            }
            case "table": {
                const columns = f.columns ?? [];
                const rows = (Array.isArray(v) ? (v as TableRow[]) : []).filter((r) =>
                    columns.some((c) => !isBlank(r[c.key]))
                );
                const min = Math.max(f.minRows ?? 0, f.required ? 1 : 0);
                if (rows.length < min) return `“${f.label}” needs at least ${min} row${min === 1 ? "" : "s"}`;
                for (const [r, row] of rows.entries()) {
                    for (const c of columns) {
                        const cell = row[c.key];
                        if (c.required && isBlank(cell)) return `“${f.label}” row ${r + 1}: ${c.label} is required`;
                        if (c.type === "number" && !isBlank(cell) && !isNumeric(cell)) {
                            return `“${f.label}” row ${r + 1}: ${c.label} must be a number`;
                        }
                    }
                }
                break;
            }
            default:
                if (f.required && isBlank(v)) return `“${f.label}” is required`;
        }
    }
    return null;
}

/** Full-screen mobile-first form renderer. Touch targets ≥44px, big Submit. */
export function FormFillSheet({
    template,
    jobId,
    canSubmit,
    isSubmitting,
    onSubmit,
    onClose,
}: FormFillSheetProps) {
    const fields = useMemo(() => getFields(template), [template]);
    const schema = getSchema(template);
    const restricted = Boolean(schema.requiresCoc);

    const [values, setValues] = useState<Record<string, unknown>>(() => {
        const init: Record<string, unknown> = {};
        fields.forEach((f, i) => {
            if (f.type !== "section") init[fieldId(f, i)] = initialValue(f);
        });
        return init;
    });

    // Blobs captured in this sheet. If the tech backs out without submitting, the
    // bytes are removed from IndexedDB; once submitted, the queued mutation owns them.
    const draftBlobsRef = useRef<Set<string>>(new Set());
    const previewUrlsRef = useRef<Set<string>>(new Set());
    const submittedRef = useRef(false);

    useEffect(() => {
        const blobs = draftBlobsRef.current;
        const urls = previewUrlsRef.current;
        return () => {
            urls.forEach((u) => URL.revokeObjectURL(u));
            if (!submittedRef.current) blobs.forEach((id) => void delFormPhotoBlob(id).catch(() => undefined));
        };
    }, []);

    const setValue = (id: string, value: unknown) => setValues((prev) => ({ ...prev, [id]: value }));

    const toggleMulti = (id: string, option: string) =>
        setValues((prev) => {
            const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
            return {
                ...prev,
                [id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
            };
        });

    const addPhoto = async (id: string, field: FormField, file: File) => {
        const blobId = `formphoto-${newClientMutationId()}`;
        // Same on-device compression as job photos (~300–500KB) before it's queued.
        const resized = await resizeImageForUpload(file);
        try {
            await putFormPhotoBlob(blobId, {
                jobId,
                caption: `${template.name} — ${field.label}`,
                blob: resized,
                fileName: resized.name || `${blobId}.jpg`,
                createdAt: Date.now(),
            });
        } catch (err) {
            const name = (err as { name?: string } | null)?.name;
            toast({
                title: name === "QuotaExceededError" ? "Storage full — photo not saved" : "Couldn't save photo",
                description: "Reconnect to sync queued work, then try again.",
                variant: "destructive",
            });
            return;
        }
        draftBlobsRef.current.add(blobId);
        const previewUrl = URL.createObjectURL(resized);
        previewUrlsRef.current.add(previewUrl);
        setValues((prev) => ({
            ...prev,
            [id]: [...((prev[id] as PhotoDraft[] | undefined) ?? []), { blobId, previewUrl }],
        }));
    };

    const removePhoto = (id: string, blobId: string) => {
        draftBlobsRef.current.delete(blobId);
        void delFormPhotoBlob(blobId).catch(() => undefined);
        setValues((prev) => ({
            ...prev,
            [id]: ((prev[id] as PhotoDraft[] | undefined) ?? []).filter((p) => p.blobId !== blobId),
        }));
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const problem = firstProblem(fields, values);
        if (problem) {
            toast({ title: problem, variant: "destructive" });
            return;
        }

        // Shape answers for the queue: photos travel as blob references (the bytes
        // stay in IndexedDB and upload on replay); blank table rows are dropped.
        const data: Record<string, unknown> = {};
        fields.forEach((f, i) => {
            if (f.type === "section") return;
            const id = fieldId(f, i);
            const v = values[id];
            if (f.type === "photo") {
                data[id] = ((v as PhotoDraft[] | undefined) ?? []).map((p) => ({ blobId: p.blobId }));
            } else if (f.type === "table") {
                const columns = f.columns ?? [];
                data[id] = ((v as TableRow[] | undefined) ?? []).filter((r) => columns.some((c) => !isBlank(r[c.key])));
            } else {
                data[id] = v;
            }
        });

        // A signature field doubles as the submission's signatureUrl.
        const sigIndex = fields.findIndex((f) => f.type === "signature");
        const signatureUrl = sigIndex >= 0 ? (values[fieldId(fields[sigIndex], sigIndex)] as string) || undefined : undefined;
        // Mark first: the sheet unmounts as soon as a submission is accepted or
        // queued, and the queued mutation then owns the photo blobs.
        submittedRef.current = true;
        const ok = await onSubmit({ data, signatureUrl });
        if (!ok) submittedRef.current = false;
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 items-center gap-1 pr-2 text-sm font-medium text-muted-foreground active:scale-95"
                >
                    <ChevronLeft className="h-5 w-5" />
                    Back
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        {restricted && <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />}
                        <h2 className="truncate text-base font-semibold">{template.name}</h2>
                    </div>
                </div>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
                {template.description && (
                    <p className="mb-4 text-sm text-muted-foreground">{template.description}</p>
                )}

                {restricted && !canSubmit && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            This is a Certificate of Compliance. Only a registered person your admin has given the
                            “Issue CoC” permission can submit it. You can look through the fields, but ask your office to
                            grant the permission (or send a registered colleague) to issue it.
                        </span>
                    </div>
                )}

                <div className="space-y-5">
                    {fields.map((field, index) => {
                        const id = fieldId(field, index);
                        return (
                            <FieldRow
                                key={id}
                                field={field}
                                value={values[id]}
                                disabled={!canSubmit}
                                onChange={(v) => setValue(id, v)}
                                onToggleMulti={(opt) => toggleMulti(id, opt)}
                                onAddPhoto={(file) => void addPhoto(id, field, file)}
                                onRemovePhoto={(blobId) => removePhoto(id, blobId)}
                            />
                        );
                    })}
                    {fields.length === 0 && (
                        <p className="text-sm text-muted-foreground">This form has no fields configured.</p>
                    )}
                </div>
            </div>

            {/* Sticky submit */}
            <div className="border-t border-border bg-background px-4 py-3">
                <button
                    type="button"
                    disabled={!canSubmit || isSubmitting}
                    onClick={() => void handleSubmit()}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                >
                    {!canSubmit ? "Not authorised to submit" : isSubmitting ? "Submitting…" : "Submit form"}
                </button>
            </div>
        </div>
    );
}

function FieldLabel({ field }: { field: FormField }) {
    return (
        <div className="mb-1.5">
            <span className="block text-sm font-medium">
                {field.label}
                {field.unit && <span className="font-normal text-muted-foreground"> ({field.unit})</span>}
                {field.required && <span className="text-rose-500"> *</span>}
            </span>
            {field.help && field.type !== "passfail" && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{field.help}</span>
            )}
        </div>
    );
}

function PassFailButtons({
    value,
    disabled,
    onChange,
    compact,
}: {
    value: unknown;
    disabled: boolean;
    onChange: (value: string) => void;
    compact?: boolean;
}) {
    return (
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {PASS_FAIL_OPTIONS.map((opt) => {
                const on = value === opt.value;
                const tone =
                    opt.value === "pass"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : opt.value === "fail"
                        ? "border-rose-400 bg-rose-50 text-rose-800"
                        : "border-slate-400 bg-slate-100 text-slate-700";
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onChange(on ? "" : opt.value)}
                        className={`${compact ? "min-h-[44px]" : "min-h-[48px]"} rounded-xl border text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                            on ? tone : "border-input text-muted-foreground"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

function TableField({
    field,
    value,
    disabled,
    onChange,
}: {
    field: FormField;
    value: unknown;
    disabled: boolean;
    onChange: (value: TableRow[]) => void;
}) {
    const columns = field.columns ?? [];
    const rows = Array.isArray(value) ? (value as TableRow[]) : [];
    const minRows = Math.max(field.minRows ?? 0, field.required ? 1 : 0);

    const setCell = (r: number, key: string, cell: string) =>
        onChange(rows.map((row, i) => (i === r ? { ...row, [key]: cell } : row)));

    return (
        <div>
            <FieldLabel field={field} />
            <div className="space-y-3">
                {rows.map((row, r) => (
                    <div key={r} className="rounded-xl border border-border p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Row {r + 1}
                            </span>
                            <button
                                type="button"
                                disabled={disabled || rows.length <= Math.max(minRows, 1)}
                                onClick={() => onChange(rows.filter((_, i) => i !== r))}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-rose-500 disabled:opacity-30"
                                aria-label={`Remove row ${r + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {columns.map((col) => {
                                const cell = row[col.key] ?? "";
                                const label = (
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                        {col.label}
                                        {col.unit ? ` (${col.unit})` : ""}
                                        {col.required && <span className="text-rose-500"> *</span>}
                                    </span>
                                );
                                if (col.type === "passfail") {
                                    return (
                                        <div key={col.key} className="col-span-2">
                                            {label}
                                            <PassFailButtons
                                                compact
                                                value={cell}
                                                disabled={disabled}
                                                onChange={(v) => setCell(r, col.key, v)}
                                            />
                                        </div>
                                    );
                                }
                                if (col.type === "select") {
                                    return (
                                        <label key={col.key} className="block">
                                            {label}
                                            <select
                                                className={INPUT}
                                                value={cell}
                                                disabled={disabled}
                                                onChange={(e) => setCell(r, col.key, e.target.value)}
                                            >
                                                <option value="">Select…</option>
                                                {(col.options ?? []).map((o) => (
                                                    <option key={o} value={o}>
                                                        {o}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    );
                                }
                                return (
                                    <label key={col.key} className={col.type === "text" ? "col-span-2 block" : "block"}>
                                        {label}
                                        <input
                                            className={INPUT}
                                            type="text"
                                            inputMode={col.type === "number" ? "decimal" : "text"}
                                            value={cell}
                                            disabled={disabled}
                                            onChange={(e) => setCell(r, col.key, e.target.value)}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
                <button
                    type="button"
                    disabled={disabled || rows.length >= 200}
                    onClick={() => onChange([...rows, emptyRow(columns)])}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-700 active:scale-[0.99] disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" /> Add row
                </button>
            </div>
        </div>
    );
}

function PhotoField({
    field,
    value,
    disabled,
    onAdd,
    onRemove,
}: {
    field: FormField;
    value: unknown;
    disabled: boolean;
    onAdd: (file: File) => void;
    onRemove: (blobId: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const photos = Array.isArray(value) ? (value as PhotoDraft[]) : [];
    const max = field.maxCount ?? DEFAULT_MAX_PHOTOS;
    const min = Math.max(field.minCount ?? 0, field.required ? 1 : 0);

    return (
        <div>
            <FieldLabel field={field} />
            <p className="-mt-1 mb-2 text-xs text-muted-foreground">
                {photos.length} of {min > 0 ? `${min}${max > min ? `–${max}` : ""}` : `up to ${max}`} photo
                {max === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                    <div key={p.blobId} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-slate-100">
                        <img src={p.previewUrl} alt={`${field.label} photo ${i + 1}`} className="h-full w-full object-cover" />
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => onRemove(p.blobId)}
                                className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                                aria-label={`Remove photo ${i + 1}`}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ))}
                {photos.length < max && (
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs font-medium text-slate-600 active:scale-[0.98] disabled:opacity-50"
                    >
                        <Camera className="h-6 w-6" />
                        Take photo
                    </button>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onAdd(file);
                }}
            />
        </div>
    );
}

function FieldRow({
    field,
    value,
    disabled,
    onChange,
    onToggleMulti,
    onAddPhoto,
    onRemovePhoto,
}: {
    field: FormField;
    value: unknown;
    disabled: boolean;
    onChange: (value: unknown) => void;
    onToggleMulti: (option: string) => void;
    onAddPhoto: (file: File) => void;
    onRemovePhoto: (blobId: string) => void;
}) {
    if (field.type === "section") {
        return (
            <div className="border-b border-border pb-1.5 pt-3">
                <h3 className="text-base font-semibold">{field.label}</h3>
                {field.help && (
                    <p className="mt-1.5 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{field.help}</p>
                )}
            </div>
        );
    }

    if (field.type === "table") {
        return <TableField field={field} value={value} disabled={disabled} onChange={onChange} />;
    }

    if (field.type === "photo") {
        return <PhotoField field={field} value={value} disabled={disabled} onAdd={onAddPhoto} onRemove={onRemovePhoto} />;
    }

    if (field.type === "passfail") {
        return (
            <div>
                <FieldLabel field={field} />
                <PassFailButtons value={value} disabled={disabled} onChange={onChange} />
            </div>
        );
    }

    if (field.type === "textarea") {
        return (
            <div>
                <FieldLabel field={field} />
                <textarea
                    className={`${INPUT} min-h-[96px] py-2.5`}
                    value={String(value ?? "")}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        );
    }

    if (field.type === "boolean") {
        return (
            <div>
                <FieldLabel field={field} />
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={field.label}>
                    {[
                        { v: true, label: "Yes", tone: "border-emerald-400 bg-emerald-50 text-emerald-800" },
                        { v: false, label: "No", tone: "border-rose-400 bg-rose-50 text-rose-800" },
                    ].map((opt) => {
                        const on = value === opt.v;
                        return (
                            <button
                                key={opt.label}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                disabled={disabled}
                                onClick={() => onChange(on ? null : opt.v)}
                                className={`min-h-[48px] rounded-xl border text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                                    on ? opt.tone : "border-input text-muted-foreground"
                                }`}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (field.type === "checkbox") {
        const checked = value === true;
        return (
            <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`flex min-h-[52px] w-full items-center justify-between rounded-xl border px-4 text-left ${
                    checked ? "border-emerald-300 bg-emerald-50" : "border-input"
                } disabled:opacity-60`}
            >
                <span className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-rose-500"> *</span>}
                </span>
                <span
                    className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition ${
                        checked ? "justify-end bg-emerald-500" : "justify-start bg-slate-300"
                    }`}
                >
                    <span className="h-6 w-6 rounded-full bg-white" />
                </span>
            </button>
        );
    }

    if (field.type === "select") {
        return (
            <div>
                <FieldLabel field={field} />
                <select
                    className={INPUT}
                    value={String(value ?? "")}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">Select…</option>
                    {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    if (field.type === "multiselect") {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
            <div>
                <FieldLabel field={field} />
                <div className="space-y-2">
                    {(field.options ?? []).map((opt) => {
                        const on = selected.includes(opt);
                        return (
                            <button
                                key={opt}
                                type="button"
                                disabled={disabled}
                                onClick={() => onToggleMulti(opt)}
                                className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-4 text-left text-sm ${
                                    on ? "border-emerald-300 bg-emerald-50" : "border-input"
                                } disabled:opacity-60`}
                            >
                                <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                        on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"
                                    }`}
                                >
                                    {on && "✓"}
                                </span>
                                {opt}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (field.type === "signature") {
        return (
            <div>
                <FieldLabel field={field} />
                <SignaturePad disabled={disabled} onChange={(v) => onChange(v ?? "")} />
            </div>
        );
    }

    // text / number / date — numbers use a text input with a decimal keypad so
    // "12,5" (decimal comma) is accepted as typed.
    return (
        <div>
            <FieldLabel field={field} />
            <input
                className={INPUT}
                type={field.type === "date" ? "date" : "text"}
                inputMode={field.type === "number" ? "decimal" : undefined}
                value={String(value ?? "")}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
