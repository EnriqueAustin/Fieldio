"use client";

import { useState } from "react";
import { format } from "date-fns";
import { History, ChevronDown, ChevronRight, Camera, StickyNote, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { useSiteHistory } from "./use-site-history";
import type { TechnicianJob } from "./types";

interface SiteHistoryCardProps {
    job: TechnicianJob;
}

/** Collapsible prior-visit history for the job's customer. Lazy-loads on expand
 *  (nothing fetched until the tech opens it). No pricing is ever shown — the API
 *  omits amounts from the technician payload. */
export function SiteHistoryCard({ job }: SiteHistoryCardProps) {
    const [open, setOpen] = useState(false);
    const query = useSiteHistory(job.id, open);
    const visits = query.data ?? [];

    return (
        <Card>
            <Collapsible open={open} onOpenChange={setOpen}>
                <CardHeader>
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
                        <CardTitle className="flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Site history
                        </CardTitle>
                        {open ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                    </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="space-y-3">
                        {query.isLoading ? (
                            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                Loading prior visits...
                            </div>
                        ) : query.isError ? (
                            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                Couldn&apos;t load site history. It will retry when you&apos;re back online.
                            </div>
                        ) : visits.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                First visit to this customer.
                            </div>
                        ) : (
                            visits.map((visit) => (
                                <div key={visit.id} className="rounded-xl border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">{visit.title}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(visit.date), "MMM d, yyyy")}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        {visit.technicianName && <span>{visit.technicianName}</span>}
                                        {!visit.isSameProperty && (
                                            <Badge variant="outline" className="text-[10px]">
                                                Different site
                                            </Badge>
                                        )}
                                    </div>
                                    {visit.description && (
                                        <p className="mt-2 text-sm text-slate-700">{visit.description}</p>
                                    )}
                                    {visit.noteExcerpt && (
                                        <p className="mt-2 line-clamp-2 text-sm italic text-slate-600">
                                            &ldquo;{visit.noteExcerpt}&rdquo;
                                        </p>
                                    )}
                                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                        {visit.photoCount > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Camera className="h-3.5 w-3.5" />
                                                {visit.photoCount}
                                            </span>
                                        )}
                                        {visit.noteCount > 0 && (
                                            <span className="flex items-center gap-1">
                                                <StickyNote className="h-3.5 w-3.5" />
                                                {visit.noteCount}
                                            </span>
                                        )}
                                        {visit.warrantyClaims.length > 0 && (
                                            <span className="flex items-center gap-1 text-amber-600">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                {visit.warrantyClaims.length} warranty
                                                {visit.warrantyClaims.length > 1 ? " claims" : " claim"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
