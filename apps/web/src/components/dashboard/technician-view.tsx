"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import api from "../../lib/api";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
    getAddress,
    JOB_STATUS_FLOW,
    type TechnicianJob,
    type TechnicianViewProps,
} from "./technician/types";
import { usePriceBook } from "./technician/use-price-book";
import { useFieldQuote } from "./technician/use-field-quote";
import { useLineItems } from "./technician/use-line-items";
import { useExpenses } from "./technician/use-expenses";
import { useJobNotes } from "./technician/use-notes";
import { useJobPhotos } from "./technician/use-photos";
import { useSignature } from "./technician/use-signature";
import { useJobSummary } from "./technician/use-job-summary";
import { useJobProgress } from "./technician/use-job-progress";
import { OverviewCards } from "./technician/overview-cards";
import { JobList } from "./technician/job-list";
import { ActiveJobHeader } from "./technician/active-job-header";
import { WorkTab } from "./technician/work-tab";
import { MediaTab } from "./technician/media-tab";
import { CloseoutTab } from "./technician/closeout-tab";

export function TechnicianView({ user }: TechnicianViewProps) {
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

    const priceBookItems = usePriceBook();
    const quote = useFieldQuote();
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
        refetchInterval: 30_000,
    });

    const assignedJobs = assignedJobsQuery.data ?? [];

    useEffect(() => {
        if (!selectedJobId && assignedJobs.length > 0) {
            setSelectedJobId(assignedJobs[0].id);
        }
        if (selectedJobId && !assignedJobs.some((job) => job.id === selectedJobId)) {
            setSelectedJobId(assignedJobs[0]?.id ?? null);
        }
    }, [assignedJobs, selectedJobId]);

    useEffect(() => {
        notes.reset();
        photos.reset();
        signature.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedJobId]);

    const activeJob = useMemo(() => {
        if (!assignedJobs.length) return null;
        return assignedJobs.find((job) => job.id === selectedJobId) ?? assignedJobs[0];
    }, [assignedJobs, selectedJobId]);

    const nextJob = useMemo(() => {
        return (
            assignedJobs.find((job) => job.status === "ON_SITE") ??
            assignedJobs.find((job) => job.status === "EN_ROUTE") ??
            assignedJobs.find((job) => job.status === "ASSIGNED") ??
            assignedJobs[0] ??
            null
        );
    }, [assignedJobs]);

    if (assignedJobsQuery.isLoading) {
        return <div className="rounded-2xl border border-border bg-card p-6">Loading field workflow...</div>;
    }

    if (assignedJobsQuery.isError) {
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
                                Dispatch hasn&apos;t assigned any open jobs to {user.email.split("@")[0]} yet.
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

    const checklistCompleted = activeJob.checklist.filter((item) => item.isCompleted).length;
    const checklistRequired = activeJob.checklist.length;
    const canComplete =
        activeJob.status === "ON_SITE" &&
        checklistCompleted === checklistRequired &&
        activeJob.signatures.length > 0;

    const nextStatus = JOB_STATUS_FLOW[activeJob.status];
    const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getAddress(activeJob))}`;
    const customerPhoneHref = activeJob.customer.phone ? `tel:${activeJob.customer.phone}` : null;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">
                    Field workflow for {user.email.split("@")[0]}
                </h2>
                <p className="text-muted-foreground">
                    Live assigned jobs, completion steps, and customer-ready handoff from one screen.
                </p>
            </div>

            <OverviewCards
                nextJob={nextJob}
                openJobsCount={assignedJobs.length}
                checklistCompleted={checklistCompleted}
                checklistRequired={checklistRequired}
                signoffCaptured={activeJob.signatures.length > 0}
                mapsHref={mapsHref}
                customerPhoneHref={customerPhoneHref}
                onOpenJob={setSelectedJobId}
            />

            <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
                <JobList jobs={assignedJobs} activeJobId={activeJob.id} onSelectJob={setSelectedJobId} />

                <div className="space-y-6">
                    <ActiveJobHeader
                        job={activeJob}
                        nextStatus={nextStatus}
                        canComplete={canComplete}
                        mapsHref={mapsHref}
                        onChangeStatus={(status) => statusMutation.mutate({ jobId: activeJob.id, status })}
                    />

                    <Tabs defaultValue="work">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="work">Work</TabsTrigger>
                            <TabsTrigger value="media">Media</TabsTrigger>
                            <TabsTrigger value="closeout">Done</TabsTrigger>
                        </TabsList>

                        <TabsContent value="work" className="space-y-4">
                            <WorkTab
                                job={activeJob}
                                priceBookItems={priceBookItems}
                                lineItems={lineItems}
                                quote={quote}
                                expenses={expenses}
                                onToggleChecklist={(checkId, isCompleted) =>
                                    checklistMutation.mutate({ jobId: activeJob.id, checkId, isCompleted })
                                }
                                onSendQuote={() => quote.sendQuote(activeJob.id)}
                                isSendingQuote={quote.quoteMutation.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="media" className="space-y-4">
                            <MediaTab
                                job={activeJob}
                                notes={notes}
                                photos={photos}
                                onSaveNote={() => notes.saveNote(activeJob.id)}
                                onUploadPhoto={() =>
                                    photos.photoFile && photos.queuePhotoUpload(activeJob.id, photos.photoFile, photos.photoCaption)
                                }
                            />
                        </TabsContent>

                        <TabsContent value="closeout">
                            <CloseoutTab
                                job={activeJob}
                                checklistCompleted={checklistCompleted}
                                checklistRequired={checklistRequired}
                                signerName={signature.signerName}
                                setSignerName={signature.setSignerName}
                                signatureDataUrl={signature.signatureDataUrl}
                                setSignatureDataUrl={signature.setSignatureDataUrl}
                                onSaveSignature={() => signature.saveSignature(activeJob.id)}
                                isSaving={signature.signatureMutation.isPending}
                                onSendSummary={() => summaryMutation.mutate({ jobId: activeJob.id })}
                                isSendingSummary={summaryMutation.isPending}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
