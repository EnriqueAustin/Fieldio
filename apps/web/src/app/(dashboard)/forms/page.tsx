"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    FileSignature,
    Plus,
    ClipboardCheck,
    FileText,
    Eye,
    Pencil,
    ShieldCheck,
    Lock,
    Unlock,
    Send,
} from "lucide-react";
import api from "../../../lib/api";
import { useAuthStore } from "../../../store/auth";
import { Button } from "../../../components/ui/button";
import { toast } from "../../../components/ui/use-toast";
import { TemplateBuilderDialog, type BuilderTemplate } from "../../../components/forms/template-builder-dialog";
import { SubmissionDetailDialog, sentLabel } from "../../../components/forms/submission-detail-dialog";
import { CERTIFICATE_OFFICE_ROLES } from "../../../components/forms/certificates-section";
import {
    answerableFields,
    readSchema,
    submissionTitle,
    submitterName,
    type FormSchema,
    type FormSubmissionView,
} from "../../../components/forms/form-schema";

interface FormTemplate extends BuilderTemplate {
    active: boolean;
    createdAt: string;
}

export default function DigitalFormsPage() {
    const qc = useQueryClient();
    const role = useAuthStore((s) => s.user?.role);
    const canManage = role === "ADMIN" || role === "OFFICE";
    const canReview = !!role && CERTIFICATE_OFFICE_ROLES.includes(role);

    // `undefined` = closed, `null` = creating, a template = editing it.
    const [builderTemplate, setBuilderTemplate] = useState<FormTemplate | null | undefined>(undefined);
    const [viewingId, setViewingId] = useState<string | null>(null);

    const { data: templates, isLoading: templatesLoading, isError: templatesError } = useQuery({
        queryKey: ["form-templates"],
        queryFn: () =>
            api.get("/digital-forms/templates").then((r) => r.data.data.templates as FormTemplate[]),
    });

    const {
        data: submissions,
        isLoading: submissionsLoading,
        isError: submissionsError,
    } = useQuery({
        queryKey: ["form-submissions"],
        queryFn: () =>
            api.get("/digital-forms/submissions").then((r) => r.data.data.submissions as FormSubmissionView[]),
        enabled: canReview,
    });

    // Inline toggle of the "required to complete" gate on an existing template,
    // so the office doesn't have to open the builder to flip it.
    const toggleRequiredMutation = useMutation({
        mutationFn: ({ template, next }: { template: FormTemplate; next: boolean }) => {
            const schema = readSchema(template.schema);
            return api.patch(`/digital-forms/templates/${template.id}`, {
                schema: { ...schema, fields: schema.fields ?? [], requiredForCompletion: next },
            });
        },
        onSuccess: async (_data, { next }) => {
            await qc.invalidateQueries({ queryKey: ["form-templates"] });
            toast({
                title: next ? "Form now required to complete jobs" : "Completion gate removed",
            });
        },
        onError: (err: any) =>
            toast({
                title: "Could not update template",
                description: err?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            }),
    });

    const viewing = useMemo(
        () => (viewingId ? (submissions ?? []).find((s) => s.id === viewingId) ?? null : null),
        [viewingId, submissions]
    );

    const sentCount = (submissions ?? []).filter((s) => s.sentAt).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <FileSignature className="h-7 w-7 text-primary" />
                        Digital Forms & Compliance
                    </h1>
                    <p className="page-subtitle">
                        Build Certificate of Compliance records, safety checklists and inspection forms for the field.
                    </p>
                </div>
                {canManage && (
                    <Button className="gap-2 bg-slate-900 hover:bg-slate-800" onClick={() => setBuilderTemplate(null)}>
                        <Plus className="h-4 w-4" /> Create Form Template
                    </Button>
                )}
            </div>

            {canManage && (
                <TemplateBuilderDialog
                    open={builderTemplate !== undefined}
                    onOpenChange={(open) => !open && setBuilderTemplate(undefined)}
                    template={builderTemplate ?? null}
                />
            )}

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
                            <Send className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-semibold">{sentCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Sent to customers</p>
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
                        ) : templatesError ? (
                            <p className="px-5 py-12 text-center text-sm text-rose-600">
                                Couldn&apos;t load templates. Refresh to try again.
                            </p>
                        ) : (templates ?? []).length === 0 ? (
                            <div className="flex flex-col items-center px-5 py-12 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <FileSignature className="h-5 w-5" />
                                </div>
                                <p className="mt-3 text-sm font-medium">No templates yet</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {canManage
                                        ? "Create a form, or add the electrical or plumbing CoC record from the library."
                                        : "An admin hasn't published any forms yet."}
                                </p>
                            </div>
                        ) : (
                            (templates ?? []).map((t) => {
                                const schema = readSchema(t.schema) as FormSchema;
                                const required = Boolean(schema.requiredForCompletion);
                                const fieldCount = answerableFields(t.schema).length;
                                return (
                                    <div key={t.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium">{t.name}</p>
                                                {schema.requiresCoc && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                                        <ShieldCheck className="h-3 w-3" /> CoC · restricted
                                                    </span>
                                                )}
                                                {required && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                                        <Lock className="h-3 w-3" /> Required to complete
                                                    </span>
                                                )}
                                                {schema.autoSendToCustomer && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                                        <Send className="h-3 w-3" /> Auto-sends
                                                    </span>
                                                )}
                                            </div>
                                            {t.description && (
                                                <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleRequiredMutation.mutate({ template: t, next: !required })
                                                    }
                                                    disabled={toggleRequiredMutation.isPending}
                                                    title={
                                                        required
                                                            ? "Remove the completion gate"
                                                            : "Require this form before a job can be completed"
                                                    }
                                                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                                                        required
                                                            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                                            : "border-border text-muted-foreground hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {required ? (
                                                        <>
                                                            <Unlock className="h-3 w-3" /> Un-require
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Lock className="h-3 w-3" /> Require
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setBuilderTemplate(t)}
                                                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    <Pencil className="h-3 w-3" /> Edit
                                                </button>
                                            )}
                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                                {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Submissions */}
                {canReview && (
                    <div className="surface-card overflow-hidden">
                        <div className="border-b border-border/60 px-5 py-3.5">
                            <h2 className="text-sm font-semibold">Recent submissions</h2>
                            <p className="text-xs text-muted-foreground">
                                Forms and certificates completed in the field. Open one to view the PDF or send it.
                            </p>
                        </div>
                        <div className="divide-y divide-border/60">
                            {submissionsLoading ? (
                                <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading submissions...</p>
                            ) : submissionsError ? (
                                <p className="px-5 py-12 text-center text-sm text-rose-600">
                                    Couldn&apos;t load submissions. Refresh to try again.
                                </p>
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
                                        onClick={() => setViewingId(s.id)}
                                        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50/70"
                                    >
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 text-sm font-medium">
                                                {s.requiresCoc && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                                                <span className="truncate">{submissionTitle(s)}</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {s.certificateNumber ? `No. ${s.certificateNumber} · ` : ""}
                                                {submitterName(s)} · {format(new Date(s.createdAt), "d MMM yyyy")}
                                            </p>
                                            <p className={`text-xs ${s.sentAt ? "text-emerald-700" : "text-muted-foreground"}`}>
                                                {sentLabel(s) ?? "Not sent"}
                                            </p>
                                        </div>
                                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-blue-600">
                                            <Eye className="h-3.5 w-3.5" /> View
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <SubmissionDetailDialog submission={viewing} onClose={() => setViewingId(null)} canSend={canReview} />
        </div>
    );
}
