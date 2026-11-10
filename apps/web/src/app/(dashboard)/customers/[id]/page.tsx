"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    Briefcase,
    Building,
    CheckCircle2,
    ClipboardList,
    FileSignature,
    Mail,
    MapPin,
    MessageSquare,
    Pencil,
    Phone,
    Plus,
    Receipt,
    Wallet,
    Wrench,
} from "lucide-react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { Avatar, AvatarFallback } from "../../../../components/ui/avatar";
import { cn, displayName, formatZAR } from "../../../../lib/utils";
import { useCan } from "../../../../lib/permissions";
import { StatusPill } from "../../../../components/dashboard/shared";

interface Asset {
    id: string;
    name: string;
    category: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    warrantyUntil: string | null;
    lastServicedAt: string | null;
    status: string;
}

interface Property {
    id: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zip: string;
    assets: Asset[];
}

interface CustomerJob {
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduledStart: string | null;
    createdAt: string;
    tech: { firstName: string | null; lastName: string | null; email: string } | null;
    invoice: { id: string; status: string; total: string } | null;
}

interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
    vatNumber: string | null;
    billingAddress: string | null;
    properties: Property[];
    jobs: CustomerJob[];
    summary: {
        lifetimeValue: number;
        outstanding: number;
        invoiceCount: number;
        jobCount: number;
        openJobs: number;
        propertyCount: number;
    };
}

interface TimelineEntry {
    type: string;
    date: string;
    data: any;
}

const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const formatDateTime = (value?: string | null) =>
    value
        ? new Date(value).toLocaleString("en-ZA", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "—";

const ASSET_STATUS_STYLES: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    NEEDS_SERVICE: "bg-amber-50 text-amber-700",
    RETIRED: "bg-slate-100 text-slate-600",
};

const NOTE_TYPES = [
    { value: "NOTE", label: "Note" },
    { value: "CALL_INBOUND", label: "Inbound call" },
    { value: "CALL_OUTBOUND", label: "Outbound call" },
    { value: "EMAIL_SENT", label: "Email sent" },
    { value: "EMAIL_RECEIVED", label: "Email received" },
    { value: "MEETING", label: "Meeting" },
];

// How each timeline entry reads. Anything unmapped still renders with its raw
// type rather than disappearing.
const TIMELINE_META: Record<string, { label: string; icon: any; tone: string }> = {
    NOTE: { label: "Note", icon: MessageSquare, tone: "bg-slate-100 text-slate-600" },
    CALL_INBOUND: { label: "Inbound call", icon: Phone, tone: "bg-blue-50 text-blue-600" },
    CALL_OUTBOUND: { label: "Outbound call", icon: Phone, tone: "bg-blue-50 text-blue-600" },
    EMAIL_SENT: { label: "Email sent", icon: Mail, tone: "bg-violet-50 text-violet-600" },
    EMAIL_RECEIVED: { label: "Email received", icon: Mail, tone: "bg-violet-50 text-violet-600" },
    SMS_SENT: { label: "SMS sent", icon: MessageSquare, tone: "bg-violet-50 text-violet-600" },
    MEETING: { label: "Meeting", icon: ClipboardList, tone: "bg-slate-100 text-slate-600" },
    JOB_CREATED: { label: "Job booked", icon: Briefcase, tone: "bg-blue-50 text-blue-600" },
    JOB_STARTED: { label: "Job started", icon: Wrench, tone: "bg-amber-50 text-amber-600" },
    JOB_COMPLETED: { label: "Job completed", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
    ESTIMATE_CREATED: { label: "Quote sent", icon: FileSignature, tone: "bg-slate-100 text-slate-600" },
    ESTIMATE_APPROVED: { label: "Quote approved", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
    INVOICE_CREATED: { label: "Invoice raised", icon: Receipt, tone: "bg-slate-100 text-slate-600" },
    INVOICE_PAID: { label: "Invoice paid", icon: Wallet, tone: "bg-emerald-50 text-emerald-600" },
    PAYMENT_RECEIVED: { label: "Payment received", icon: Wallet, tone: "bg-emerald-50 text-emerald-600" },
    FORM_SUBMITTED: { label: "Form submitted", icon: ClipboardList, tone: "bg-slate-100 text-slate-600" },
};

function timelineDescription(entry: TimelineEntry): string {
    const d = entry.data ?? {};
    switch (entry.type) {
        case "JOB_CREATED":
        case "JOB_STARTED":
        case "JOB_COMPLETED":
            return d.title ?? "Job";
        case "ESTIMATE_CREATED":
        case "ESTIMATE_APPROVED":
            return `${formatZAR(d.total)}${d.status ? ` · ${d.status}` : ""}`;
        case "INVOICE_CREATED":
        case "INVOICE_PAID":
            return `${d.invoiceNumber ? `${d.invoiceNumber} · ` : ""}${formatZAR(d.total)}`;
        case "PAYMENT_RECEIVED":
            return `${formatZAR(d.amount)}${d.method ? ` · ${d.method}` : ""}`;
        case "FORM_SUBMITTED":
            return d.formName ?? "Form";
        default:
            return d.subject ? `${d.subject} — ${d.body ?? ""}` : d.body ?? "";
    }
}

export default function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>();
    const qc = useQueryClient();
    const canEdit = useCan("manageCustomers");

    const [propertyOpen, setPropertyOpen] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", vatNumber: "", billingAddress: "" });
    const [propertyForm, setPropertyForm] = useState({
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        zip: "",
    });
    const [noteForm, setNoteForm] = useState({ type: "NOTE", subject: "", body: "" });
    const [formError, setFormError] = useState<string | null>(null);

    const {
        data: customer,
        isLoading,
        error,
    } = useQuery<Customer>({
        queryKey: ["customer", id],
        queryFn: () => api.get(`/customers/${id}`).then((r) => r.data.data.customer),
        enabled: !!id,
    });

    const { data: timeline } = useQuery<TimelineEntry[]>({
        queryKey: ["customer-timeline", id],
        queryFn: () =>
            api.get(`/customer-notes/customer/${id}/timeline`).then((r) => r.data.data.timeline ?? []),
        enabled: !!id,
    });

    const addProperty = useMutation({
        mutationFn: () =>
            api.post(`/customers/${id}/properties`, {
                ...propertyForm,
                addressLine2: propertyForm.addressLine2 || undefined,
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["customer", id] });
            setPropertyOpen(false);
            setPropertyForm({ addressLine1: "", addressLine2: "", city: "", state: "", zip: "" });
            setFormError(null);
        },
        onError: (err: any) => setFormError(err.response?.data?.message ?? "Could not add the property."),
    });

    const saveCustomer = useMutation({
        mutationFn: () =>
            api.patch(`/customers/${id}`, {
                name: editForm.name,
                email: editForm.email || null,
                phone: editForm.phone || null,
                vatNumber: editForm.vatNumber.trim() || null,
                billingAddress: editForm.billingAddress.trim() || null,
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["customer", id] });
            void qc.invalidateQueries({ queryKey: ["customers"] });
            setEditOpen(false);
            setFormError(null);
        },
        onError: (err: any) =>
            setFormError(err.response?.data?.message ?? "Could not save the customer."),
    });

    const addNote = useMutation({
        mutationFn: () =>
            api.post("/customer-notes", {
                customerId: id,
                type: noteForm.type,
                subject: noteForm.subject || undefined,
                body: noteForm.body,
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["customer-timeline", id] });
            setNoteOpen(false);
            setNoteForm({ type: "NOTE", subject: "", body: "" });
            setFormError(null);
        },
        onError: (err: any) => setFormError(err.response?.data?.message ?? "Could not save the note."),
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-20 animate-pulse rounded-xl bg-slate-200/70" />
                <div className="grid gap-4 md:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="surface-card h-28 animate-pulse" />
                    ))}
                </div>
                <div className="surface-card h-72 animate-pulse" />
            </div>
        );
    }

    if (error || !customer) {
        return (
            <div className="surface-card flex items-center gap-3 p-6 text-rose-700">
                <AlertCircle className="h-5 w-5" />
                <span>{(error as any)?.response?.data?.message ?? "Customer not found."}</span>
            </div>
        );
    }

    const jobs = customer.jobs ?? [];
    // Money and totals come from the server, which sees every invoice and job.
    // The jobs array above is only the most recent page of history.
    const { lifetimeValue, outstanding, jobCount, openJobs, invoiceCount } = customer.summary;
    const equipmentCount = customer.properties.reduce((sum, p) => sum + (p.assets?.length ?? 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 text-lg">
                        <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 font-medium text-slate-700">
                            {customer.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="page-title">{customer.name}</h1>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {customer.email && (
                                <a
                                    href={`mailto:${customer.email}`}
                                    className="flex items-center gap-1.5 hover:text-foreground"
                                >
                                    <Mail className="h-3.5 w-3.5" />
                                    {customer.email}
                                </a>
                            )}
                            {customer.phone && (
                                <a
                                    href={`tel:${customer.phone}`}
                                    className="flex items-center gap-1.5 hover:text-foreground"
                                >
                                    <Phone className="h-3.5 w-3.5" />
                                    {customer.phone}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
                {canEdit && (
                    <div className="flex items-center gap-2 self-start">
                        <Dialog
                            open={editOpen}
                            onOpenChange={(open) => {
                                setEditOpen(open);
                                if (open) {
                                    setEditForm({
                                        name: customer.name,
                                        email: customer.email ?? "",
                                        phone: customer.phone ?? "",
                                        vatNumber: customer.vatNumber ?? "",
                                        billingAddress: customer.billingAddress ?? "",
                                    });
                                    setFormError(null);
                                }
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Pencil className="h-4 w-4" /> Edit
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Edit customer</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-name">Name or company</Label>
                                        <Input
                                            id="edit-name"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-email">Email</Label>
                                        <Input
                                            id="edit-email"
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-phone">Phone</Label>
                                        <Input
                                            id="edit-phone"
                                            value={editForm.phone}
                                            placeholder="082 123 4567"
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-vat">VAT number</Label>
                                        <Input
                                            id="edit-vat"
                                            value={editForm.vatNumber}
                                            placeholder="4123456789"
                                            onChange={(e) => setEditForm({ ...editForm, vatNumber: e.target.value })}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            For SARS tax invoices over R5,000. 10 digits starting with 4, or leave blank.
                                        </p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-billing">Billing address</Label>
                                        <Textarea
                                            id="edit-billing"
                                            rows={3}
                                            value={editForm.billingAddress}
                                            placeholder="Postal / billing address for invoices"
                                            onChange={(e) => setEditForm({ ...editForm, billingAddress: e.target.value })}
                                        />
                                    </div>
                                    {formError && <p className="text-xs text-destructive">{formError}</p>}
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={() => saveCustomer.mutate()}
                                        disabled={!editForm.name.trim() || saveCustomer.isPending}
                                    >
                                        {saveCustomer.isPending ? "Saving…" : "Save changes"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Link
                            href={`/jobs/quick?customerId=${customer.id}`}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                            <Plus className="h-4 w-4" /> New job
                        </Link>
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="surface-card p-5">
                    <div className="icon-tile bg-emerald-50 text-emerald-600">
                        <Wallet className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">Lifetime value</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{formatZAR(lifetimeValue)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Collected across {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}</p>
                </div>
                <div className="surface-card p-5">
                    <div className={cn("icon-tile", outstanding > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500")}>
                        <Receipt className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">Outstanding</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{formatZAR(outstanding)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Unpaid invoices</p>
                </div>
                <div className="surface-card p-5">
                    <div className="icon-tile bg-blue-50 text-blue-600">
                        <Briefcase className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">Jobs</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{jobCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{openJobs} still open</p>
                </div>
                <div className="surface-card p-5">
                    <div className="icon-tile bg-violet-50 text-violet-600">
                        <Building className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">Sites</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{customer.properties.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{equipmentCount} items of equipment</p>
                </div>
            </div>

            <div className="surface-card p-5">
                <div className="flex items-center gap-2">
                    <div className="icon-tile bg-slate-100 text-slate-500">
                        <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold">Billing</h3>
                        <p className="text-xs text-muted-foreground">
                            Tax details used on SARS-compliant invoices over R5,000
                        </p>
                    </div>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">VAT number</dt>
                        <dd className="mt-1 text-sm tabular-nums">{customer.vatNumber || "—"}</dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billing address</dt>
                        <dd className="mt-1 whitespace-pre-line text-sm">{customer.billingAddress || "—"}</dd>
                    </div>
                </dl>
            </div>

            <Tabs defaultValue="activity" className="w-full">
                <TabsList>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="jobs">Jobs</TabsTrigger>
                    <TabsTrigger value="properties">Sites &amp; equipment</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="mt-4">
                    <div className="surface-card overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                            <div>
                                <h3 className="font-semibold">Everything that happened</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Calls, notes, jobs, quotes, invoices and payments in one thread
                                </p>
                            </div>
                            <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2">
                                        <Plus className="h-4 w-4" /> Log contact
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Log a contact</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="note-type">Type</Label>
                                            <select
                                                id="note-type"
                                                value={noteForm.type}
                                                onChange={(e) => setNoteForm({ ...noteForm, type: e.target.value })}
                                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                            >
                                                {NOTE_TYPES.map((t) => (
                                                    <option key={t.value} value={t.value}>
                                                        {t.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="note-subject">Subject</Label>
                                            <Input
                                                id="note-subject"
                                                value={noteForm.subject}
                                                onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="note-body">Details</Label>
                                            <Textarea
                                                id="note-body"
                                                rows={4}
                                                value={noteForm.body}
                                                onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
                                                placeholder="What was discussed?"
                                            />
                                        </div>
                                        {formError && <p className="text-xs text-destructive">{formError}</p>}
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={() => addNote.mutate()}
                                            disabled={!noteForm.body.trim() || addNote.isPending}
                                        >
                                            {addNote.isPending ? "Saving…" : "Save"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {!timeline?.length ? (
                            <EmptyRow
                                icon={ClipboardList}
                                title="Nothing logged yet"
                                hint="Jobs, quotes, invoices and any contact you log will appear here."
                            />
                        ) : (
                            <ol className="divide-y divide-border/60">
                                {timeline.map((entry, i) => {
                                    const meta = TIMELINE_META[entry.type] ?? {
                                        label: entry.type.replace(/_/g, " ").toLowerCase(),
                                        icon: ClipboardList,
                                        tone: "bg-slate-100 text-slate-600",
                                    };
                                    const Icon = meta.icon;
                                    const jobLink = entry.type.startsWith("JOB_") ? entry.data?.id : null;
                                    const row = (
                                        <div className="flex gap-3 px-6 py-3.5">
                                            <span
                                                className={cn(
                                                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                                    meta.tone
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-baseline justify-between gap-3">
                                                    <p className="text-sm font-medium">{meta.label}</p>
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {formatDateTime(entry.date)}
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {timelineDescription(entry)}
                                                </p>
                                                {entry.data?.user && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        by {displayName(entry.data.user)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                    return (
                                        <li key={`${entry.type}-${entry.date}-${i}`}>
                                            {jobLink ? (
                                                <Link href={`/jobs/${jobLink}`} className="block transition hover:bg-slate-50/70">
                                                    {row}
                                                </Link>
                                            ) : (
                                                row
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="jobs" className="mt-4">
                    <div className="surface-card overflow-hidden">
                        <div className="border-b border-border/60 px-6 py-4">
                            <h3 className="font-semibold">Job history</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">{jobs.length === jobCount ? "Most recent first" : `Latest ${jobs.length} of ${jobCount}`}</p>
                        </div>
                        {jobs.length === 0 ? (
                            <EmptyRow
                                icon={Briefcase}
                                title="No jobs yet"
                                hint="Book this customer's first job to start their history."
                            />
                        ) : (
                            <div className="divide-y divide-border/60">
                                {jobs.map((job) => (
                                    <Link
                                        key={job.id}
                                        href={`/jobs/${job.id}`}
                                        className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-slate-50/70"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{job.title}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {formatDate(job.scheduledStart ?? job.createdAt)} ·{" "}
                                                {job.tech ? displayName(job.tech) : "Unassigned"}
                                            </p>
                                        </div>
                                        {job.invoice && (
                                            <span className="hidden shrink-0 text-sm font-medium tabular-nums sm:block">
                                                {formatZAR(job.invoice.total)}
                                            </span>
                                        )}
                                        <StatusPill status={job.status} />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="properties" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold">Service addresses</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Equipment on site drives service history and warranty claims
                            </p>
                        </div>
                        {canEdit && (
                            <Dialog open={propertyOpen} onOpenChange={setPropertyOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2">
                                        <Plus className="h-4 w-4" /> Add site
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add a service address</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="addr1">Street address</Label>
                                            <Input
                                                id="addr1"
                                                value={propertyForm.addressLine1}
                                                onChange={(e) =>
                                                    setPropertyForm({ ...propertyForm, addressLine1: e.target.value })
                                                }
                                                placeholder="12 Jan Smuts Avenue"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="addr2">Unit / complex</Label>
                                            <Input
                                                id="addr2"
                                                value={propertyForm.addressLine2}
                                                onChange={(e) =>
                                                    setPropertyForm({ ...propertyForm, addressLine2: e.target.value })
                                                }
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="city">City</Label>
                                                <Input
                                                    id="city"
                                                    value={propertyForm.city}
                                                    onChange={(e) =>
                                                        setPropertyForm({ ...propertyForm, city: e.target.value })
                                                    }
                                                    placeholder="Johannesburg"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="state">Province</Label>
                                                <Input
                                                    id="state"
                                                    value={propertyForm.state}
                                                    onChange={(e) =>
                                                        setPropertyForm({ ...propertyForm, state: e.target.value })
                                                    }
                                                    placeholder="GP"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="zip">Postal code</Label>
                                                <Input
                                                    id="zip"
                                                    value={propertyForm.zip}
                                                    onChange={(e) =>
                                                        setPropertyForm({ ...propertyForm, zip: e.target.value })
                                                    }
                                                    placeholder="2196"
                                                />
                                            </div>
                                        </div>
                                        {formError && <p className="text-xs text-destructive">{formError}</p>}
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={() => addProperty.mutate()}
                                            disabled={
                                                !propertyForm.addressLine1.trim() ||
                                                !propertyForm.city.trim() ||
                                                addProperty.isPending
                                            }
                                        >
                                            {addProperty.isPending ? "Adding…" : "Add site"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>

                    {customer.properties.length === 0 ? (
                        <div className="surface-card">
                            <EmptyRow
                                icon={MapPin}
                                title="No service address yet"
                                hint="Add the address where work happens so jobs can be booked."
                            />
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {customer.properties.map((prop) => (
                                <div key={prop.id} className="surface-card flex flex-col p-5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{prop.addressLine1}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {[prop.addressLine2, prop.city, prop.state, prop.zip]
                                                    .filter(Boolean)
                                                    .join(", ")}
                                            </p>
                                        </div>
                                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    </div>

                                    <div className="mt-4 flex-1 space-y-2">
                                        {prop.assets?.length ? (
                                            prop.assets.map((asset) => (
                                                <div
                                                    key={asset.id}
                                                    className="rounded-lg border border-border/60 bg-slate-50/60 px-3 py-2"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="truncate text-sm font-medium">{asset.name}</span>
                                                        <span
                                                            className={cn(
                                                                "stat-chip shrink-0",
                                                                ASSET_STATUS_STYLES[asset.status] ??
                                                                    "bg-slate-100 text-slate-600"
                                                            )}
                                                        >
                                                            {asset.status.replace(/_/g, " ")}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                                        {[asset.manufacturer, asset.model, asset.serialNumber]
                                                            .filter(Boolean)
                                                            .join(" / ") ||
                                                            asset.category ||
                                                            "Tracked asset"}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        Serviced {formatDate(asset.lastServicedAt)}
                                                        {asset.warrantyUntil
                                                            ? ` · warranty to ${formatDate(asset.warrantyUntil)}`
                                                            : ""}
                                                    </p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                                <Wrench className="h-3 w-3" />
                                                No equipment tracked yet
                                            </div>
                                        )}
                                    </div>

                                    {canEdit && (
                                        <Link
                                            href={`/jobs/quick?customerId=${customer.id}&propertyId=${prop.id}`}
                                            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                                        >
                                            <Plus className="h-4 w-4" /> Job at this site
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function EmptyRow({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}
