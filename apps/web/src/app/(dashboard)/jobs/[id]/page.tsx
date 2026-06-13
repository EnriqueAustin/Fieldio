"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    MapPin,
    CheckCircle2,
    Circle,
    DollarSign,
    FileText,
    Plus,
    Receipt,
    Calendar,
    User,
    Phone,
    Mail,
    ChevronRight,
    Link as LinkIcon,
    Copy,
    Check,
    Upload,
    ImageIcon,
    Trash2,
    ArrowLeft,
    Navigation,
    Package,
    Wrench,
    Clock,
    Search,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { StatusPill } from "@/components/ui/status-pill";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface LineItem {
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

interface VanMember {
    id: string;
    role: string;
    user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
}

interface CostSummary {
    materialsCost: number;
    laborRevenue: number;
    serviceRevenue: number;
    totalRevenue: number;
    totalExpenses: number;
    margin: number;
}

interface Job {
    id: string;
    title: string;
    status: string;
    description: string;
    scheduledStart: string;
    scheduledEnd: string;
    customer: { name: string; phone: string; email: string };
    property: { addressLine1: string; city: string; state: string; zip: string; latitude?: number | null; longitude?: number | null };
    checklist: { id: string; label: string; isCompleted: boolean }[];
    lineItems: LineItem[];
    tech: { firstName?: string; lastName?: string; email: string } | null;
    van?: { id: string; name: string; registration?: string | null; members: VanMember[] } | null;
    invoice: { id: string; total: string; status: string; balance?: string } | null;
    costSummary?: CostSummary | null;
}

interface Expense {
    id: string;
    description: string;
    amount: string;
    date: string;
}

interface JobPhoto {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    createdAt: string;
}

const STATUS_STEPS = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "ON_SITE", "COMPLETED"] as const;

export default function JobDetailPage() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [newExpense, setNewExpense] = useState({ description: "", amount: "", category: "OTHER" });
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoCaption, setPhotoCaption] = useState("");
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [payLink, setPayLink] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isSendingInvoice, setIsSendingInvoice] = useState(false);
    const [isLineItemDialogOpen, setIsLineItemDialogOpen] = useState(false);
    const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
    const [priceBookSearch, setPriceBookSearch] = useState("");
    const [newLineItem, setNewLineItem] = useState({
        name: "",
        description: "",
        quantity: 1,
        unitPrice: "",
        type: "SERVICE" as "SERVICE" | "MATERIAL" | "LABOR",
        priceBookItemId: "",
    });

    const fetchPriceBook = async () => {
        try {
            const res = await api.get("/price-book");
            setPriceBookItems(res.data.data.items ?? []);
        } catch (e) {
            console.error(e);
        }
    };

    const addLineItem = async () => {
        if (!job) return;
        await api.post(`/jobs/${job.id}/line-items`, {
            name: newLineItem.name,
            description: newLineItem.description || undefined,
            quantity: newLineItem.quantity,
            unitPrice: parseFloat(newLineItem.unitPrice),
            type: newLineItem.type,
            priceBookItemId: newLineItem.priceBookItemId || undefined,
        });
        setIsLineItemDialogOpen(false);
        setNewLineItem({ name: "", description: "", quantity: 1, unitPrice: "", type: "SERVICE", priceBookItemId: "" });
        setPriceBookSearch("");
        fetchJob();
    };

    const removeLineItem = async (itemId: string) => {
        if (!job || !confirm("Remove this line item?")) return;
        await api.delete(`/jobs/${job.id}/line-items/${itemId}`);
        fetchJob();
    };

    const selectPriceBookItem = (item: PriceBookItem) => {
        setNewLineItem({
            name: item.name,
            description: item.description || "",
            quantity: 1,
            unitPrice: String(Number(item.unitPrice)),
            type: item.type,
            priceBookItemId: item.id,
        });
        setPriceBookSearch("");
    };

    const filteredPriceBook = priceBookItems.filter(
        (item) =>
            item.name.toLowerCase().includes(priceBookSearch.toLowerCase()) ||
            (item.sku && item.sku.toLowerCase().includes(priceBookSearch.toLowerCase())) ||
            (item.category && item.category.toLowerCase().includes(priceBookSearch.toLowerCase()))
    );

    const lineItemTypeIcon = (type: string) => {
        switch (type) {
            case "MATERIAL": return <Package className="h-4 w-4" />;
            case "LABOR": return <Clock className="h-4 w-4" />;
            default: return <Wrench className="h-4 w-4" />;
        }
    };

    const jobQuery = useQuery<Job | null>({
        queryKey: ["job", id],
        queryFn: async () => {
            const res = await api.get(`/jobs/${id}`);
            return res.data.data.job as Job;
        },
        enabled: !!id,
    });
    const job = jobQuery.data ?? null;

    const expensesQuery = useQuery<Expense[]>({
        queryKey: ["job-expenses", id],
        queryFn: async () => {
            const res = await api.get(`/operations/jobs/${id}/expenses`);
            return (res.data.data.expenses ?? []) as Expense[];
        },
        enabled: !!id,
    });
    const expenses = expensesQuery.data ?? [];

    const photosQuery = useQuery<JobPhoto[]>({
        queryKey: ["job-photos", id],
        queryFn: async () => {
            const res = await api.get(`/media/jobs/${id}/photos`);
            return (res.data.data.photos ?? []) as JobPhoto[];
        },
        enabled: !!id,
    });
    const photos = photosQuery.data ?? [];

    const fetchJob = () => queryClient.invalidateQueries({ queryKey: ["job", id] });
    const fetchExpenses = () => queryClient.invalidateQueries({ queryKey: ["job-expenses", id] });
    const fetchPhotos = () => queryClient.invalidateQueries({ queryKey: ["job-photos", id] });

    useEffect(() => {
        if (id) {
            fetchPriceBook();
        }
    }, [id]);

    const updateStatus = async (status: string) => {
        if (!job) return;
        await api.patch(`/jobs/${job.id}/status`, { status });
        fetchJob();
    };

    const toggleChecklist = async (checkId: string, currentStatus: boolean) => {
        if (!job) return;
        await api.patch(`/jobs/${job.id}/checklist/${checkId}`, { isCompleted: !currentStatus });
        fetchJob();
    };

    const generateInvoice = async () => {
        if (!job) return;
        await api.post(`/finance/jobs/${job.id}/invoice`);
        fetchJob();
    };

    const fetchPayLink = async () => {
        if (!job?.invoice) return;
        try {
            const res = await api.get(`/payments/invoices/${job.invoice.id}/pay-link`);
            setPayLink(res.data.data.url);
        } catch (e: any) {
            setPhotoError(e?.response?.data?.message ?? "Could not fetch pay link.");
        }
    };

    const copyPayLink = async () => {
        if (!payLink) return;
        await navigator.clipboard.writeText(payLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
    };

    const sendInvoice = async () => {
        if (!job?.invoice) return;
        setIsSendingInvoice(true);
        try {
            await api.post(`/finance/invoices/${job.invoice.id}/send`);
            fetchJob();
        } finally {
            setIsSendingInvoice(false);
        }
    };

    const addExpense = async () => {
        if (!job) return;
        await api.post(`/operations/jobs/${job.id}/expenses`, {
            description: newExpense.description,
            amount: parseFloat(newExpense.amount),
            category: newExpense.category,
            date: new Date().toISOString(),
        });
        setIsExpenseDialogOpen(false);
        setNewExpense({ description: "", amount: "", category: "OTHER" });
        fetchExpenses();
    };

    const uploadPhoto = async () => {
        if (!job || !photoFile) return;
        setIsUploadingPhoto(true);
        setPhotoError(null);
        try {
            const fd = new FormData();
            fd.append("photo", photoFile);
            if (photoCaption.trim()) fd.append("caption", photoCaption.trim());
            await api.post(`/media/jobs/${job.id}/photos`, fd);
            setPhotoFile(null);
            setPhotoCaption("");
            const fileInput = document.getElementById("job-photo-upload") as HTMLInputElement | null;
            if (fileInput) fileInput.value = "";
            fetchPhotos();
        } catch (e: any) {
            setPhotoError(e?.response?.data?.message ?? "Could not upload photo.");
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const removePhoto = async (photoId: string) => {
        if (!confirm("Delete this photo?")) return;
        try {
            await api.delete(`/media/photos/${photoId}`);
            fetchPhotos();
        } catch {
            setPhotoError("Could not remove photo.");
        }
    };

    if (!job)
        return (
            <div className="space-y-4">
                <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="surface-card h-32 animate-pulse" />
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 surface-card h-96 animate-pulse" />
                    <div className="surface-card h-96 animate-pulse" />
                </div>
            </div>
        );

    const currentStepIndex = STATUS_STEPS.indexOf(job.status as any);

    return (
        <div className="space-y-6 pb-20">
            {/* Breadcrumb */}
            <Link
                href="/jobs"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to jobs
            </Link>

            {/* Header */}
            <div className="surface-card p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">#{job.id.substring(0, 8)}</span>
                            <ChevronRight className="h-3 w-3" />
                            <StatusPill status={job.status} />
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <User className="h-4 w-4" />
                                {job.customer.name}
                            </span>
                            {job.scheduledStart && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(job.scheduledStart), "MMM d, h:mm a")}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {job.status === "ASSIGNED" && (
                            <Button
                                className="bg-violet-600 hover:bg-violet-700 gap-2"
                                onClick={() => updateStatus("EN_ROUTE")}
                            >
                                Mark En Route
                            </Button>
                        )}
                        {job.status === "EN_ROUTE" && (
                            <Button
                                className="bg-amber-500 hover:bg-amber-600 gap-2"
                                onClick={() => updateStatus("ON_SITE")}
                            >
                                Arrive On Site
                            </Button>
                        )}
                        {job.status === "ON_SITE" && (() => {
                            const incomplete = job.checklist.filter((c) => !c.isCompleted).length;
                            const blocked = job.checklist.length > 0 && incomplete > 0;
                            return (
                                <div className="flex items-center gap-2">
                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                                        onClick={() => updateStatus("COMPLETED")}
                                        disabled={blocked}
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Complete Job
                                    </Button>
                                    {blocked && (
                                        <span className="text-xs text-amber-600 font-medium">
                                            {incomplete} checklist item{incomplete > 1 ? "s" : ""} remaining
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Stepper */}
                <div className="mt-6">
                    <div className="flex items-center justify-between">
                        {STATUS_STEPS.map((step, idx) => {
                            const done = idx <= currentStepIndex;
                            const active = idx === currentStepIndex;
                            return (
                                <div key={step} className="flex-1 flex flex-col items-center relative">
                                    {idx > 0 && (
                                        <div
                                            className={cn(
                                                "absolute right-1/2 top-3 h-0.5 w-full -z-0",
                                                done ? "bg-emerald-500" : "bg-slate-200"
                                            )}
                                        />
                                    )}
                                    <div
                                        className={cn(
                                            "h-6 w-6 rounded-full border-2 flex items-center justify-center text-[10px] font-medium z-10 bg-white",
                                            done
                                                ? "border-emerald-500 bg-emerald-500 text-white"
                                                : active
                                                ? "border-blue-500 text-blue-500"
                                                : "border-slate-300 text-slate-400"
                                        )}
                                    >
                                        {done && idx < currentStepIndex ? (
                                            <Check className="h-3 w-3" />
                                        ) : (
                                            idx + 1
                                        )}
                                    </div>
                                    <span
                                        className={cn(
                                            "mt-1.5 text-[10px] font-medium uppercase tracking-wider",
                                            done ? "text-foreground" : "text-muted-foreground"
                                        )}
                                    >
                                        {step.replace("_", " ")}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <Tabs defaultValue="overview">
                        <TabsList className="bg-slate-100/70">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="line-items">
                                Line Items
                                {job.lineItems?.length > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5">
                                        {job.lineItems.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="checklist">
                                Checklist
                                {job.checklist.length > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5">
                                        {job.checklist.filter((c) => c.isCompleted).length}/
                                        {job.checklist.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="finance">Finance</TabsTrigger>
                            <TabsTrigger value="expenses">Expenses</TabsTrigger>
                            <TabsTrigger value="photos">
                                Photos
                                {photos.length > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5">
                                        {photos.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="mt-4 space-y-4">
                            <div className="surface-card p-6">
                                <h3 className="font-semibold">Description</h3>
                                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                                    {job.description || "No description provided."}
                                </p>
                            </div>
                            <div className="surface-card p-6">
                                <div className="flex items-start gap-4">
                                    <div className="icon-tile bg-blue-50 text-blue-600">
                                        <MapPin className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold">Service Address</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {job.property.addressLine1}
                                            <br />
                                            {job.property.city}, {job.property.state} {job.property.zip}
                                        </p>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                                `${job.property.addressLine1}, ${job.property.city}, ${job.property.state} ${job.property.zip}`
                                            )}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                                        >
                                            <Navigation className="h-3 w-3" />
                                            Navigate in Google Maps
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="line-items" className="mt-4">
                            <div className="surface-card overflow-hidden">
                                <div className="flex items-center justify-between p-5 border-b border-border/60">
                                    <div>
                                        <h3 className="font-semibold">Line Items</h3>
                                        {job.lineItems?.length > 0 && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Total: R{job.lineItems.reduce((sum, i) => sum + Number(i.total), 0).toFixed(2)}
                                            </p>
                                        )}
                                    </div>
                                    <Dialog open={isLineItemDialogOpen} onOpenChange={(open) => { setIsLineItemDialogOpen(open); if (open) setPriceBookSearch(""); }}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="gap-2">
                                                <Plus className="h-4 w-4" /> Add item
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-lg">
                                            <DialogHeader>
                                                <DialogTitle>Add line item</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                                {/* Price Book Quick Select */}
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                        Quick select from Price Book
                                                    </Label>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            placeholder="Search parts, services, SKU…"
                                                            value={priceBookSearch}
                                                            onChange={(e) => setPriceBookSearch(e.target.value)}
                                                            className="pl-9"
                                                        />
                                                    </div>
                                                    {priceBookSearch && (
                                                        <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                                                            {filteredPriceBook.length === 0 ? (
                                                                <p className="p-3 text-xs text-muted-foreground text-center">No matching items</p>
                                                            ) : (
                                                                filteredPriceBook.slice(0, 8).map((item) => (
                                                                    <button
                                                                        key={item.id}
                                                                        onClick={() => selectPriceBookItem(item)}
                                                                        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-slate-50 transition text-sm"
                                                                    >
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            {lineItemTypeIcon(item.type)}
                                                                            <div className="min-w-0">
                                                                                <div className="font-medium truncate">{item.name}</div>
                                                                                {item.sku && <div className="text-[10px] text-muted-foreground">{item.sku}</div>}
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-xs font-medium text-emerald-700 shrink-0 ml-2">
                                                                            R{Number(item.unitPrice).toFixed(2)}
                                                                        </span>
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="h-px bg-border" />

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="col-span-2 space-y-2">
                                                        <Label>Name</Label>
                                                        <Input
                                                            placeholder="e.g. Kwikot 150L Geyser"
                                                            value={newLineItem.name}
                                                            onChange={(e) => setNewLineItem({ ...newLineItem, name: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Type</Label>
                                                        <select
                                                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                                            value={newLineItem.type}
                                                            onChange={(e) => setNewLineItem({ ...newLineItem, type: e.target.value as any })}
                                                        >
                                                            <option value="SERVICE">Service</option>
                                                            <option value="MATERIAL">Material</option>
                                                            <option value="LABOR">Labour</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Quantity</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={newLineItem.quantity}
                                                            onChange={(e) => setNewLineItem({ ...newLineItem, quantity: parseInt(e.target.value) || 1 })}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Unit Price (R)</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            value={newLineItem.unitPrice}
                                                            onChange={(e) => setNewLineItem({ ...newLineItem, unitPrice: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Line Total</Label>
                                                        <div className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm font-medium">
                                                            R{(newLineItem.quantity * (parseFloat(newLineItem.unitPrice) || 0)).toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 space-y-2">
                                                        <Label>Description (optional)</Label>
                                                        <Input
                                                            placeholder="Additional details…"
                                                            value={newLineItem.description}
                                                            onChange={(e) => setNewLineItem({ ...newLineItem, description: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    onClick={addLineItem}
                                                    disabled={!newLineItem.name || !newLineItem.unitPrice}
                                                >
                                                    Add line item
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="p-5">
                                    {(!job.lineItems || job.lineItems.length === 0) ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">
                                            No line items added yet. Add services, materials, or labour.
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            {job.lineItems.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 group"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="icon-tile h-9 w-9 bg-slate-100 text-slate-600">
                                                            {lineItemTypeIcon(item.type)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-sm truncate">{item.name}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {item.quantity} × R{Number(item.unitPrice).toFixed(2)} · {item.type.toLowerCase()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="font-medium text-sm">
                                                            R{Number(item.total).toFixed(2)}
                                                        </div>
                                                        <button
                                                            onClick={() => removeLineItem(item.id)}
                                                            className="opacity-0 group-hover:opacity-100 transition text-rose-500 hover:text-rose-600"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex justify-between p-3 pt-4 border-t border-border/60 mt-2">
                                                <span className="font-semibold text-sm">Subtotal</span>
                                                <span className="font-semibold">
                                                    R{job.lineItems.reduce((sum, i) => sum + Number(i.total), 0).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="checklist" className="mt-4">
                            <div className="surface-card p-6">
                                <h3 className="font-semibold mb-4">Tasks</h3>
                                {job.checklist.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No tasks added.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {job.checklist.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => toggleChecklist(item.id, item.isCompleted)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition",
                                                    item.isCompleted
                                                        ? "bg-emerald-50/50 hover:bg-emerald-50"
                                                        : "hover:bg-slate-50"
                                                )}
                                            >
                                                {item.isCompleted ? (
                                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <Circle className="h-5 w-5 text-slate-300 shrink-0" />
                                                )}
                                                <span
                                                    className={cn(
                                                        "text-sm",
                                                        item.isCompleted
                                                            ? "line-through text-muted-foreground"
                                                            : ""
                                                    )}
                                                >
                                                    {item.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="finance" className="mt-4">
                            {job.invoice ? (
                                <div className="surface-card overflow-hidden">
                                    <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm text-slate-300">Invoice total</p>
                                                <p className="text-3xl font-semibold mt-1">
                                                    R{Number(job.invoice.total).toFixed(2)}
                                                </p>
                                                {job.invoice.balance !== undefined && (
                                                    <p className="text-xs text-slate-300 mt-1">
                                                        Balance: R{Number(job.invoice.balance).toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                            <StatusPill status={job.invoice.status} />
                                        </div>
                                    </div>
                                    <div className="p-6 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                onClick={sendInvoice}
                                                disabled={isSendingInvoice}
                                                className="gap-2"
                                            >
                                                <Mail className="h-4 w-4" />
                                                {isSendingInvoice ? "Sending…" : "Email to customer"}
                                            </Button>
                                            <Button variant="outline" onClick={fetchPayLink} className="gap-2">
                                                <LinkIcon className="h-4 w-4" />
                                                Get pay link
                                            </Button>
                                        </div>

                                        {payLink && (
                                            <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-50/70 p-3">
                                                <code className="flex-1 text-xs text-slate-700 truncate">
                                                    {payLink}
                                                </code>
                                                <button
                                                    onClick={copyPayLink}
                                                    className="inline-flex items-center gap-1 rounded-md bg-white border border-border px-2 py-1 text-xs hover:bg-slate-50 transition"
                                                >
                                                    {linkCopied ? (
                                                        <>
                                                            <Check className="h-3 w-3 text-emerald-600" /> Copied
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="h-3 w-3" /> Copy
                                                        </>
                                                    )}
                                                </button>
                                                <a
                                                    href={payLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                >
                                                    Open
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="surface-card p-10 text-center">
                                    <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <DollarSign className="h-5 w-5" />
                                    </div>
                                    <h3 className="mt-3 font-semibold">No invoice yet</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Generate one from this job's line items.
                                    </p>
                                    <Button onClick={generateInvoice} className="mt-4 gap-2">
                                        <FileText className="h-4 w-4" /> Generate invoice
                                    </Button>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="expenses" className="mt-4">
                            <div className="surface-card overflow-hidden">
                                <div className="flex items-center justify-between p-5 border-b border-border/60">
                                    <h3 className="font-semibold">Job expenses</h3>
                                    <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="gap-2">
                                                <Plus className="h-4 w-4" /> Add expense
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Add expense</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>Description</Label>
                                                    <Input
                                                        placeholder="e.g. Copper fittings from Plumblink"
                                                        value={newExpense.description}
                                                        onChange={(e) =>
                                                            setNewExpense({
                                                                ...newExpense,
                                                                description: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label>Amount (R)</Label>
                                                        <Input
                                                            type="number"
                                                            placeholder="0.00"
                                                            value={newExpense.amount}
                                                            onChange={(e) =>
                                                                setNewExpense({
                                                                    ...newExpense,
                                                                    amount: e.target.value,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Category</Label>
                                                        <select
                                                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                                            value={newExpense.category}
                                                            onChange={(e) =>
                                                                setNewExpense({
                                                                    ...newExpense,
                                                                    category: e.target.value,
                                                                })
                                                            }
                                                        >
                                                            <option value="PARTS_PURCHASE">Parts purchase</option>
                                                            <option value="MATERIALS">Materials</option>
                                                            <option value="TOOLS">Tools</option>
                                                            <option value="TRAVEL">Travel</option>
                                                            <option value="OTHER">Other</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button onClick={addExpense}>Save</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="p-5">
                                    {expenses.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">
                                            No expenses recorded.
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            {expenses.map((exp) => (
                                                <div
                                                    key={exp.id}
                                                    className="flex justify-between items-center p-3 rounded-lg hover:bg-slate-50"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="icon-tile h-9 w-9 bg-slate-100 text-slate-600">
                                                            <Receipt className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-sm">
                                                                {exp.description}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {format(new Date(exp.date), "MMM d, yyyy")}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="font-medium text-rose-600">
                                                        -R{Number(exp.amount).toFixed(2)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="photos" className="mt-4 space-y-4">
                            <div className="surface-card p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-semibold">Site photos</h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Before/after shots, conditions, proof of work
                                        </p>
                                    </div>
                                </div>
                                <div className="rounded-xl border-2 border-dashed border-border bg-slate-50/40 p-5">
                                    <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="job-photo-upload">Upload photo</Label>
                                                <Input
                                                    id="job-photo-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) =>
                                                        setPhotoFile(e.target.files?.[0] ?? null)
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="photo-caption">Caption (optional)</Label>
                                                <Textarea
                                                    id="photo-caption"
                                                    rows={2}
                                                    placeholder="Damaged drain trap before repair…"
                                                    value={photoCaption}
                                                    onChange={(e) => setPhotoCaption(e.target.value)}
                                                />
                                            </div>
                                            {photoError && (
                                                <p className="text-xs text-rose-600">{photoError}</p>
                                            )}
                                        </div>
                                        <Button
                                            onClick={uploadPhoto}
                                            disabled={!photoFile || isUploadingPhoto}
                                            className="gap-2"
                                        >
                                            <Upload className="h-4 w-4" />
                                            {isUploadingPhoto ? "Uploading…" : "Upload"}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {photos.length === 0 ? (
                                <div className="surface-card p-10 text-center">
                                    <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                        <ImageIcon className="h-5 w-5" />
                                    </div>
                                    <p className="mt-3 text-sm font-medium">No photos yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Upload your first job photo above.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {photos.map((photo) => (
                                        <div
                                            key={photo.id}
                                            className="surface-card overflow-hidden group"
                                        >
                                            <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                                                <img
                                                    src={photo.thumbnailUrl || photo.url}
                                                    alt={photo.caption || "Job photo"}
                                                    className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
                                                />
                                                <button
                                                    onClick={() => removePhoto(photo.id)}
                                                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm border border-border opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-rose-600 hover:bg-rose-50"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            <div className="p-3">
                                                <p className="text-sm font-medium truncate">
                                                    {photo.caption || "Untitled"}
                                                </p>
                                                <div className="flex items-center justify-between mt-1">
                                                    <p className="text-xs text-muted-foreground">
                                                        {format(new Date(photo.createdAt), "MMM d, h:mm a")}
                                                    </p>
                                                    <a
                                                        href={photo.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                    >
                                                        Full size →
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right rail */}
                <div className="space-y-4">
                    <div className="surface-card p-5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Schedule
                        </h3>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">
                            {job.scheduledStart ? format(new Date(job.scheduledStart), "h:mm a") : "TBD"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {job.scheduledStart
                                ? format(new Date(job.scheduledStart), "EEEE, MMMM d")
                                : "Unscheduled"}
                        </p>
                    </div>

                    <div className="surface-card p-5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Technician
                        </h3>
                        {job.tech ? (
                            <div className="mt-3 flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                    <AvatarFallback className="bg-slate-100 text-slate-700 text-sm font-medium">
                                        {(job.tech.firstName?.[0] || job.tech.email[0]).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {[job.tech.firstName, job.tech.lastName].filter(Boolean).join(" ") || job.tech.email}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Assigned</p>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm italic text-muted-foreground">Unassigned</p>
                        )}
                    </div>

                    {job.van && (
                        <div className="surface-card p-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Van / Team
                            </h3>
                            <p className="mt-2 font-medium">{job.van.name}</p>
                            {job.van.registration && (
                                <p className="text-xs text-muted-foreground">{job.van.registration}</p>
                            )}
                            <div className="mt-3 space-y-1.5">
                                {job.van.members.map((m) => (
                                    <div key={m.id} className="flex items-center gap-2 text-sm">
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-700">
                                            {(m.user.firstName?.[0] || m.user.email[0]).toUpperCase()}
                                        </div>
                                        <span>
                                            {[m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email.split("@")[0]}
                                        </span>
                                        {m.role === "DRIVER" && (
                                            <span className="text-[10px] text-amber-600 font-medium">Driver</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="surface-card p-5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Customer
                        </h3>
                        <p className="mt-2 font-medium">{job.customer.name}</p>
                        <div className="mt-2 space-y-1.5">
                            {job.customer.email && (
                                <a
                                    href={`mailto:${job.customer.email}`}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <Mail className="h-3 w-3" />
                                    {job.customer.email}
                                </a>
                            )}
                            {job.customer.phone && (
                                <a
                                    href={`tel:${job.customer.phone}`}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <Phone className="h-3 w-3" />
                                    {job.customer.phone}
                                </a>
                            )}
                        </div>
                    </div>

                    {job.costSummary && (job.costSummary.totalRevenue > 0 || job.costSummary.totalExpenses > 0) && (
                        <div className="surface-card p-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Job Costing
                            </h3>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Materials</span>
                                    <span>R{job.costSummary.materialsCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Labour</span>
                                    <span>R{job.costSummary.laborRevenue.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Services</span>
                                    <span>R{job.costSummary.serviceRevenue.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2">
                                    <span className="font-medium">Revenue</span>
                                    <span className="font-medium">R{job.costSummary.totalRevenue.toFixed(2)}</span>
                                </div>
                                {job.costSummary.totalExpenses > 0 && (
                                    <div className="flex justify-between text-rose-600">
                                        <span>Expenses</span>
                                        <span>-R{job.costSummary.totalExpenses.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t pt-2">
                                    <span className="font-semibold">Margin</span>
                                    <span className={cn("font-semibold", job.costSummary.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                        R{job.costSummary.margin.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
