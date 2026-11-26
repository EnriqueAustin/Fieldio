"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Plus, ShieldCheck, Trash2 } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { toast } from "../ui/use-toast";
import {
    COLUMN_TYPE_OPTIONS,
    FIELD_ROLE_OPTIONS,
    FIELD_TYPE_OPTIONS,
    readSchema,
    schemaFields,
    slugifyKey,
    type FormColumn,
    type FormColumnType,
    type FormField,
    type FormFieldRole,
    type FormFieldType,
    type FormSchema,
} from "./form-schema";

export interface BuilderTemplate {
    id: string;
    name: string;
    description: string | null;
    schema: FormSchema | Record<string, unknown>;
}

interface LibraryEntry {
    key: string;
    name: string;
    description: string;
    trade: "electrical" | "plumbing";
    fieldCount: number;
}

/** Builder row: `locked` keys belong to a saved template and never change, so
 *  renaming a label doesn't orphan answers already captured under that key. */
interface DraftColumn extends FormColumn {
    locked: boolean;
}
interface DraftField extends Omit<FormField, "columns"> {
    uid: string;
    locked: boolean;
    columns?: DraftColumn[];
}

let uidCounter = 0;
const nextUid = () => `f${++uidCounter}`;

const toDraft = (f: FormField, index: number): DraftField => ({
    ...f,
    key: f.key ?? f.name ?? `section_${index + 1}`,
    name: undefined,
    uid: nextUid(),
    locked: true,
    columns: f.columns?.map((c) => ({ ...c, locked: true })),
});

const SELECT = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** Unique key: the field's own key if locked, else a slug of its label. */
function assignKeys<T extends { key?: string; label: string; locked: boolean }>(items: T[], fallback: string): string[] {
    const used = new Set(items.filter((i) => i.locked && i.key).map((i) => i.key as string));
    return items.map((item) => {
        if (item.locked && item.key) return item.key;
        const base = slugifyKey(item.label, fallback);
        let key = base;
        for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`;
        used.add(key);
        return key;
    });
}

const parseOptions = (s: string) => s.split(",").map((o) => o.trim()).filter(Boolean);
const optionalInt = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Math.floor(Number(s)) || 0));

export function TemplateBuilderDialog({
    open,
    onOpenChange,
    template,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Edit this template; omit to create a new one. */
    template?: BuilderTemplate | null;
}) {
    const qc = useQueryClient();
    const editing = !!template;

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [certificateTitle, setCertificateTitle] = useState("");
    const [fields, setFields] = useState<DraftField[]>([]);
    const [requiresCoc, setRequiresCoc] = useState(false);
    const [requiredForCompletion, setRequiredForCompletion] = useState(false);
    const [autoSend, setAutoSend] = useState(false);
    // undefined = follow the default (CoC / record templates go to the customer).
    const [customerFacing, setCustomerFacing] = useState<boolean | undefined>(undefined);
    const [extra, setExtra] = useState<Pick<FormSchema, "kind" | "libraryKey">>({});
    const [saving, setSaving] = useState(false);

    // Load the template (or a blank form) each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        const schema = readSchema(template?.schema);
        setName(template?.name ?? "");
        setDescription(template?.description ?? "");
        setCertificateTitle(schema.certificateTitle ?? "");
        setFields(schemaFields(template?.schema).map(toDraft));
        setRequiresCoc(Boolean(schema.requiresCoc));
        setRequiredForCompletion(Boolean(schema.requiredForCompletion));
        setAutoSend(Boolean(schema.autoSendToCustomer));
        setCustomerFacing(schema.customerFacing);
        setExtra({ kind: schema.kind, libraryKey: schema.libraryKey });
    }, [open, template]);

    const libraryQuery = useQuery({
        queryKey: ["form-library"],
        queryFn: () => api.get("/digital-forms/library").then((r) => r.data.data.library as LibraryEntry[]),
        enabled: open && !editing,
        staleTime: Infinity,
    });

    const addFromLibrary = useMutation({
        mutationFn: (key: string) => api.post(`/digital-forms/library/${key}`),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["form-templates"] });
            toast({ title: "Template added", description: "Review it, then tick “Required to complete” if every job needs it." });
            onOpenChange(false);
        },
        onError: (err: any) =>
            toast({
                title: "Could not add template",
                description: err?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            }),
    });

    const updateField = (uid: string, patch: Partial<DraftField>) =>
        setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));

    const moveField = (index: number, delta: number) =>
        setFields((prev) => {
            const target = index + delta;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });

    const addField = () =>
        setFields((prev) => [...prev, { uid: nextUid(), locked: false, key: "", label: "", type: "text", required: false }]);

    const setColumns = (uid: string, fn: (cols: DraftColumn[]) => DraftColumn[]) =>
        setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, columns: fn(f.columns ?? []) } : f)));

    const buildSchema = (): FormSchema | string => {
        const named = fields.filter((f) => f.label.trim());
        if (named.length === 0) return "Add at least one field";
        const keys = assignKeys(named, "field");
        const out: FormField[] = [];
        for (const [i, f] of named.entries()) {
            const field: FormField = { key: keys[i], label: f.label.trim(), type: f.type };
            if (f.type !== "section" && f.required) field.required = true;
            if (f.help?.trim()) field.help = f.help.trim();
            if (f.type === "number" && f.unit?.trim()) field.unit = f.unit.trim();
            if (f.role && (f.type === "text" || f.type === "select")) field.role = f.role;
            if (f.type === "select" || f.type === "multiselect") {
                field.options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
                if (field.options.length === 0) return `“${field.label}” needs at least one option`;
            }
            if (f.type === "photo") {
                if (f.minCount !== undefined) field.minCount = f.minCount;
                if (f.maxCount !== undefined) field.maxCount = Math.max(1, f.maxCount);
                if (field.minCount !== undefined && field.maxCount !== undefined && field.minCount > field.maxCount) {
                    return `“${field.label}”: minimum photos is more than the maximum`;
                }
            }
            if (f.type === "table") {
                const cols = (f.columns ?? []).filter((c) => c.label.trim());
                if (cols.length === 0) return `Table “${field.label}” needs at least one column`;
                const colKeys = assignKeys(cols, "col");
                field.columns = [];
                for (const [j, c] of cols.entries()) {
                    const col: FormColumn = { key: colKeys[j], label: c.label.trim(), type: c.type };
                    if (c.unit?.trim()) col.unit = c.unit.trim();
                    if (c.required) col.required = true;
                    if (c.type === "select") {
                        col.options = (c.options ?? []).map((o) => o.trim()).filter(Boolean);
                        if (col.options.length === 0) return `Column “${col.label}” needs at least one option`;
                    }
                    field.columns.push(col);
                }
                if (f.minRows !== undefined) field.minRows = f.minRows;
            }
            out.push(field);
        }
        const schema: FormSchema = { fields: out, requiresCoc, requiredForCompletion, autoSendToCustomer: autoSend };
        if (customerFacing !== undefined) schema.customerFacing = customerFacing;
        if (certificateTitle.trim()) schema.certificateTitle = certificateTitle.trim();
        if (extra.kind) schema.kind = extra.kind;
        if (extra.libraryKey) schema.libraryKey = extra.libraryKey;
        return schema;
    };

    const save = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            toast({ title: "Give the form a name", variant: "destructive" });
            return;
        }
        const schema = buildSchema();
        if (typeof schema === "string") {
            toast({ title: schema, variant: "destructive" });
            return;
        }
        setSaving(true);
        try {
            const body = { name: trimmedName, description: description.trim() || (editing ? null : undefined), schema };
            if (template) await api.patch(`/digital-forms/templates/${template.id}`, body);
            else await api.post("/digital-forms/templates", body);
            await qc.invalidateQueries({ queryKey: ["form-templates"] });
            toast({ title: template ? "Template updated" : "Form template created" });
            onOpenChange(false);
        } catch (err: any) {
            const data = err?.response?.data;
            toast({
                title: "Could not save template",
                description: data?.errors?.[0]?.message ?? data?.message ?? "Please try again.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const archive = async () => {
        if (!template) return;
        if (!window.confirm(`Archive “${template.name}”? Technicians won't see it any more. Submitted certificates are kept.`)) return;
        try {
            await api.patch(`/digital-forms/templates/${template.id}`, { active: false });
            await qc.invalidateQueries({ queryKey: ["form-templates"] });
            toast({ title: "Template archived" });
            onOpenChange(false);
        } catch (err: any) {
            toast({ title: "Could not archive", description: err?.response?.data?.message, variant: "destructive" });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Edit “${template?.name}”` : "New form template"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {!editing && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
                                <BookOpen className="h-4 w-4" /> Add from library
                            </p>
                            <p className="mt-0.5 text-xs text-emerald-800">
                                Ready-made compliance records for SA electricians and plumbers. They record the inspection
                                and the official certificate number — they are not the official certificate itself.
                            </p>
                            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                                {libraryQuery.isLoading && <p className="text-xs text-muted-foreground">Loading library…</p>}
                                {libraryQuery.isError && (
                                    <p className="text-xs text-rose-600">Couldn&apos;t load the library. Try again later.</p>
                                )}
                                {(libraryQuery.data ?? []).map((entry) => (
                                    <div key={entry.key} className="flex flex-col rounded-lg border border-emerald-200 bg-white p-3">
                                        <p className="text-sm font-medium">{entry.name}</p>
                                        <p className="mt-0.5 flex-1 text-xs text-muted-foreground">{entry.description}</p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 self-start"
                                            disabled={addFromLibrary.isPending}
                                            onClick={() => addFromLibrary.mutate(entry.key)}
                                        >
                                            <Plus className="mr-1 h-3.5 w-3.5" /> Add ({entry.fieldCount} fields)
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tpl-name">Form name</Label>
                            <Input
                                id="tpl-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Gas installation record"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tpl-title">Title printed on the PDF (optional)</Label>
                            <Input
                                id="tpl-title"
                                value={certificateTitle}
                                onChange={(e) => setCertificateTitle(e.target.value)}
                                placeholder="Defaults to the form name"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tpl-description">Description</Label>
                        <Input
                            id="tpl-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="When should a tech fill this in?"
                        />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <FlagToggle
                            checked={requiresCoc}
                            onChange={setRequiresCoc}
                            tone="amber"
                            title="Certificate of Compliance (restricted)"
                            body="Only people granted “Issue CoC” (under Team) can submit it."
                        />
                        <FlagToggle
                            checked={requiredForCompletion}
                            onChange={setRequiredForCompletion}
                            tone="blue"
                            title="Required to complete the job"
                            body="The tech can’t complete a job until this is submitted."
                        />
                        <FlagToggle
                            checked={autoSend}
                            onChange={setAutoSend}
                            tone="emerald"
                            title="Send to customer automatically"
                            body="Email/WhatsApp the PDF to the customer as soon as it’s submitted."
                        />
                        <FlagToggle
                            checked={customerFacing ?? (requiresCoc || extra.kind === "record")}
                            onChange={setCustomerFacing}
                            tone="emerald"
                            title="Include in the customer’s job summary"
                            body="Attach and link it in the closeout summary. Leave off for internal checklists."
                        />
                    </div>

                    {editing && (
                        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-muted-foreground">
                            Certificates already submitted keep the version of the form they were filled in on — your
                            edits only apply to new submissions.
                        </p>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Fields</Label>
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addField}>
                                <Plus className="h-3.5 w-3.5" /> Add field
                            </Button>
                        </div>

                        {fields.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                No fields yet. Add fields{editing ? "" : " or add a template from the library above"}.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {fields.map((field, index) => (
                                    <FieldEditor
                                        key={field.uid}
                                        field={field}
                                        isFirst={index === 0}
                                        isLast={index === fields.length - 1}
                                        onChange={(patch) => updateField(field.uid, patch)}
                                        onMove={(delta) => moveField(index, delta)}
                                        onRemove={() => setFields((prev) => prev.filter((f) => f.uid !== field.uid))}
                                        onColumns={(fn) => setColumns(field.uid, fn)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    {editing ? (
                        <Button type="button" variant="ghost" className="text-rose-600" onClick={archive}>
                            Archive template
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={saving}>
                            {saving ? "Saving..." : editing ? "Save changes" : "Save template"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const TONES = {
    amber: "border-amber-200 bg-amber-50/60 text-amber-900",
    blue: "border-blue-200 bg-blue-50/60 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
} as const;

function FlagToggle({
    checked,
    onChange,
    tone,
    title,
    body,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    tone: keyof typeof TONES;
    title: string;
    body: string;
}) {
    return (
        <label className={`flex items-start gap-2.5 rounded-xl border p-3 ${TONES[tone]}`}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
            <span className="text-sm">
                <span className="flex items-center gap-1 font-medium">
                    {tone === "amber" && <ShieldCheck className="h-3.5 w-3.5" />}
                    {title}
                </span>
                <span className="block text-xs opacity-80">{body}</span>
            </span>
        </label>
    );
}

function FieldEditor({
    field,
    isFirst,
    isLast,
    onChange,
    onMove,
    onRemove,
    onColumns,
}: {
    field: DraftField;
    isFirst: boolean;
    isLast: boolean;
    onChange: (patch: Partial<DraftField>) => void;
    onMove: (delta: number) => void;
    onRemove: () => void;
    onColumns: (fn: (cols: DraftColumn[]) => DraftColumn[]) => void;
}) {
    const isSection = field.type === "section";
    return (
        <div className={`space-y-2.5 rounded-xl border p-3 ${isSection ? "bg-slate-50" : ""}`}>
            <div className="flex items-start gap-2">
                <div className="flex flex-col">
                    <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => onMove(-1)}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move field up"
                    >
                        <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        disabled={isLast}
                        onClick={() => onMove(1)}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move field down"
                    >
                        <ArrowDown className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-[1fr,190px]">
                    <Input
                        value={field.label}
                        onChange={(e) => onChange({ label: e.target.value })}
                        placeholder={isSection ? "Section heading" : "Question / label"}
                        aria-label="Field label"
                    />
                    <select
                        value={field.type}
                        onChange={(e) => onChange({ type: e.target.value as FormFieldType })}
                        className={SELECT}
                        aria-label="Field type"
                    >
                        {FIELD_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="mt-2 text-rose-500 hover:text-rose-600"
                    aria-label="Remove field"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-2.5 pl-8">
                {isSection ? (
                    <Textarea
                        value={field.help ?? ""}
                        onChange={(e) => onChange({ help: e.target.value })}
                        placeholder="Optional paragraph under the heading (e.g. a declaration the tech confirms)"
                        rows={2}
                    />
                ) : (
                    <Input
                        value={field.help ?? ""}
                        onChange={(e) => onChange({ help: e.target.value })}
                        placeholder="Hint for the technician (optional)"
                    />
                )}

                {(field.type === "select" || field.type === "multiselect") && (
                    <Input
                        value={(field.options ?? []).join(", ")}
                        onChange={(e) => onChange({ options: e.target.value.split(",") })}
                        onBlur={(e) => onChange({ options: parseOptions(e.target.value) })}
                        placeholder="Comma-separated options: Domestic, Commercial, Industrial"
                    />
                )}

                {field.type === "number" && (
                    <Input
                        value={field.unit ?? ""}
                        onChange={(e) => onChange({ unit: e.target.value })}
                        placeholder="Unit (e.g. A, V, kPa, L)"
                        className="max-w-[200px]"
                    />
                )}

                {(field.type === "text" || field.type === "select") && (
                    <select
                        value={field.role ?? ""}
                        onChange={(e) => onChange({ role: (e.target.value || undefined) as FormFieldRole | undefined })}
                        className={`${SELECT} max-w-[320px]`}
                        aria-label="Prints on certificate as"
                    >
                        <option value="">Ordinary answer</option>
                        {FIELD_ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                                Prints as: {r.label}
                            </option>
                        ))}
                    </select>
                )}

                {field.type === "photo" && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Photos:</span>
                        <Input
                            type="number"
                            min={0}
                            max={12}
                            value={field.minCount ?? ""}
                            onChange={(e) => onChange({ minCount: optionalInt(e.target.value) })}
                            placeholder="Min"
                            className="w-20"
                            aria-label="Minimum photos"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                            type="number"
                            min={1}
                            max={12}
                            value={field.maxCount ?? ""}
                            onChange={(e) => onChange({ maxCount: optionalInt(e.target.value) })}
                            placeholder="Max"
                            className="w-20"
                            aria-label="Maximum photos"
                        />
                    </div>
                )}

                {field.type === "table" && (
                    <ColumnsEditor field={field} onChange={onChange} onColumns={onColumns} />
                )}

                {!isSection && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => onChange({ required: e.target.checked })}
                        />
                        Required
                    </label>
                )}
            </div>
        </div>
    );
}

function ColumnsEditor({
    field,
    onChange,
    onColumns,
}: {
    field: DraftField;
    onChange: (patch: Partial<DraftField>) => void;
    onColumns: (fn: (cols: DraftColumn[]) => DraftColumn[]) => void;
}) {
    const columns = field.columns ?? [];
    const updateCol = (i: number, patch: Partial<DraftColumn>) =>
        onColumns((cols) => cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));

    return (
        <div className="space-y-2 rounded-lg border border-dashed p-2.5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Columns (one row per item, e.g. per circuit)</span>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Min rows
                    <Input
                        type="number"
                        min={0}
                        value={field.minRows ?? ""}
                        onChange={(e) => onChange({ minRows: optionalInt(e.target.value) })}
                        className="h-8 w-16"
                        aria-label="Minimum rows"
                    />
                </div>
            </div>
            {columns.map((col, i) => (
                <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr,130px,80px,auto,auto]">
                    <Input
                        value={col.label}
                        onChange={(e) => updateCol(i, { label: e.target.value })}
                        placeholder="Column label"
                        aria-label="Column label"
                    />
                    <select
                        value={col.type}
                        onChange={(e) => updateCol(i, { type: e.target.value as FormColumnType })}
                        className={SELECT}
                        aria-label="Column type"
                    >
                        {COLUMN_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                    <Input
                        value={col.unit ?? ""}
                        onChange={(e) => updateCol(i, { unit: e.target.value })}
                        placeholder="Unit"
                        aria-label="Column unit"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={Boolean(col.required)}
                            onChange={(e) => updateCol(i, { required: e.target.checked })}
                        />
                        Req.
                    </label>
                    <button
                        type="button"
                        onClick={() => onColumns((cols) => cols.filter((_, j) => j !== i))}
                        className="text-rose-500 hover:text-rose-600"
                        aria-label="Remove column"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                    {col.type === "select" && (
                        <Input
                            value={(col.options ?? []).join(", ")}
                            onChange={(e) => updateCol(i, { options: e.target.value.split(",") })}
                            onBlur={(e) => updateCol(i, { options: parseOptions(e.target.value) })}
                            placeholder="Comma-separated options"
                            className="sm:col-span-5"
                        />
                    )}
                </div>
            ))}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => onColumns((cols) => [...cols, { key: "", label: "", type: "text", locked: false }])}
            >
                <Plus className="h-3.5 w-3.5" /> Add column
            </Button>
        </div>
    );
}
