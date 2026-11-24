"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Zap, Search } from "lucide-react";
import Link from "next/link";
import { toLocalInput } from "@/lib/schedule-utils";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

interface Tech {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
}

interface VanOption {
    id: string;
    name: string;
    registration?: string | null;
}

interface ExistingCustomer {
    id: string;
    name: string;
    phone?: string;
    email?: string;
}

interface CustomerProperty {
    id: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state?: string | null;
    zip?: string | null;
}

interface JobTemplate {
    id: string;
    name: string;
    defaultDurationMin: number | null;
    defaultPriority: string;
    requiredSkills: string[];
    defaultLineItems: Array<{ name: string; quantity: number; unitPrice: number }>;
    defaultDescription: string | null;
}

export default function QuickJobPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [techs, setTechs] = useState<Tech[]>([]);
    const [vans, setVans] = useState<VanOption[]>([]);
    const [templates, setTemplates] = useState<JobTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
    const [customerSearch, setCustomerSearch] = useState("");
    const [useExisting, setUseExisting] = useState(false);
    // Sites already on file for the selected customer. Booking against one of
    // these keeps their service history and equipment on a single record
    // instead of duplicating the address on every visit.
    const [customerProperties, setCustomerProperties] = useState<CustomerProperty[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        existingCustomerId: "",
        existingPropertyId: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        addressLine1: "",
        city: "",
        state: "",
        zip: "",
        title: "",
        description: "",
        priority: "MEDIUM" as string,
        techId: "",
        vanId: "",
        scheduledStart: "",
        scheduledEnd: "",
    });

    useEffect(() => {
        api.get("/users").then((res) => {
            const users = res.data?.data?.users ?? [];
            setTechs(users.filter((u: any) => u.role === "TECHNICIAN" && u.status === "ACTIVE"));
        });
        api.get("/vans").then((res) => {
            setVans((res.data?.data?.vans ?? []).filter((v: any) => v.active).map((v: any) => ({ id: v.id, name: v.name, registration: v.registration })));
        }).catch(() => {});
        api.get("/customers?limit=200").then((res) => {
            setExistingCustomers(res.data?.data?.items ?? []);
        });
        api.get("/job-templates").then((res) => {
            setTemplates(res.data?.data?.templates ?? []);
        }).catch(() => {});
    }, []);

    // Caller-ID pre-fill from query params
    useEffect(() => {
        const phone = searchParams.get("phone");
        const customerId = searchParams.get("customerId");
        if (customerId && existingCustomers.length) {
            const c = existingCustomers.find((x) => x.id === customerId);
            if (c) selectExistingCustomer(c);
        } else if (phone) {
            setForm((f) => ({ ...f, customerPhone: phone }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, existingCustomers.length]);

    // Slot pre-fill from the dispatch board / calendar (click-to-create).
    useEffect(() => {
        const start = searchParams.get("start");
        const end = searchParams.get("end");
        const techId = searchParams.get("techId");
        const vanId = searchParams.get("vanId");
        const startDate = start ? new Date(start) : null;
        const validStart = startDate && !Number.isNaN(startDate.getTime()) ? startDate : null;
        const endDate = end ? new Date(end) : null;
        const validEnd =
            validStart && endDate && !Number.isNaN(endDate.getTime()) && endDate > validStart
                ? endDate
                : validStart
                ? new Date(validStart.getTime() + DEFAULT_DURATION_MS)
                : null;
        if (!validStart && !techId && !vanId) return;
        setForm((f) => ({
            ...f,
            scheduledStart: validStart ? toLocalInput(validStart) : f.scheduledStart,
            scheduledEnd: validEnd ? toLocalInput(validEnd) : f.scheduledEnd,
            techId: techId ?? f.techId,
            vanId: vanId ?? f.vanId,
        }));
    }, [searchParams]);

    const applyTemplate = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const tpl = templates.find((t) => t.id === templateId);
        if (!tpl) return;
        setForm((f) => ({
            ...f,
            title: f.title || tpl.name,
            description: f.description || tpl.defaultDescription || "",
            priority: tpl.defaultPriority || f.priority,
        }));
    };

    const filteredCustomers = existingCustomers.filter(
        (c) =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
            (c.phone && c.phone.includes(customerSearch)) ||
            (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
    );

    const selectExistingCustomer = (c: ExistingCustomer) => {
        // Functional update: this also runs from the prefill effect, where `form`
        // would be stale and wipe the slot prefill.
        setForm((prev) => ({
            ...prev,
            existingCustomerId: c.id,
            existingPropertyId: "",
            customerName: c.name,
            customerPhone: c.phone || "",
            customerEmail: c.email || "",
        }));
        setUseExisting(true);
        setCustomerSearch("");

        api.get(`/customers/${c.id}`)
            .then((res) => {
                const props: CustomerProperty[] = res.data?.data?.customer?.properties ?? [];
                setCustomerProperties(props);
                // One site on file is the overwhelmingly common case — pick it
                // so the booker never retypes an address they already have.
                const preselect = searchParams.get("propertyId") ?? (props.length === 1 ? props[0].id : "");
                if (preselect && props.some((p) => p.id === preselect)) {
                    selectExistingProperty(preselect, props);
                }
            })
            .catch(() => setCustomerProperties([]));
    };

    const selectExistingProperty = (propertyId: string, props = customerProperties) => {
        const prop = props.find((p) => p.id === propertyId);
        setForm((f) => ({
            ...f,
            existingPropertyId: propertyId,
            addressLine1: prop?.addressLine1 ?? "",
            city: prop?.city ?? "",
            state: prop?.state ?? "",
            zip: prop?.zip ?? "",
        }));
    };

    const clearExistingCustomer = () => {
        setForm({
            ...form,
            existingCustomerId: "",
            existingPropertyId: "",
            customerName: "",
            customerPhone: "",
            customerEmail: "",
            addressLine1: "",
            city: "",
            state: "",
            zip: "",
        });
        setCustomerProperties([]);
        setUseExisting(false);
    };

    const handleSubmit = async () => {
        const start = form.scheduledStart ? new Date(form.scheduledStart) : null;
        // Always send an end with a start: without one, conflict checks skip the
        // job and the tech's week view hides it.
        const end = start
            ? form.scheduledEnd
                ? new Date(form.scheduledEnd)
                : new Date(start.getTime() + DEFAULT_DURATION_MS)
            : null;
        if (start && end && end <= start) {
            setError("Scheduled end must be after the start.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const payload: any = {
                customerName: form.customerName,
                customerPhone: form.customerPhone || undefined,
                customerEmail: form.customerEmail || undefined,
                addressLine1: form.addressLine1,
                city: form.city,
                state: form.state || undefined,
                zip: form.zip || undefined,
                title: form.title,
                description: form.description || undefined,
                priority: form.priority,
                techId: form.techId || undefined,
                vanId: form.vanId || undefined,
                scheduledStart: start ? start.toISOString() : undefined,
                scheduledEnd: end ? end.toISOString() : undefined,
            };
            if (form.existingCustomerId) {
                payload.existingCustomerId = form.existingCustomerId;
            }
            if (form.existingPropertyId) {
                payload.existingPropertyId = form.existingPropertyId;
            }
            if (selectedTemplateId) {
                payload.templateId = selectedTemplateId;
            }
            const res = await api.post("/jobs/quick", payload);
            router.push(`/jobs/${res.data.data.job.id}`);
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to create job");
            setSubmitting(false);
        }
    };

    const techName = (t: Tech) =>
        [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email.split("@")[0];

    return (
        <div className="space-y-6 max-w-2xl">
            <Link
                href="/jobs"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to jobs
            </Link>

            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <Zap className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Quick Job</h1>
                    <p className="text-sm text-muted-foreground">
                        Create customer, property, and job in one step
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {/* Customer Section */}
            <div className="surface-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Customer</h2>
                    {useExisting && (
                        <button onClick={clearExistingCustomer} className="text-xs text-blue-600 hover:text-blue-700">
                            New customer instead
                        </button>
                    )}
                </div>

                {!useExisting && (
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Search existing customers</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Type a name, phone, or email…"
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        {customerSearch && filteredCustomers.length > 0 && (
                            <div className="max-h-32 overflow-y-auto rounded-lg border divide-y">
                                {filteredCustomers.slice(0, 5).map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => selectExistingCustomer(c)}
                                        className="w-full p-2.5 text-left hover:bg-slate-50 text-sm flex justify-between"
                                    >
                                        <span className="font-medium">{c.name}</span>
                                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Name *</Label>
                        <Input
                            placeholder="Customer name"
                            value={form.customerName}
                            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                            disabled={useExisting}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                            placeholder="+27 82 123 4567"
                            value={form.customerPhone}
                            onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                            disabled={useExisting}
                        />
                    </div>
                    <div className="col-span-full space-y-2">
                        <Label>Email</Label>
                        <Input
                            type="email"
                            placeholder="customer@email.com"
                            value={form.customerEmail}
                            onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                            disabled={useExisting}
                        />
                    </div>
                </div>
            </div>

            {/* Property Section */}
            <div className="surface-card p-6 space-y-4">
                <h2 className="font-semibold">Property Address</h2>

                {customerProperties.length > 0 && (
                    <div className="space-y-2">
                        <Label>Site on file</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={form.existingPropertyId}
                            onChange={(e) => {
                                if (e.target.value) selectExistingProperty(e.target.value);
                                else
                                    setForm((f) => ({
                                        ...f,
                                        existingPropertyId: "",
                                        addressLine1: "",
                                        city: "",
                                        state: "",
                                        zip: "",
                                    }));
                            }}
                        >
                            <option value="">— New address —</option>
                            {customerProperties.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {[p.addressLine1, p.city].filter(Boolean).join(", ")}
                                </option>
                            ))}
                        </select>
                        {form.existingPropertyId && (
                            <p className="text-xs text-muted-foreground">
                                Booking at an existing site keeps this customer&apos;s history and
                                equipment on one record.
                            </p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-full space-y-2">
                        <Label>Street Address *</Label>
                        <Input
                            placeholder="14 Main Rd"
                            value={form.addressLine1}
                            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                            disabled={!!form.existingPropertyId}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>City *</Label>
                        <Input
                            placeholder="Centurion"
                            value={form.city}
                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                            disabled={!!form.existingPropertyId}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Province / State</Label>
                        <Input
                            placeholder="Gauteng"
                            value={form.state}
                            onChange={(e) => setForm({ ...form, state: e.target.value })}
                            disabled={!!form.existingPropertyId}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Postal Code</Label>
                        <Input
                            placeholder="0157"
                            value={form.zip}
                            onChange={(e) => setForm({ ...form, zip: e.target.value })}
                            disabled={!!form.existingPropertyId}
                        />
                    </div>
                </div>
            </div>

            {/* Job Section */}
            <div className="surface-card p-6 space-y-4">
                <h2 className="font-semibold">Job Details</h2>
                {templates.length > 0 && (
                    <div className="space-y-2">
                        <Label>Use template (optional)</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={selectedTemplateId}
                            onChange={(e) => applyTemplate(e.target.value)}
                        >
                            <option value="">— None —</option>
                            {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} {t.defaultDurationMin ? `(${t.defaultDurationMin} min)` : ""}
                                </option>
                            ))}
                        </select>
                        {selectedTemplateId && (
                            <p className="text-xs text-muted-foreground">
                                Template will pre-fill title, description, line items, and checklist on the new job.
                            </p>
                        )}
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-full space-y-2">
                        <Label>Job Title *</Label>
                        <Input
                            placeholder="e.g. Burst pipe repair"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                        />
                    </div>
                    <div className="col-span-full space-y-2">
                        <Label>Description</Label>
                        <Textarea
                            rows={3}
                            placeholder="Describe the issue…"
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Priority</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={form.priority}
                            onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="EMERGENCY">Emergency</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Assign Technician</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={form.techId}
                            onChange={(e) => setForm({ ...form, techId: e.target.value })}
                        >
                            <option value="">Unassigned</option>
                            {techs.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {techName(t)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Assign Van / Team</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={form.vanId}
                            onChange={(e) => setForm({ ...form, vanId: e.target.value })}
                        >
                            <option value="">No van</option>
                            {vans.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}{v.registration ? ` (${v.registration})` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Scheduled Start</Label>
                        <Input
                            type="datetime-local"
                            value={form.scheduledStart}
                            onChange={(e) => {
                                const value = e.target.value;
                                setForm((prev) => {
                                    const start = value ? new Date(value) : null;
                                    const end = prev.scheduledEnd ? new Date(prev.scheduledEnd) : null;
                                    // Keep the end after the start (default one hour).
                                    const scheduledEnd =
                                        start && (!end || end <= start)
                                            ? toLocalInput(new Date(start.getTime() + DEFAULT_DURATION_MS))
                                            : prev.scheduledEnd;
                                    return { ...prev, scheduledStart: value, scheduledEnd: value ? scheduledEnd : "" };
                                });
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="scheduledEnd">Scheduled End</Label>
                        <Input
                            id="scheduledEnd"
                            type="datetime-local"
                            value={form.scheduledEnd}
                            min={form.scheduledStart || undefined}
                            disabled={!form.scheduledStart}
                            onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <Button
                    onClick={handleSubmit}
                    disabled={submitting || !form.customerName || !form.addressLine1 || !form.city || !form.title}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                    <Zap className="h-4 w-4" />
                    {submitting ? "Creating…" : "Create Job"}
                </Button>
                <Link href="/jobs">
                    <Button variant="outline">Cancel</Button>
                </Link>
            </div>
        </div>
    );
}
