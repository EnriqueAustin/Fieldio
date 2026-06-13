"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    FileSignature,
    Plus,
    Trash2,
    GripVertical,
    ClipboardCheck,
    FileText,
    Eye,
    ShieldCheck,
} from "lucide-react";
import api from "../../../lib/api";
import { useAuthStore } from "../../../store/auth";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "../../../components/ui/dialog";
import { toast } from "../../../components/ui/use-toast";

type FieldType = "text" | "textarea" | "number" | "date" | "checkbox" | "select";

interface FormField {
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    options?: string[];
}

interface FormSchema {
    fields: FormField[];
    /** CoC / compliance certificate — only users with the canIssueCoC permission may submit. */
    requiresCoc?: boolean;
}

interface FormTemplate {
    id: string;
    name: string;
    description: string | null;
    schema: FormSchema | Record<string, unknown>;
    active: boolean;
    createdAt: string;
}

interface FormSubmission {
    id: string;
    templateId: string;
    jobId: string | null;
    customerId: string | null;
    data: Record<string, unknown>;
    signatureUrl: string | null;
    createdAt: string;
    template: { name: string };
    user: { firstName: string | null; lastName: string | null } | null;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
    { value: "text", label: "Short text" },
    { value: "textarea", label: "Paragraph" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "checkbox", label: "Checkbox (Yes/No)" },
    { value: "select", label: "Dropdown" },
];

/** A Certificate of Compliance starter so SA plumbing/electrical teams aren't staring at a blank builder. */
const COC_STARTER: { name: string; description: string; fields: FormField[] } = {
    name: "Certificate of Compliance (Plumbing)",
    description: "IOPSA-style CoC capturing installation details and compliance sign-off.",
    fields: [
        { key: "installation_address", label: "Installation address", type: "text", required: true },
        { key: "work_description", label: "Description of work", type: "textarea", required: true },
        { key: "water_pressure_ok", label: "Water pressure within spec", type: "checkbox", required: false },
        { key: "no_cross_connections", label: "No cross connections present", type: "checkbox", required: false },
        { key: "geyser_compliant", label: "Geyser installation compliant (SANS 10254)", type: "checkbox", required: false },
        { key: "plumber_pirb_number", label: "Plumber PIRB number", type: "text", required: true },
        { key: "inspection_date", label: "Inspection date", type: "date", required: true },
    ],
};

const slugify = (label: string) =>
    label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `field_${Date.now()}`;

function getFields(template: FormTemplate): FormField[] {
    const schema = template.schema as FormSchema;
    return Array.isArray(schema?.fields) ? schema.fields : [];
}

export default function DigitalFormsPage() {
    const qc = useQueryClient();
    const role = useAuthStore((s) => s.user?.role);
    const canManage = role === "ADMIN" || role === "OFFICE";

    const [builderOpen, setBuilderOpen] = useState(false);
    const [viewing, setViewing] = useState<FormSubmission | null>(null);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [fields, setFields] = useState<FormField[]>([]);
    const [requiresCoc, setRequiresCoc] = useState(false);

    const { data: templates, isLoading: templatesLoading } = useQuery({
        queryKey: ["form-templates"],
        queryFn: () =>
            api.get("/digital-forms/templates").then((r) => r.data.data.templates as FormTemplate[]),
    });

    const { data: submissions, isLoading: submissionsLoading } = useQuery({
        queryKey: ["form-submissions"],
        queryFn: () =>
            api.get("/digital-forms/submissions").then((r) => r.data.data.submissions as FormSubmission[]),
    });

    const templateNameById = useMemo(() => {
        const map = new Map<string, string>();
        (templates ?? []).forEach((t) => map.set(t.id, t.name));
        return map;
    }, [templates]);

    const resetBuilder = () => {
        setName("");
        setDescription("");
        setFields([]);
        setRequiresCoc(false);
    };

    const loadStarter = () => {
        setName(COC_STARTER.name);
        setDescription(COC_STARTER.description);
        setFields(COC_STARTER.fields.map((f) => ({ ...f })));
        setRequiresCoc(true);
    };

    const addField = () =>
        setFields((prev) => [
            ...prev,
            { key: "", label: "", type: "text", required: false },
        ]);

    const updateField = (index: number, patch: Partial<FormField>) =>
        setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

    const removeField = (index: number) =>
        setFields((prev) => prev.filter((_, i) => i !== index));

    const saveTemplate = async () => {
        const trimmedName = name.trim();
        const cleanFields = fields
            .filter((f) => f.label.trim())
            .map((f) => ({
                ...f,
                key: f.key || slugify(f.label),
                label: f.label.trim(),
                options:
                    f.type === "select"
                        ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
                        : undefined,
            }));

        if (!trimmedName) {
            toast({ title: "Give the form a name", variant: "destructive" });
            return;
        }
        if (cleanFields.length === 0) {
            toast({ title: "Add at least one field", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            await api.post("/digital-forms/templates", {
                name: trimmedName,
                description: description.trim() || undefined,
                schema: { fields: cleanFields, requiresCoc },
            });
            await qc.invalidateQueries({ queryKey: ["form-templates"] });
            toast({ title: "Form template created" });
            setBuilderOpen(false);
            resetBuilder();
        } catch (err: any) {
            toast({
                title: "Could not save template",
                description: err?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const submitterName = (s: FormSubmission) =>
        [s.user?.firstName, s.user?.lastName].filter(Boolean).join(" ") || "Technician";

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <FileSignature className="h-7 w-7 text-primary" />
                        Digital Forms & Compliance
                    </h1>
                    <p className="page-subtitle">
                        Build Certificates of Compliance, safety checklists, and inspection forms for the field.
                    </p>
                </div>
                {canManage && (
                    <Dialog
                        open={builderOpen}
                        onOpenChange={(open) => {
                            setBuilderOpen(open);
                            if (!open) resetBuilder();
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-slate-900 hover:bg-slate-800">
                                <Plus className="h-4 w-4" /> Create Form Template
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>New form template</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={loadStarter}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                    >
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Start from CoC template
                                    </button>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Form name</Label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Certificate of Compliance, Gas Safety Check"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Description</Label>
                                    <Input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="When should a tech fill this in?"
                                    />
                                </div>

                                <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                    <input
                                        type="checkbox"
                                        checked={requiresCoc}
                                        onChange={(e) => setRequiresCoc(e.target.checked)}
                                        className="mt-0.5"
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium text-amber-900">
                                            Certificate of Compliance (restricted)
                                        </span>
                                        <span className="block text-xs text-amber-700">
                                            Only team members granted the “Issue CoC” permission can submit this form. Set
                                            that permission per user under Team.
                                        </span>
                                    </span>
                                </label>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Fields</Label>
                                        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addField}>
                                            <Plus className="h-3.5 w-3.5" /> Add field
                                        </Button>
                                    </div>

                                    {fields.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                            No fields yet. Add fields or start from the CoC template above.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {fields.map((field, index) => (
                                                <div key={index} className="rounded-xl border p-3 space-y-2.5">
                                                    <div className="flex items-start gap-2">
                                                        <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-slate-300" />
                                                        <div className="grid flex-1 gap-2 sm:grid-cols-[1fr,150px]">
                                                            <Input
                                                                value={field.label}
                                                                onChange={(e) =>
                                                                    updateField(index, {
                                                                        label: e.target.value,
                                                                        key: slugify(e.target.value),
                                                                    })
                                                                }
                                                                placeholder="Question / label"
                                                            />
                                                            <select
                                                                value={field.type}
                                                                onChange={(e) =>
                                                                    updateField(index, { type: e.target.value as FieldType })
                                                                }
                                                                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                                                            >
                                                                {FIELD_TYPES.map((t) => (
                                                                    <option key={t.value} value={t.value}>
                                                                        {t.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeField(index)}
                                                            className="mt-2 text-rose-500 hover:text-rose-600"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    {field.type === "select" && (
                                                        <Input
                                                            value={(field.options ?? []).join(", ")}
                                                            onChange={(e) =>
                                                                updateField(index, {
                                                                    options: e.target.value.split(","),
                                                                })
                                                            }
                                                            placeholder="Comma-separated options: Pass, Fail, N/A"
                                                            className="ml-6"
                                                        />
                                                    )}

                                                    <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                                                        <input
                                                            type="checkbox"
                                                            checked={field.required}
                                                            onChange={(e) =>
                                                                updateField(index, { required: e.target.checked })
                                                            }
                                                        />
                                                        Required
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setBuilderOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveTemplate} disabled={saving}>
                                    {saving ? "Saving..." : "Save template"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-indigo-50 text-indigo-600">
                            <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{templates?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Form templates</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600">
                            <FileText className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{submissions?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Submissions</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">
                            {(submissions ?? []).filter((s) => s.signatureUrl).length}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Signed off</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Templates */}
                <div className="surface-card overflow-hidden">
                    <div className="border-b border-border/60 px-5 py-3.5">
                        <h2 className="text-sm font-semibold">Form templates</h2>
                        <p className="text-xs text-muted-foreground">Available for technicians to complete in the field.</p>
                    </div>
                    <div className="divide-y divide-border/60">
                        {templatesLoading ? (
                            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading templates...</p>
                        ) : (templates ?? []).length === 0 ? (
                            <div className="flex flex-col items-center px-5 py-12 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <FileSignature className="h-5 w-5" />
                                </div>
                                <p className="mt-3 text-sm font-medium">No templates yet</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {canManage
                                        ? "Create a Certificate of Compliance or safety checklist to get started."
                                        : "An admin hasn't published any forms yet."}
                                </p>
                            </div>
                        ) : (
                            (templates ?? []).map((t) => (
                                <div key={t.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{t.name}</p>
                                            {(t.schema as FormSchema)?.requiresCoc && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                                    <ShieldCheck className="h-3 w-3" /> CoC · restricted
                                                </span>
                                            )}
                                        </div>
                                        {t.description && (
                                            <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                                        )}
                                    </div>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                        {getFields(t).length} field{getFields(t).length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Submissions */}
                <div className="surface-card overflow-hidden">
                    <div className="border-b border-border/60 px-5 py-3.5">
                        <h2 className="text-sm font-semibold">Recent submissions</h2>
                        <p className="text-xs text-muted-foreground">Forms completed by technicians in the field.</p>
                    </div>
                    <div className="divide-y divide-border/60">
                        {submissionsLoading ? (
                            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading submissions...</p>
                        ) : (submissions ?? []).length === 0 ? (
                            <div className="flex flex-col items-center px-5 py-12 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <p className="mt-3 text-sm font-medium">No submissions yet</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Completed forms from the field will appear here.
                                </p>
                            </div>
                        ) : (
                            (submissions ?? []).map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setViewing(s)}
                                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50/70"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">
                                            {s.template?.name ?? templateNameById.get(s.templateId) ?? "Form"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {submitterName(s)} · {new Date(s.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                                        <Eye className="h-3.5 w-3.5" /> View
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Submission detail */}
            <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewing?.template?.name ?? "Submission"}</DialogTitle>
                    </DialogHeader>
                    {viewing && (
                        <div className="space-y-4">
                            <p className="text-xs text-muted-foreground">
                                Completed by {submitterName(viewing)} on{" "}
                                {new Date(viewing.createdAt).toLocaleString()}
                            </p>
                            <dl className="space-y-3">
                                {Object.entries(viewing.data ?? {}).map(([key, value]) => (
                                    <div key={key} className="rounded-lg border p-3">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            {key.replace(/_/g, " ")}
                                        </dt>
                                        <dd className="mt-1 text-sm">
                                            {typeof value === "boolean"
                                                ? value
                                                    ? "Yes"
                                                    : "No"
                                                : String(value ?? "—")}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            {viewing.signatureUrl && (
                                <div>
                                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Signature
                                    </p>
                                    <img
                                        src={viewing.signatureUrl}
                                        alt="Signature"
                                        className="h-24 rounded-lg border bg-white p-2"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
