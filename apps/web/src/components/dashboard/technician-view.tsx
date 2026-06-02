"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
    Calendar,
    Camera,
    CheckCircle2,
    Circle,
    Clock,
    MapPin,
    Navigation,
    Package,
    PenTool,
    Phone,
    Plus,
    Route,
    Search,
    StickyNote,
    Trash2,
    Upload,
    Wrench,
} from "lucide-react";
import api from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { toast } from "../ui/use-toast";

interface TechnicianViewProps {
    user: {
        id: string;
        email: string;
        role: string;
        companyId: string;
        companyName: string;
    };
    stats: unknown;
}

interface JobChecklistItem {
    id: string;
    label: string;
    isCompleted: boolean;
    completedAt?: string | null;
}

interface JobPhoto {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    createdAt: string;
}

interface JobNote {
    id: string;
    jobId: string;
    message: string;
    createdAt: string;
    author?: {
        id: string;
        email: string;
        avatarUrl?: string | null;
    } | null;
}

interface JobSignature {
    id: string;
    signerName: string;
    signatureDataUrl: string;
    signedAt: string;
}

interface JobLineItem {
    id: string;
    name: string;
    description?: string | null;
    quantity: number;
    unitPrice: string;
    total: string;
    type: "SERVICE" | "MATERIAL" | "LABOR";
}

interface PriceBookItem {
    id: string;
    name: string;
    description?: string | null;
    unitPrice: string;
    type: "SERVICE" | "MATERIAL" | "LABOR";
    category?: string | null;
    sku?: string | null;
}

interface TechnicianJob {
    id: string;
    status: "REQUESTED" | "ASSIGNED" | "EN_ROUTE" | "ON_SITE" | "COMPLETED" | "CANCELED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
    title: string;
    description?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
    customer: {
        id: string;
        name: string;
        phone?: string | null;
        email?: string | null;
    };
    property: {
        addressLine1: string;
        addressLine2?: string | null;
        city: string;
        state: string;
        zip: string;
    };
    checklist: JobChecklistItem[];
    lineItems: JobLineItem[];
    photos: JobPhoto[];
    signatures: JobSignature[];
    notes: JobNote[];
}

const STATUS_LABELS: Record<TechnicianJob["status"], string> = {
    REQUESTED: "Requested",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
};

const STATUS_STYLES: Record<TechnicianJob["status"], string> = {
    REQUESTED: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-100 text-blue-700",
    EN_ROUTE: "bg-violet-100 text-violet-700",
    ON_SITE: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELED: "bg-rose-100 text-rose-700",
};

const JOB_STATUS_FLOW: Record<string, TechnicianJob["status"] | null> = {
    ASSIGNED: "EN_ROUTE",
    EN_ROUTE: "ON_SITE",
    ON_SITE: "COMPLETED",
};

function getAddress(job: TechnicianJob) {
    return [
        job.property.addressLine1,
        job.property.addressLine2,
        `${job.property.city}, ${job.property.state} ${job.property.zip}`,
    ]
        .filter(Boolean)
        .join(", ");
}

function getJobTiming(job: TechnicianJob) {
    if (job.status === "ON_SITE" && job.actualStart) {
        return `On site for ${formatDistanceToNowStrict(new Date(job.actualStart))}`;
    }
    if (job.scheduledStart && job.scheduledEnd) {
        return `${format(new Date(job.scheduledStart), "p")} - ${format(new Date(job.scheduledEnd), "p")}`;
    }
    if (job.scheduledStart) {
        return format(new Date(job.scheduledStart), "p");
    }
    return "Schedule pending";
}

function SignaturePad({
    disabled,
    onChange,
}: {
    disabled?: boolean;
    onChange: (value: string | null) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const hasStrokeRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        context.lineWidth = 2;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#0f172a";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    };

    const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const point = pointFromEvent(event);
        isDrawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        context.beginPath();
        context.moveTo(point.x, point.y);
    };

    const drawStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled || !isDrawingRef.current) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const point = pointFromEvent(event);
        context.lineTo(point.x, point.y);
        context.stroke();
        hasStrokeRef.current = true;
    };

    const endStroke = () => {
        if (disabled) return;
        isDrawingRef.current = false;
        const canvas = canvasRef.current;
        if (!canvas) return;
        onChange(hasStrokeRef.current ? canvas.toDataURL("image/png") : null);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        hasStrokeRef.current = false;
        onChange(null);
    };

    return (
        <div className="space-y-3">
            <canvas
                ref={canvasRef}
                width={800}
                height={240}
                className="h-40 w-full rounded-xl border border-dashed border-slate-300 bg-white touch-none"
                onPointerDown={beginStroke}
                onPointerMove={drawStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
            />
            <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={clear} disabled={disabled}>
                    Clear signature
                </Button>
            </div>
        </div>
    );
}

export function TechnicianView({ user }: TechnicianViewProps) {
    const queryClient = useQueryClient();
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [photoCaption, setPhotoCaption] = useState("");
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [signerName, setSignerName] = useState("");
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
    const [pbSearch, setPbSearch] = useState("");
    const [newItem, setNewItem] = useState({ name: "", quantity: 1, unitPrice: "", type: "SERVICE" as string, priceBookItemId: "" });

    useEffect(() => {
        api.get("/price-book").then((res) => setPriceBookItems(res.data?.data?.items ?? [])).catch(() => {});
    }, []);

    const filteredPB = priceBookItems.filter(
        (item) => pbSearch && (
            item.name.toLowerCase().includes(pbSearch.toLowerCase()) ||
            (item.sku && item.sku.toLowerCase().includes(pbSearch.toLowerCase()))
        )
    );

    const lineItemMutation = useMutation({
        mutationFn: async ({ jobId, ...data }: { jobId: string; name: string; quantity: number; unitPrice: number; type: string; priceBookItemId?: string }) => {
            await api.post(`/jobs/${jobId}/line-items`, data);
        },
        onSuccess: async () => {
            setNewItem({ name: "", quantity: 1, unitPrice: "", type: "SERVICE", priceBookItemId: "" });
            setPbSearch("");
            await invalidateJobs();
        },
        onError: () => {
            toast({ title: "Could not add line item", variant: "destructive" });
        },
    });

    const removeLineItemMutation = useMutation({
        mutationFn: async ({ jobId, itemId }: { jobId: string; itemId: string }) => {
            await api.delete(`/jobs/${jobId}/line-items/${itemId}`);
        },
        onSuccess: async () => { await invalidateJobs(); },
    });

    const selectPBItem = (item: PriceBookItem) => {
        setNewItem({ name: item.name, quantity: 1, unitPrice: String(Number(item.unitPrice)), type: item.type, priceBookItemId: item.id });
        setPbSearch("");
    };

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
        setNoteDraft("");
        setPhotoCaption("");
        setPhotoFile(null);
        setSignerName("");
        setSignatureDataUrl(null);
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

    const invalidateJobs = async () => {
        await queryClient.invalidateQueries({ queryKey: ["technician-assigned-jobs", user.id] });
    };

    const statusMutation = useMutation({
        mutationFn: async ({ jobId, status }: { jobId: string; status: TechnicianJob["status"] }) => {
            await api.patch(`/jobs/${jobId}/status`, { status });
        },
        onSuccess: async () => {
            await invalidateJobs();
        },
        onError: (error: any) => {
            toast({
                title: "Could not update job",
                description: error?.response?.data?.message ?? "Please try again.",
                variant: "destructive",
            });
        },
    });

    const checklistMutation = useMutation({
        mutationFn: async ({
            jobId,
            checkId,
            isCompleted,
        }: {
            jobId: string;
            checkId: string;
            isCompleted: boolean;
        }) => {
            await api.patch(`/jobs/${jobId}/checklist/${checkId}`, { isCompleted });
        },
        onSuccess: async () => {
            await invalidateJobs();
        },
        onError: () => {
            toast({
                title: "Checklist update failed",
                description: "Please try that again.",
                variant: "destructive",
            });
        },
    });

    const noteMutation = useMutation({
        mutationFn: async ({ jobId, message }: { jobId: string; message: string }) => {
            await api.post(`/jobs/${jobId}/notes`, { message });
        },
        onSuccess: async () => {
            setNoteDraft("");
            await invalidateJobs();
        },
        onError: () => {
            toast({
                title: "Note not saved",
                description: "Your note could not be added.",
                variant: "destructive",
            });
        },
    });

    const photoMutation = useMutation({
        mutationFn: async ({ jobId, file, caption }: { jobId: string; file: File; caption: string }) => {
            const formData = new FormData();
            formData.append("photo", file);
            if (caption.trim()) {
                formData.append("caption", caption.trim());
            }
            await api.post(`/media/jobs/${jobId}/photos`, formData);
        },
        onSuccess: async () => {
            setPhotoFile(null);
            setPhotoCaption("");
            const fileInput = document.getElementById("technician-photo-upload") as HTMLInputElement | null;
            if (fileInput) fileInput.value = "";
            await invalidateJobs();
        },
        onError: (error: any) => {
            toast({
                title: "Photo upload failed",
                description: error?.response?.data?.message ?? "Please try a different image.",
                variant: "destructive",
            });
        },
    });

    const signatureMutation = useMutation({
        mutationFn: async ({
            jobId,
            signerName: nextSignerName,
            signature,
        }: {
            jobId: string;
            signerName: string;
            signature: string;
        }) => {
            await api.post(`/jobs/${jobId}/signatures`, {
                signerName: nextSignerName,
                signatureDataUrl: signature,
            });
        },
        onSuccess: async () => {
            setSignerName("");
            setSignatureDataUrl(null);
            await invalidateJobs();
        },
        onError: () => {
            toast({
                title: "Signature not captured",
                description: "Please try signing again.",
                variant: "destructive",
            });
        },
    });

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
                            <Button className="flex-1" onClick={() => setSelectedJobId(nextJob.id)}>
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
                            <span className="text-2xl font-semibold">{assignedJobs.length}</span>
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
                                {activeJob.signatures.length > 0 ? "Captured" : "Pending"}
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

            <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle>Assigned today</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {assignedJobs.map((job) => (
                            <button
                                key={job.id}
                                type="button"
                                onClick={() => setSelectedJobId(job.id)}
                                className={`w-full rounded-xl border p-4 text-left transition ${
                                    job.id === activeJob.id
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-border bg-background hover:bg-slate-50"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold">{job.title}</div>
                                        <div
                                            className={`text-sm ${
                                                job.id === activeJob.id ? "text-slate-200" : "text-muted-foreground"
                                            }`}
                                        >
                                            {job.customer.name}
                                        </div>
                                    </div>
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                            job.id === activeJob.id ? "bg-white/15 text-white" : STATUS_STYLES[job.status]
                                        }`}
                                    >
                                        {STATUS_LABELS[job.status]}
                                    </span>
                                </div>
                                <div
                                    className={`mt-3 text-sm ${
                                        job.id === activeJob.id ? "text-slate-200" : "text-muted-foreground"
                                    }`}
                                >
                                    {getJobTiming(job)}
                                </div>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle>{activeJob.title}</CardTitle>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[activeJob.status]}`}>
                                        {STATUS_LABELS[activeJob.status]}
                                    </span>
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <div>{activeJob.customer.name}</div>
                                    <div>{getAddress(activeJob)}</div>
                                    <div>{getJobTiming(activeJob)}</div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {nextStatus && activeJob.status !== "ON_SITE" && (
                                    <Button
                                        onClick={() => statusMutation.mutate({ jobId: activeJob.id, status: nextStatus })}
                                        disabled={statusMutation.isPending}
                                    >
                                        {activeJob.status === "ASSIGNED" ? "Start route" : "Arrive on site"}
                                    </Button>
                                )}
                                {activeJob.status === "ON_SITE" && (
                                    <Button
                                        onClick={() =>
                                            statusMutation.mutate({ jobId: activeJob.id, status: "COMPLETED" })
                                        }
                                        disabled={!canComplete || statusMutation.isPending}
                                    >
                                        Complete job
                                    </Button>
                                )}
                                <Button asChild variant="outline">
                                    <a href={mapsHref} target="_blank" rel="noreferrer">
                                        <Route className="mr-2 h-4 w-4" />
                                        Open route
                                    </a>
                                </Button>
                            </div>
                        </CardHeader>
                        {!canComplete && activeJob.status === "ON_SITE" && (
                            <CardContent className="pt-0">
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    Complete every checklist item and capture a customer signature before closing this job.
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    <Tabs defaultValue="checklist">
                        <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="checklist">Checklist</TabsTrigger>
                            <TabsTrigger value="items">Items</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                            <TabsTrigger value="photos">Photos</TabsTrigger>
                            <TabsTrigger value="closeout">Closeout</TabsTrigger>
                        </TabsList>

                        <TabsContent value="checklist">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Service checklist</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {activeJob.description && (
                                        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                                            {activeJob.description}
                                        </div>
                                    )}
                                    {activeJob.checklist.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                            No checklist items were created for this job yet.
                                        </div>
                                    ) : (
                                        activeJob.checklist.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() =>
                                                    checklistMutation.mutate({
                                                        jobId: activeJob.id,
                                                        checkId: item.id,
                                                        isCompleted: !item.isCompleted,
                                                    })
                                                }
                                                className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition hover:bg-slate-50"
                                            >
                                                {item.isCompleted ? (
                                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                                ) : (
                                                    <Circle className="h-5 w-5 text-slate-400" />
                                                )}
                                                <div className="flex-1">
                                                    <div
                                                        className={`font-medium ${
                                                            item.isCompleted ? "text-slate-500 line-through" : "text-slate-900"
                                                        }`}
                                                    >
                                                        {item.label}
                                                    </div>
                                                    {item.completedAt && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Completed {format(new Date(item.completedAt), "p")}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="items">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Line Items</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Price book search */}
                                    <div className="rounded-xl border p-4 space-y-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <input
                                                placeholder="Search price book (parts, services)…"
                                                value={pbSearch}
                                                onChange={(e) => setPbSearch(e.target.value)}
                                                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        </div>
                                        {filteredPB.length > 0 && (
                                            <div className="max-h-32 overflow-y-auto rounded-lg border divide-y">
                                                {filteredPB.slice(0, 6).map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => selectPBItem(item)}
                                                        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-slate-50 text-sm"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {item.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400" /> : <Wrench className="h-4 w-4 text-slate-400" />}
                                                            <span className="font-medium">{item.name}</span>
                                                        </div>
                                                        <span className="text-xs font-medium text-emerald-700">R{Number(item.unitPrice).toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-[1fr,80px,100px,auto] gap-2 items-end">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium">Item</label>
                                                <input
                                                    placeholder="Name"
                                                    value={newItem.name}
                                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium">Qty</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={newItem.quantity}
                                                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                                                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium">Price (R)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={newItem.unitPrice}
                                                    onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                                                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => newItem.name && newItem.unitPrice && lineItemMutation.mutate({
                                                    jobId: activeJob.id,
                                                    name: newItem.name,
                                                    quantity: newItem.quantity,
                                                    unitPrice: parseFloat(newItem.unitPrice),
                                                    type: newItem.type,
                                                    priceBookItemId: newItem.priceBookItemId || undefined,
                                                })}
                                                disabled={!newItem.name || !newItem.unitPrice || lineItemMutation.isPending}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Current line items */}
                                    {(!activeJob.lineItems || activeJob.lineItems.length === 0) ? (
                                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                                            No items added yet. Search the price book or add manually above.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {activeJob.lineItems.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between rounded-xl border p-3 group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {item.type === "MATERIAL" ? <Package className="h-4 w-4 text-slate-400 shrink-0" /> : <Wrench className="h-4 w-4 text-slate-400 shrink-0" />}
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-sm truncate">{item.name}</div>
                                                            <div className="text-xs text-muted-foreground">{item.quantity} × R{Number(item.unitPrice).toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">R{Number(item.total).toFixed(2)}</span>
                                                        <button
                                                            onClick={() => removeLineItemMutation.mutate({ jobId: activeJob.id, itemId: item.id })}
                                                            className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-600 transition"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex justify-between pt-3 border-t mt-2">
                                                <span className="text-sm font-semibold">Subtotal</span>
                                                <span className="font-semibold">R{activeJob.lineItems.reduce((s, i) => s + Number(i.total), 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="notes">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Internal notes</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-3 rounded-xl border p-4">
                                        <Textarea
                                            placeholder="Add arrival notes, access details, customer updates, or blockers..."
                                            value={noteDraft}
                                            onChange={(event) => setNoteDraft(event.target.value)}
                                        />
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={() =>
                                                    noteMutation.mutate({
                                                        jobId: activeJob.id,
                                                        message: noteDraft.trim(),
                                                    })
                                                }
                                                disabled={!noteDraft.trim() || noteMutation.isPending}
                                            >
                                                <StickyNote className="mr-2 h-4 w-4" />
                                                Save note
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {activeJob.notes.length === 0 ? (
                                            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                                No notes yet for this job.
                                            </div>
                                        ) : (
                                            activeJob.notes.map((note) => (
                                                <div key={note.id} className="rounded-xl border p-4">
                                                    <div className="flex items-start gap-3">
                                                        <Avatar className="h-9 w-9">
                                                            <AvatarFallback>
                                                                {note.author?.email?.[0]?.toUpperCase() ?? "?"}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-medium">
                                                                    {note.author?.email?.split("@")[0] ?? "Team"}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {format(new Date(note.createdAt), "MMM d, p")}
                                                                </span>
                                                            </div>
                                                            <p className="mt-2 text-sm text-slate-700">{note.message}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="photos">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Job photos</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr,220px,auto] md:items-end">
                                        <div className="space-y-2">
                                            <label htmlFor="technician-photo-upload" className="text-sm font-medium">
                                                Upload photo
                                            </label>
                                            <Input
                                                id="technician-photo-upload"
                                                type="file"
                                                accept="image/*"
                                                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label htmlFor="photo-caption" className="text-sm font-medium">
                                                Caption
                                            </label>
                                            <Input
                                                id="photo-caption"
                                                value={photoCaption}
                                                onChange={(event) => setPhotoCaption(event.target.value)}
                                                placeholder="Before, after, damage, completed work..."
                                            />
                                        </div>
                                        <Button
                                            onClick={() =>
                                                photoFile &&
                                                photoMutation.mutate({
                                                    jobId: activeJob.id,
                                                    file: photoFile,
                                                    caption: photoCaption,
                                                })
                                            }
                                            disabled={!photoFile || photoMutation.isPending}
                                        >
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload
                                        </Button>
                                    </div>

                                    {activeJob.photos.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                            No photos uploaded yet for this job.
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {activeJob.photos.map((photo) => (
                                                <div key={photo.id} className="overflow-hidden rounded-xl border">
                                                    <img
                                                        src={photo.thumbnailUrl || photo.url}
                                                        alt={photo.caption || "Job photo"}
                                                        className="h-48 w-full object-cover"
                                                    />
                                                    <div className="space-y-2 p-4">
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <Camera className="h-3.5 w-3.5" />
                                                            {format(new Date(photo.createdAt), "MMM d, p")}
                                                        </div>
                                                        {photo.caption && (
                                                            <p className="text-sm text-slate-700">{photo.caption}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="closeout">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Completion and handoff</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-3">
                                        <div className="rounded-xl border p-4">
                                            <div className="flex items-center gap-2 font-medium">
                                                <Clock className="h-4 w-4" />
                                                Labor timer
                                            </div>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {activeJob.actualStart
                                                    ? `Started ${format(new Date(activeJob.actualStart), "MMM d, p")}`
                                                    : "Timer begins automatically when the technician starts travel or arrives on site."}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border p-4">
                                            <div className="flex items-center gap-2 font-medium">
                                                <CheckCircle2 className="h-4 w-4" />
                                                Checklist
                                            </div>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {checklistCompleted} of {checklistRequired} service steps complete.
                                            </p>
                                        </div>
                                        <div className="rounded-xl border p-4">
                                            <div className="flex items-center gap-2 font-medium">
                                                <PenTool className="h-4 w-4" />
                                                Signature
                                            </div>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {activeJob.signatures.length > 0
                                                    ? `Latest signoff by ${activeJob.signatures[0].signerName}`
                                                    : "Customer signoff still required."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 rounded-2xl border p-5">
                                        <div className="space-y-2">
                                            <label htmlFor="signer-name" className="text-sm font-medium">
                                                Customer name
                                            </label>
                                            <Input
                                                id="signer-name"
                                                value={signerName}
                                                onChange={(event) => setSignerName(event.target.value)}
                                                placeholder="Name of person approving the completed work"
                                            />
                                        </div>
                                        <SignaturePad onChange={setSignatureDataUrl} disabled={signatureMutation.isPending} />
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={() =>
                                                    signatureDataUrl &&
                                                    signatureMutation.mutate({
                                                        jobId: activeJob.id,
                                                        signerName: signerName.trim(),
                                                        signature: signatureDataUrl,
                                                    })
                                                }
                                                disabled={!signerName.trim() || !signatureDataUrl || signatureMutation.isPending}
                                            >
                                                Save signature
                                            </Button>
                                        </div>
                                    </div>

                                    {activeJob.signatures.length > 0 && (
                                        <div className="space-y-3">
                                            {activeJob.signatures.map((signature) => (
                                                <div key={signature.id} className="rounded-xl border p-4">
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="font-medium">{signature.signerName}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Signed {format(new Date(signature.signedAt), "MMM d, p")}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <img
                                                        src={signature.signatureDataUrl}
                                                        alt={`Signature from ${signature.signerName}`}
                                                        className="h-24 rounded-lg border bg-white p-2"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
