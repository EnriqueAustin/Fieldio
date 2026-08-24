"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Lock, ShieldCheck } from "lucide-react";
import { SignaturePad } from "./signature-pad";
import { toast } from "../../ui/use-toast";
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
    onSubmit: (payload: { data: Record<string, unknown>; signatureUrl?: string }) => Promise<void> | void;
    onClose: () => void;
}

const INPUT = "min-h-[48px] w-full rounded-xl border border-input bg-background px-3.5 text-base";

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
        for (const f of fields) {
            const id = fieldId(f);
            if (f.type === "checkbox" || f.type === "boolean") init[id] = false;
            else if (f.type === "multiselect") init[id] = [];
            else init[id] = "";
        }
        return init;
    });

    const setValue = (id: string, value: unknown) =>
        setValues((prev) => ({ ...prev, [id]: value }));

    const toggleMulti = (id: string, option: string) =>
        setValues((prev) => {
            const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
            return {
                ...prev,
                [id]: current.includes(option)
                    ? current.filter((o) => o !== option)
                    : [...current, option],
            };
        });

    const missingRequired = (): string | null => {
        for (const f of fields) {
            if (!f.required) continue;
            const v = values[fieldId(f)];
            const empty =
                v === "" ||
                v === null ||
                v === undefined ||
                (Array.isArray(v) && v.length === 0) ||
                ((f.type === "checkbox" || f.type === "boolean") && v === false);
            if (empty) return f.label;
        }
        return null;
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const missing = missingRequired();
        if (missing) {
            toast({ title: `“${missing}” is required`, variant: "destructive" });
            return;
        }
        // A signature field doubles as the submission's signatureUrl.
        const sigField = fields.find((f) => f.type === "signature");
        const signatureUrl = sigField ? (values[fieldId(sigField)] as string) || undefined : undefined;
        await onSubmit({ data: values, signatureUrl });
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
                            This is a Certificate of Compliance. You are not authorised to issue it — ask an admin to grant
                            you the “Issue CoC” permission. You can review the fields but can’t submit.
                        </span>
                    </div>
                )}

                <div className="space-y-5">
                    {fields.map((field) => (
                        <FieldRow
                            key={fieldId(field)}
                            field={field}
                            value={values[fieldId(field)]}
                            disabled={!canSubmit}
                            onChange={(v) => setValue(fieldId(field), v)}
                            onToggleMulti={(opt) => toggleMulti(fieldId(field), opt)}
                        />
                    ))}
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
                    onClick={handleSubmit}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                >
                    {!canSubmit ? "Not authorised to submit" : isSubmitting ? "Submitting…" : "Submit form"}
                </button>
            </div>
        </div>
    );
}

function FieldRow({
    field,
    value,
    disabled,
    onChange,
    onToggleMulti,
}: {
    field: FormField;
    value: unknown;
    disabled: boolean;
    onChange: (value: unknown) => void;
    onToggleMulti: (option: string) => void;
}) {
    const label = (
        <label className="mb-1.5 block text-sm font-medium">
            {field.label}
            {field.required && <span className="text-rose-500"> *</span>}
        </label>
    );

    if (field.type === "textarea") {
        return (
            <div>
                {label}
                <textarea
                    className={`${INPUT} min-h-[96px] py-2.5`}
                    value={String(value ?? "")}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        );
    }

    if (field.type === "checkbox" || field.type === "boolean") {
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
                    className={`inline-flex h-7 w-12 items-center rounded-full px-0.5 transition ${
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
                {label}
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
                {label}
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
                {label}
                <SignaturePad disabled={disabled} onChange={(v) => onChange(v ?? "")} />
            </div>
        );
    }

    // text / number / date
    return (
        <div>
            {label}
            <input
                className={INPUT}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={String(value ?? "")}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
