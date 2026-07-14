"use client";

import { Calendar, MapPin, Navigation, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { getAddress, getJobTiming, type TechnicianJob } from "./types";

interface OverviewCardsProps {
    nextJob: TechnicianJob;
    openJobsCount: number;
    checklistCompleted: number;
    checklistRequired: number;
    signoffCaptured: boolean;
    mapsHref: string;
    customerPhoneHref: string | null;
    onOpenJob: (jobId: string) => void;
}

export function OverviewCards({
    nextJob,
    openJobsCount,
    checklistCompleted,
    checklistRequired,
    signoffCaptured,
    mapsHref,
    customerPhoneHref,
    onOpenJob,
}: OverviewCardsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm uppercase tracking-wide text-blue-600">
                        Up next
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <div className="text-lg font-semibold">{nextJob.title}</div>
                        <div className="text-sm text-muted-foreground">{nextJob.customer.name}</div>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Calendar className="mt-0.5 h-4 w-4" />
                        <span>{getJobTiming(nextJob)}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4" />
                        <span>{getAddress(nextJob)}</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <Button className="flex-1" onClick={() => onOpenJob(nextJob.id)}>
                            Open job
                        </Button>
                        <Button asChild variant="outline" className="flex-1">
                            <a href={mapsHref} target="_blank" rel="noreferrer">
                                Navigate
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm uppercase tracking-wide text-slate-500">
                        Progress
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Open jobs</span>
                        <span className="text-2xl font-semibold">{openJobsCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Checklist done</span>
                        <span className="font-medium">
                            {checklistCompleted}/{checklistRequired || 0}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Customer signoff</span>
                        <span className="font-medium">
                            {signoffCaptured ? "Captured" : "Pending"}
                        </span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm uppercase tracking-wide text-slate-500">
                        Quick actions
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                    <Button asChild variant="outline" className="h-20 flex-col gap-2">
                        <a href={mapsHref} target="_blank" rel="noreferrer">
                            <Navigation className="h-5 w-5" />
                            Navigate
                        </a>
                    </Button>
                    <Button
                        asChild={Boolean(customerPhoneHref)}
                        variant="outline"
                        className="h-20 flex-col gap-2"
                        disabled={!customerPhoneHref}
                    >
                        {customerPhoneHref ? (
                            <a href={customerPhoneHref}>
                                <Phone className="h-5 w-5" />
                                Call customer
                            </a>
                        ) : (
                            <span>
                                <Phone className="h-5 w-5" />
                                No phone
                            </span>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
