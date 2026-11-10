"use client";

import { useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { ActiveJobHeader } from "./active-job-header";
import { WorkTab } from "./work-tab";
import { MediaTab } from "./media-tab";
import { CloseoutTab } from "./closeout-tab";
import { getPrimaryAction, type PriceBookItem, type TechnicianJob } from "./types";
import { useJobForms } from "./use-forms";
import type { useLineItems } from "./use-line-items";
import type { useFieldQuote } from "./use-field-quote";
import type { useFieldInvoice } from "./use-field-invoice";
import type { useExpenses } from "./use-expenses";
import type { useJobNotes } from "./use-notes";
import type { useJobPhotos } from "./use-photos";
import type { useSignature } from "./use-signature";
import type { useJobSummary } from "./use-job-summary";
import type { useJobProgress } from "./use-job-progress";

interface JobDetailProps {
    job: TechnicianJob;
    checklistCompleted: number;
    checklistRequired: number;
    canComplete: boolean;
    nextStatus: TechnicianJob["status"] | null;
    mapsHref: string;
    priceBookItems: PriceBookItem[];
    fieldQuotingEnabled: boolean;
    lineItems: ReturnType<typeof useLineItems>;
    quote: ReturnType<typeof useFieldQuote>;
    expenses: ReturnType<typeof useExpenses>;
    notes: ReturnType<typeof useJobNotes>;
    photos: ReturnType<typeof useJobPhotos>;
    signature: ReturnType<typeof useSignature>;
    summaryMutation: ReturnType<typeof useJobSummary>;
    fieldInvoice: ReturnType<typeof useFieldInvoice>;
    statusMutation: ReturnType<typeof useJobProgress>["statusMutation"];
    checklistMutation: ReturnType<typeof useJobProgress>["checklistMutation"];
    quoteSending: boolean;
    // When rendered as the mobile full-screen view: show a back button + sticky
    // action bar. On desktop the status button stays in the header.
    mobile?: boolean;
    onBack?: () => void;
}

export function JobDetail({
    job,
    checklistCompleted,
    checklistRequired,
    canComplete,
    nextStatus,
    mapsHref,
    priceBookItems,
    fieldQuotingEnabled,
    lineItems,
    quote,
    expenses,
    notes,
    photos,
    signature,
    summaryMutation,
    fieldInvoice,
    statusMutation,
    checklistMutation,
    quoteSending,
    mobile = false,
    onBack,
}: JobDetailProps) {
    const tabsRef = useRef<HTMLDivElement>(null);
    // A required-before-completion form (e.g. a CoC template the office flagged)
    // extends the existing checklist+signature gate. Shares the FormsCard query
    // cache, so this adds no extra fetch.
    const { requiredPending: requiredFormsPending } = useJobForms(job.id);
    const effectiveCanComplete = canComplete && !requiredFormsPending;

    const canInvoice = job.status === "COMPLETED" || effectiveCanComplete;
    const primary = getPrimaryAction(job);
    const primaryDisabled = primary?.nextStatus === "COMPLETED" && !effectiveCanComplete;
    // When checklist + signature are done but a required form is still outstanding,
    // point the tech at the real blocker.
    const blockReason =
        canComplete && requiredFormsPending
            ? "Submit the required compliance form in the Work tab before completing this job."
            : undefined;

    return (
        <div className={mobile ? "space-y-4 pb-40" : "space-y-6"}>
            {mobile && onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex h-11 items-center gap-1 pr-3 -ml-1 text-sm font-medium text-muted-foreground active:scale-95"
                >
                    <ChevronLeft className="h-5 w-5" />
                    All jobs
                </button>
            )}

            <ActiveJobHeader
                job={job}
                nextStatus={nextStatus}
                canComplete={effectiveCanComplete}
                blockReason={blockReason}
                mapsHref={mapsHref}
                onChangeStatus={(status) => statusMutation.mutate({ jobId: job.id, status })}
                hideStatusButton={mobile}
            />

            <Tabs
                defaultValue="work"
                onValueChange={() => {
                    // Each tab is a distinct step (audit P2 #11): reset to the tab bar
                    // on switch so a deep scroll in one tab doesn't carry into the next.
                    if (mobile) {
                        requestAnimationFrame(() =>
                            tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
                        );
                    }
                }}
            >
                <TabsList ref={tabsRef} className="grid h-[52px] w-full grid-cols-3">
                    <TabsTrigger className="min-h-[44px]" value="work">Work</TabsTrigger>
                    <TabsTrigger className="min-h-[44px]" value="media">Media</TabsTrigger>
                    <TabsTrigger className="min-h-[44px]" value="closeout">Done</TabsTrigger>
                </TabsList>

                <TabsContent value="work" className="space-y-4">
                    <WorkTab
                        job={job}
                        priceBookItems={priceBookItems}
                        lineItems={lineItems}
                        quote={quote}
                        expenses={expenses}
                        onToggleChecklist={(checkId, isCompleted) =>
                            checklistMutation.mutate({ jobId: job.id, checkId, isCompleted })
                        }
                        onSendQuote={() => quote.sendQuote(job.id)}
                        isSendingQuote={quoteSending}
                        fieldQuotingEnabled={fieldQuotingEnabled}
                    />
                </TabsContent>

                <TabsContent value="media" className="space-y-4">
                    <MediaTab
                        job={job}
                        notes={notes}
                        photos={photos}
                        onSaveNote={() => notes.saveNote(job.id)}
                    />
                </TabsContent>

                <TabsContent value="closeout">
                    <CloseoutTab
                        job={job}
                        checklistCompleted={checklistCompleted}
                        checklistRequired={checklistRequired}
                        signerName={signature.signerName}
                        setSignerName={signature.setSignerName}
                        signatureDataUrl={signature.signatureDataUrl}
                        setSignatureDataUrl={signature.setSignatureDataUrl}
                        onSaveSignature={() => signature.saveSignature(job.id)}
                        // Don't show "Saving…"/"Sending…" forever while the mutation sits
                        // paused offline — only while a request is actually in flight.
                        isSaving={signature.signatureMutation.isPending && !signature.signatureMutation.isPaused}
                        onSendSummary={() => summaryMutation.mutate({ jobId: job.id })}
                        isSendingSummary={summaryMutation.isPending}
                        canInvoice={canInvoice}
                        invoicedAt={job.invoicedAt}
                        onSendInvoice={() => fieldInvoice.sendInvoice(job.id)}
                        isSendingInvoice={fieldInvoice.invoiceMutation.isPending && !fieldInvoice.invoiceMutation.isPaused}
                    />
                </TabsContent>
            </Tabs>

            {/* Sticky primary status action — always thumb-reachable above the bottom nav. */}
            {mobile && (
                <div className="fixed inset-x-0 bottom-[var(--mobile-nav-h)] z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
                    {primary ? (
                        <button
                            type="button"
                            // `isPending` stays true while a mutation is PAUSED offline, which
                            // would wedge the action bar (tap Arrive, then can't tap Complete).
                            // Only block on a genuinely in-flight request; the optimistic status
                            // already advances `primary`, so a queued tap flips the button next.
                            disabled={primaryDisabled || (statusMutation.isPending && !statusMutation.isPaused)}
                            onClick={() =>
                                statusMutation.mutate({ jobId: job.id, status: primary.nextStatus })
                            }
                            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                        >
                            {primary.label}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="min-h-[52px] w-full rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-70"
                        >
                            Job completed
                        </button>
                    )}
                    {primaryDisabled && (
                        <p className="mt-1.5 text-center text-xs text-amber-700">
                            {blockReason ?? "Finish the checklist and capture a signature to complete."}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
