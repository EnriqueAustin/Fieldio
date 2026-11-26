"use client";

import { useState } from "react";
import { onlineManager } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, ChevronRight, ClipboardCheck, CloudOff, FileDown, FileText, Lock, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { toast } from "../../ui/use-toast";
import { useAuthStore } from "../../../store/auth";
import { viewCertificatePdf } from "../../forms/certificate-actions";
import { FormFillSheet } from "./form-fill-sheet";
import { getFields, getSchema, useJobForms, type FormTemplate } from "./use-forms";

interface FormsCardProps {
    jobId: string;
}

/** Work-tab card: on-site forms & CoC for this job. Required-before-completion
 *  forms sort first with a clear status; tap opens the mobile fill sheet. Renders
 *  nothing when the company has no active templates (no noise on form-less jobs). */
export function FormsCard({ jobId }: FormsCardProps) {
    const forms = useJobForms(jobId);
    const userId = useAuthStore((s) => s.user?.id);
    const [active, setActive] = useState<FormTemplate | null>(null);

    // Slim while loading; render nothing at all if there are no forms to show.
    if (forms.query.isLoading || !forms.hasForms) return null;

    const canSubmitTemplate = (t: FormTemplate) =>
        getSchema(t).requiresCoc ? forms.canIssueCoC : true;

    const openTemplate = (t: FormTemplate) => setActive(t);

    const handleSubmit = async (payload: { data: Record<string, unknown>; signatureUrl?: string }): Promise<boolean> => {
        if (!active) return false;
        const name = active.name;
        // Offline: the submission is queued (paused) and mutateAsync would never
        // resolve, leaving the sheet stuck on "Submitting…" and tempting a second
        // tap → duplicate CoC. Fire-and-forget, confirm it's saved, and close
        // immediately. The stamped idempotency key means a replay can't duplicate;
        // the optimistic pending submission disables re-submit for this template.
        // Form photos are already in IndexedDB and upload when this replays.
        if (!onlineManager.isOnline()) {
            void forms.submit({ jobId, templateId: active.id, ...payload, detached: true }).catch(() => {});
            toast({ title: "Saved — will send when online", description: name });
            setActive(null);
            return true;
        }
        try {
            await forms.submit({ jobId, templateId: active.id, ...payload });
            toast({ title: "Form submitted", description: name });
            setActive(null);
            return true;
        } catch {
            // onError toast is raised by the hook; keep the sheet open to retry.
            return false;
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                        Forms &amp; compliance
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                    {forms.templates.map((t) => {
                        const schema = getSchema(t);
                        const submission = forms.submissionByTemplate.get(t.id);
                        const submitted = !!submission;
                        // A queued (offline) submission exists but hasn't synced — block
                        // re-submit so a second tap can't create a duplicate CoC.
                        const queued = Boolean(submission?.pending);
                        const requiredForCompletion = Boolean(schema.requiredForCompletion);
                        const isCoc = Boolean(schema.requiresCoc);
                        const locked = isCoc && !forms.canIssueCoC;
                        const gatingPending = requiredForCompletion && !submitted;
                        const questionCount = getFields(t).filter((f) => f.type !== "section").length;
                        // The submitting tech can open their own certificate once it has synced.
                        const canViewPdf = !!submission && !queued && !!userId && submission.userId === userId;

                        return (
                            <div key={t.id} className="space-y-1.5">
                                <button
                                    type="button"
                                    disabled={queued}
                                    onClick={queued ? undefined : () => openTemplate(t)}
                                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border p-3.5 text-left transition active:scale-[0.99] disabled:cursor-default disabled:opacity-90 ${
                                        gatingPending ? "border-amber-300 bg-amber-50" : "hover:bg-slate-50"
                                    }`}
                                >
                                    <span className="shrink-0">
                                        {queued ? (
                                            <CloudOff className="h-5 w-5 text-blue-500" />
                                        ) : submitted ? (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                        ) : locked ? (
                                            <Lock className="h-5 w-5 text-amber-500" />
                                        ) : (
                                            <FileText className="h-5 w-5 text-slate-400" />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-medium">{t.name}</span>
                                            {isCoc && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                                    <ShieldCheck className="h-3 w-3" /> CoC
                                                </span>
                                            )}
                                            {requiredForCompletion && !submitted && (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                                    Required
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                            {queued
                                                ? "Saved — will send when online"
                                                : submitted && submission
                                                ? `Submitted ${format(new Date(submission.createdAt), "MMM d, p")}`
                                                : locked
                                                ? "Restricted — needs “Issue CoC” permission"
                                                : requiredForCompletion
                                                ? "Required before completion · Not started"
                                                : `${questionCount} field${questionCount !== 1 ? "s" : ""} · Not started`}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                                </button>
                                {canViewPdf && submission && (
                                    <button
                                        type="button"
                                        onClick={() => viewCertificatePdf(submission.id)}
                                        className="ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-2 text-sm font-medium text-blue-600"
                                    >
                                        <FileDown className="h-4 w-4" /> View certificate PDF
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {forms.requiredPending && (
                        <p className="pt-1 text-xs font-medium text-amber-700">
                            A required form must be submitted before this job can be completed.
                        </p>
                    )}
                </CardContent>
            </Card>

            {active && (
                <FormFillSheet
                    template={active}
                    jobId={jobId}
                    canSubmit={canSubmitTemplate(active)}
                    isSubmitting={forms.isSubmitting}
                    onSubmit={handleSubmit}
                    onClose={() => setActive(null)}
                />
            )}
        </>
    );
}
