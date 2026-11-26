"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, FileCheck2, ShieldCheck } from "lucide-react";
import api from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { submissionTitle, submitterName, type FormSubmissionView } from "./form-schema";
import { CertificateActions, SubmissionDetailDialog, sentLabel } from "./submission-detail-dialog";

/** Roles allowed to read every submission (mirrors the API's SUBMISSION_READ_ROLES). */
export const CERTIFICATE_OFFICE_ROLES = ["ADMIN", "OFFICE", "DISPATCHER"];

/** Job detail: certificates & forms submitted on this job, with View PDF / Send. */
export function CertificatesSection({ jobId }: { jobId: string }) {
    const role = useAuthStore((s) => s.user?.role);
    const allowed = !!role && CERTIFICATE_OFFICE_ROLES.includes(role);
    const [viewing, setViewing] = useState<FormSubmissionView | null>(null);

    const query = useQuery({
        queryKey: ["job-certificates", jobId],
        queryFn: () =>
            api
                .get("/digital-forms/submissions", { params: { jobId } })
                .then((r) => r.data.data.submissions as FormSubmissionView[]),
        enabled: allowed,
    });

    if (!allowed) return null;
    const submissions = query.data ?? [];
    // Keep the open dialog in sync after a send (sentAt changes).
    const current = viewing ? submissions.find((s) => s.id === viewing.id) ?? viewing : null;

    return (
        <div className="surface-card p-6">
            <div className="flex items-start gap-4">
                <div className="icon-tile bg-amber-50 text-amber-600">
                    <FileCheck2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">Certificates &amp; forms</h3>
                    {query.isLoading ? (
                        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                    ) : query.isError ? (
                        <p className="mt-2 text-sm text-rose-600">Couldn&apos;t load this job&apos;s forms. Refresh to try again.</p>
                    ) : submissions.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            No certificates or forms have been submitted on this job yet.
                        </p>
                    ) : (
                        <ul className="mt-3 divide-y divide-border/60">
                            {submissions.map((s) => (
                                <li key={s.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                                    <button
                                        type="button"
                                        onClick={() => setViewing(s)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    >
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 text-sm font-medium">
                                                {s.requiresCoc && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                                                <span className="truncate">{submissionTitle(s)}</span>
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {s.certificateNumber ? `No. ${s.certificateNumber} · ` : ""}
                                                {submitterName(s)} · {format(new Date(s.createdAt), "d MMM, HH:mm")}
                                            </p>
                                            <p className={`text-xs ${s.sentAt ? "text-emerald-700" : "text-amber-700"}`}>
                                                {sentLabel(s) ?? "Not sent to the customer"}
                                            </p>
                                        </div>
                                    </button>
                                    <CertificateActions submission={s} canSend={!!s.customerId} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <SubmissionDetailDialog submission={current} onClose={() => setViewing(null)} canSend />
        </div>
    );
}
