"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Zap, Search } from "lucide-react";
import Link from "next/link";

interface Tech {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
}

interface ExistingCustomer {
    id: string;
    name: string;
    phone?: string;
    email?: string;
}

export default function QuickJobPage() {
    const router = useRouter();
    const [techs, setTechs] = useState<Tech[]>([]);
    const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
    const [customerSearch, setCustomerSearch] = useState("");
    const [useExisting, setUseExisting] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        existingCustomerId: "",
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
        scheduledStart: "",
    });

    useEffect(() => {
        api.get("/users").then((res) => {
            const users = res.data?.data?.users ?? [];
            setTechs(users.filter((u: any) => u.role === "TECHNICIAN" && u.status === "ACTIVE"));
        });
        api.get("/customers?limit=200").then((res) => {
            setExistingCustomers(res.data?.data?.items ?? []);
        });
    }, []);

    const filteredCustomers = existingCustomers.filter(
        (c) =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
            (c.phone && c.phone.includes(customerSearch)) ||
            (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
    );

    const selectExistingCustomer = (c: ExistingCustomer) => {
        setForm({
            ...form,
            existingCustomerId: c.id,
            customerName: c.name,
            customerPhone: c.phone || "",
            customerEmail: c.email || "",
        });
        setUseExisting(true);
        setCustomerSearch("");
    };

    const clearExistingCustomer = () => {
        setForm({ ...form, existingCustomerId: "", customerName: "", customerPhone: "", customerEmail: "" });
        setUseExisting(false);
    };

    const handleSubmit = async () => {
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
                scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
            };
            if (form.existingCustomerId) {
                payload.existingCustomerId = form.existingCustomerId;
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-full space-y-2">
                        <Label>Street Address *</Label>
                        <Input
                            placeholder="14 Main Rd"
                            value={form.addressLine1}
                            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>City *</Label>
                        <Input
                            placeholder="Centurion"
                            value={form.city}
                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Province / State</Label>
                        <Input
                            placeholder="Gauteng"
                            value={form.state}
                            onChange={(e) => setForm({ ...form, state: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Postal Code</Label>
                        <Input
                            placeholder="0157"
                            value={form.zip}
                            onChange={(e) => setForm({ ...form, zip: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Job Section */}
            <div className="surface-card p-6 space-y-4">
                <h2 className="font-semibold">Job Details</h2>
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
                        <Label>Scheduled Start</Label>
                        <Input
                            type="datetime-local"
                            value={form.scheduledStart}
                            onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
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
