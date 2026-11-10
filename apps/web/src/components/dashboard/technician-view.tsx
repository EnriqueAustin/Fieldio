"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import api from "../../lib/api";
import { googleMapsLink } from "../../lib/maps-link";
import { displayName, firstNameOf } from "../../lib/utils";
import { Card, CardContent } from "../ui/card";
import {
    getAddress,
    getJobTimeGroup,
    JOB_STATUS_FLOW,
    type TechnicianJob,
    type TechnicianViewProps,
} from "./technician/types";
import { prefetchFormsForJobs } from "./technician/use-forms";
import { usePriceBook } from "./technician/use-price-book";
import { useFieldQuote } from "./technician/use-field-quote";
import { useFieldInvoice } from "./technician/use-field-invoice";
import { useCompanySettings } from "./technician/use-company-settings";
import { useLineItems } from "./technician/use-line-items";
import { useExpenses } from "./technician/use-expenses";
import { useJobNotes } from "./technician/use-notes";
import { useJobPhotos } from "./technician/use-photos";
import { useSignature } from "./technician/use-signature";
import { useJobSummary } from "./technician/use-job-summary";
import { useJobProgress } from "./technician/use-job-progress";
import { OverviewCards } from "./technician/overview-cards";
import { JobList } from "./technician/job-list";
import { JobDetail } from "./technician/job-detail";
import { TechnicianHome } from "./technician/technician-home";
import { PullToRefresh } from "./technician/pull-to-refresh";

/** True once the job is on-site with a full checklist and a captured signature. */
function jobCanComplete(job: TechnicianJob) {
    const done = job.checklist.filter((item) => item.isCompleted).length;
    return job.status === "ON_SITE" && done === job.checklist.length && job.signatures.length > 0;
}

export function TechnicianView({ user }: TechnicianViewProps) {
    const queryClient = useQueryClient();
    // Desktop two-pane selection AND the job opened on mobile share this id.
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    // null = mobile home list; an id = focused mobile job screen.
    const [mobileJobId, setMobileJobId] = useState<string | null>(null);

    const priceBookItems = usePriceBook();
    const quote = useFieldQuote();
    const fieldInvoice = useFieldInvoice();
    const { fieldQuotingEnabled } = useCompanySettings();
    const lineItems = useLineItems(priceBookItems);
    const expenses = useExpenses();
    const notes = useJobNotes();
    const photos = useJobPhotos();
    const signature = useSignature();
    const summaryMutation = useJobSummary();
    const { statusMutation, checklistMutation } = useJobProgress();

    const assignedJobsQuery = useQuery({
        queryKey: ["technician-assigned-jobs", user.id],
        queryFn: async () => {
            const response = await api.get("/jobs/assigned/me");
            return (response.data?.data?.jobs ?? []) as TechnicianJob[];
        },
        // Poll every 30s, but only while the tab is visible and the device is
        // online — background polling burns the tech's data, and polling offline
        // just throws and would hide the cached list.
        refetchInterval: () => (onlineManager.isOnline() ? 30_000 : false),
        refetchIntervalInBackground: false,
    });

    const assignedJobs = useMemo(() => assignedJobsQuery.data ?? [], [assignedJobsQuery.data]);

    // Prefetch today's + overdue jobs' forms so the CoC/forms card works offline.
    // Once per session per job set (prefetchFormsForJobs is a no-op for cached ids).
    const prefetchedFormsKey = useRef<string | null>(null);
    useEffect(() => {
        if (!assignedJobs.length) return;
        const ids = assignedJobs
            .filter((job) => {
                const group = getJobTimeGroup(job);
                return group === "today" || group === "overdue";
            })
            .map((job) => job.id);
        if (ids.length === 0) return;
        const key = [...ids].sort().join("|");
        if (prefetchedFormsKey.current === key) return;
        prefetchedFormsKey.current = key;
        void prefetchFormsForJobs(queryClient, ids);
    }, [assignedJobs, queryClient]);

    useEffect(() => {
        if (!selectedJobId && assignedJobs.length > 0) {
            setSelectedJobId(assignedJobs[0].id);
        }
        if (selectedJobId && !assignedJobs.some((job) => job.id === selectedJobId)) {
            setSelectedJobId(assignedJobs[0]?.id ?? null);
        }
    }, [assignedJobs, selectedJobId]);

    // Reset per-job media/signature drafts whenever the worked job changes.
    useEffect(() => {
        notes.reset();
        photos.reset();
        signature.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedJobId]);

    // Browser/system back closes the mobile job screen.
    useEffect(() => {
        const onPop = () => setMobileJobId(null);
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const openMobileJob = useCallback((jobId: string) => {
        setSelectedJobId(jobId);
        setMobileJobId(jobId);
        window.history.pushState({ techJob: jobId }, "");
    }, []);

    const closeMobileJob = useCallback(() => {
        if (window.history.state?.techJob) {
            window.history.back(); // triggers popstate → clears mobileJobId
        } else {
            setMobileJobId(null);
        }
    }, []);

    const activeJob = useMemo(() => {
        if (!assignedJobs.length) return null;
        return assignedJobs.find((job) => job.id === selectedJobId) ?? assignedJobs[0];
    }, [assignedJobs, selectedJobId]);

    const nextJob = useMemo(() => {
        return (
            assignedJobs.find((job) => job.status === "ON_SITE") ??
            assignedJobs.find((job) => job.status === "EN_ROUTE") ??
            assignedJobs.find((job) => job.status === "ASSIGNED") ??
            // Prefer any still-open job over a completed one for the "Up next" hero.
            assignedJobs.find((job) => job.status !== "COMPLETED" && job.status !== "CANCELED") ??
            assignedJobs[0] ??
            null
        );
    }, [assignedJobs]);

    const mobileJob = useMemo(
        () => (mobileJobId ? assignedJobs.find((job) => job.id === mobileJobId) ?? null : null),
        [assignedJobs, mobileJobId]
    );

    if (assignedJobsQuery.isLoading) {
        return <div className="rounded-2xl border border-border bg-card p-6">Loading field workflow...</div>;
    }

    // Only hard-fail when there's nothing cached to show. A failed background poll
    // with jobs already in the cache must not blank the screen — we keep the saved
    // list and surface a quiet "couldn't refresh" line instead (see below).
    if (assignedJobsQuery.isError && assignedJobs.length === 0) {
        return (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
                We couldn&apos;t load the assigned jobs for this technician.
            </div>
        );
    }

    if (!assignedJobs.length) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Field console</h2>
                    <p className="text-muted-foreground">
                        No active assignments right now. New jobs will show up here automatically.
                    </p>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                        <div>
                            <h3 className="font-semibold">You&apos;re clear for now</h3>
                            <p className="text-sm text-muted-foreground">
                                Dispatch hasn&apos;t assigned any open jobs to {firstNameOf(user)} yet.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!activeJob || !nextJob) {
        return null;
    }

    const techName = firstNameOf(user);

    // Detail-view props shared by mobile full-screen and desktop pane.
    const detailFor = (job: TechnicianJob) => {
        const checklistCompleted = job.checklist.filter((item) => item.isCompleted).length;
        const checklistRequired = job.checklist.length;
        const canComplete = jobCanComplete(job);
        const nextStatus = JOB_STATUS_FLOW[job.status] ?? null;
        // Directions (not a search) to the property's coordinates when geocoded —
        // rural plots/farms don't resolve from the address text alone.
        const mapsHref = googleMapsLink({
            lat: job.property.geoLat,
            lng: job.property.geoLng,
            address: getAddress(job),
        });
        return { checklistCompleted, checklistRequired, canComplete, nextStatus, mapsHref };
    };

    const activeDetail = detailFor(activeJob);
    const activeMapsHref = activeDetail.mapsHref;
    const activePhoneHref = activeJob.customer.phone ? `tel:${activeJob.customer.phone}` : null;

    // A poll failed but we still have cached jobs — show them, with a quiet note.
    const staleRefresh = assignedJobsQuery.isError && assignedJobs.length > 0;
    const staleBanner = staleRefresh ? (
        <p className="px-1 text-xs text-muted-foreground">Couldn&apos;t refresh — showing saved jobs</p>
    ) : null;

    return (
        <>
            {/* ---- Mobile / tablet: two-screen flow ---- */}
            <div className="md:hidden">
                {mobileJob ? (
                    <JobDetail
                        job={mobileJob}
                        {...detailFor(mobileJob)}
                        priceBookItems={priceBookItems}
                        fieldQuotingEnabled={fieldQuotingEnabled}
                        lineItems={lineItems}
                        quote={quote}
                        expenses={expenses}
                        notes={notes}
                        photos={photos}
                        signature={signature}
                        summaryMutation={summaryMutation}
                        fieldInvoice={fieldInvoice}
                        statusMutation={statusMutation}
                        checklistMutation={checklistMutation}
                        quoteSending={quote.quoteMutation.isPending}
                        mobile
                        onBack={closeMobileJob}
                    />
                ) : (
                    <PullToRefresh onRefresh={() => assignedJobsQuery.refetch()}>
                        {staleBanner}
                        <TechnicianHome
                            name={techName}
                            jobs={assignedJobs}
                            nextJob={nextJob}
                            onOpenJob={openMobileJob}
                            statusMutation={statusMutation}
                            canCompleteNext={jobCanComplete(nextJob)}
                        />
                    </PullToRefresh>
                )}
            </div>

            {/* ---- Desktop: two-pane layout ---- */}
            <div className="hidden space-y-6 pb-20 md:block">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-2xl font-bold tracking-tight">Field console</h2>
                    <span className="text-sm text-muted-foreground">{displayName(user, user.email)}</span>
                </div>

                {staleBanner}

                <OverviewCards
                    nextJob={nextJob}
                    openJobsCount={assignedJobs.length}
                    checklistCompleted={activeDetail.checklistCompleted}
                    checklistRequired={activeDetail.checklistRequired}
                    signoffCaptured={activeJob.signatures.length > 0}
                    mapsHref={activeMapsHref}
                    customerPhoneHref={activePhoneHref}
                    onOpenJob={setSelectedJobId}
                />

                <div className="grid gap-6 xl:grid-cols-[340px,1fr]">
                    <JobList jobs={assignedJobs} activeJobId={activeJob.id} onSelectJob={setSelectedJobId} />

                    <JobDetail
                        job={activeJob}
                        {...activeDetail}
                        priceBookItems={priceBookItems}
                        fieldQuotingEnabled={fieldQuotingEnabled}
                        lineItems={lineItems}
                        quote={quote}
                        expenses={expenses}
                        notes={notes}
                        photos={photos}
                        signature={signature}
                        summaryMutation={summaryMutation}
                        fieldInvoice={fieldInvoice}
                        statusMutation={statusMutation}
                        checklistMutation={checklistMutation}
                        quoteSending={quote.quoteMutation.isPending}
                    />
                </div>
            </div>
        </>
    );
}
