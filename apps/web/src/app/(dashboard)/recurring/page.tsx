"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Play, Plus, Power, Repeat, Search, X } from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { toast } from "../../../components/ui/use-toast";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/auth";

const FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABEL: Record<Frequency, string> = {
    WEEKLY: "Weekly",
    BIWEEKLY: "Every 2 weeks",
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    SEMIANNUAL: "Every 6 months",
    ANNUAL: "Annually",
};

type Plan = {
    id: string;
    title: string;
    description: string | null;
    frequency: Frequency;
    nextRunAt: string;
    endDate: string | null;
    active: boolean;
    isDue: boolean;
    customer: { id: string; name: string } | null;
    property: { id: string; addressLine1: string; city: string } | null;
};

type CustomerOption = { id: string; name: string; phone?: string | null };
type PropertyOption = { id: string; customerId: string; addressLine1: string; city: string };

type Filter = "all" | "due" | "active" | "inactive";
const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "due", label: "Due" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
];

const selectClass =
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const errorMessage = (err: unknown, fallback: string): string =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** ISO string -> value for <input type="datetime-local"> in the viewer's timezone. */
const toLocalInput = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

function StatusBadge({ plan }: { plan: Plan }) {
    const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
    if (!plan.active) return <span className={cn(base, "bg-muted text-muted-foreground")}>Inactive</span>;
    if (plan.isDue)
        return <span className={cn(base, "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300")}>Due</span>;
    return <span className={cn(base, "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300")}>Active</span>;
}

function CustomerSearch({
    selected,
    onSelect,
}: {
    selected: CustomerOption | null;
    onSelect: (c: CustomerOption | null) => void;
}) {
    const [query, setQuery] = useState("");
    const debounced = useDebounced(query.trim(), 300);

    const { data: results = [], isFetching } = useQuery<CustomerOption[]>({
        queryKey: ["recurring-customer-search", debounced],
        queryFn: () =>
            api
                .get(`/customers?search=${encodeURIComponent(debounced)}&page=1&limit=20`)
                .then((r) => r.data.data.items ?? []),
        enabled: !selected,
    });

    if (selected) {
        return (
            <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-background px-3 text-sm">
                <span className="truncate">{selected.name}</span>
                <button
                    type="button"
                    aria-label="Change customer"
                    className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onSelect(null)}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id="plan-customer"
                    className="pl-9"
                    placeholder="Search customers by name, phone or email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
                {isFetching ? (
                    <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                    </p>
                ) : results.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No customers found.</p>
                ) : (
                    results.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            onClick={() => onSelect(c)}
                        >
                            <span className="truncate">{c.name}</span>
                            {c.phone && <span className="shrink-0 text-xs text-muted-foreground">{c.phone}</span>}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

type FormState = {
    customer: CustomerOption | null;
    propertyId: string;
    title: string;
    description: string;
    frequency: Frequency;
    when: string; // start date when creating, next run when editing
    endDate: string;
};

const emptyForm = (): FormState => ({
    customer: null,
    propertyId: "",
    title: "",
    description: "",
    frequency: "MONTHLY",
    when: toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    endDate: "",
});

function PlanDialog({
    open,
    plan,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    plan: Plan | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const editing = plan !== null;
    const [form, setForm] = useState<FormState>(emptyForm);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Reset whenever the dialog is (re)opened for a different plan.
    useEffect(() => {
        if (!open) return;
        setErrors({});
        setForm(
            plan
                ? {
                      customer: plan.customer ? { id: plan.customer.id, name: plan.customer.name } : null,
                      propertyId: plan.property?.id ?? "",
                      title: plan.title,
                      description: plan.description ?? "",
                      frequency: plan.frequency,
                      when: toLocalInput(plan.nextRunAt),
                      endDate: toLocalInput(plan.endDate),
                  }
                : emptyForm(),
        );
    }, [open, plan]);

    const customerId = form.customer?.id;
    const { data: properties = [], isLoading: loadingProperties } = useQuery<PropertyOption[]>({
        queryKey: ["recurring-properties", customerId],
        queryFn: () =>
            api.get(`/operations/properties?customerId=${customerId}`).then((r) => r.data.data.properties as PropertyOption[]),
        enabled: open && !editing && !!customerId,
        select: (all) => all.filter((p) => p.customerId === customerId),
    });

    const save = useMutation({
        mutationFn: () => {
            const when = new Date(form.when).toISOString();
            const endDate = form.endDate ? new Date(form.endDate).toISOString() : null;
            if (editing) {
                return api.patch(`/recurring/${plan.id}`, {
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    frequency: form.frequency,
                    nextRunAt: when,
                    endDate,
                });
            }
            return api.post("/recurring", {
                customerId: form.customer!.id,
                propertyId: form.propertyId,
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                frequency: form.frequency,
                startDate: when,
                endDate: endDate ?? undefined,
            });
        },
        onSuccess: () => {
            toast({ title: editing ? "Plan updated" : "Plan created" });
            onSaved();
            onOpenChange(false);
        },
        onError: (err) =>
            toast({ title: editing ? "Could not update plan" : "Could not create plan", description: errorMessage(err, "Please try again."), variant: "destructive" }),
    });

    const submit = () => {
        const next: Record<string, string> = {};
        if (!editing && !form.customer) next.customer = "Choose a customer.";
        if (!editing && !form.propertyId) next.property = "Choose a property.";
        if (form.title.trim().length < 2) next.title = "Enter a title (at least 2 characters).";
        if (!form.when || Number.isNaN(new Date(form.when).getTime())) {
            next.when = editing ? "Choose the next run date." : "Choose a start date.";
        }
        if (form.endDate && form.when && new Date(form.endDate) < new Date(form.when)) {
            next.endDate = "End date must be after the run date.";
        }
        setErrors(next);
        if (Object.keys(next).length === 0) save.mutate();
    };

    const fieldError = (key: string) =>
        errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit recurring plan" : "New recurring plan"}</DialogTitle>
                    <DialogDescription>
                        A job is created automatically each time the plan comes due.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="plan-customer">Customer</Label>
                        {editing ? (
                            <p className="text-sm">
                                {plan.customer?.name ?? "Unknown customer"}
                                {plan.property && (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · {plan.property.addressLine1}, {plan.property.city}
                                    </span>
                                )}
                            </p>
                        ) : (
                            <CustomerSearch
                                selected={form.customer}
                                onSelect={(customer) => setForm((f) => ({ ...f, customer, propertyId: "" }))}
                            />
                        )}
                        {fieldError("customer")}
                    </div>

                    {!editing && (
                        <div className="space-y-1.5">
                            <Label htmlFor="plan-property">Property</Label>
                            <select
                                id="plan-property"
                                className={selectClass}
                                value={form.propertyId}
                                disabled={!form.customer || loadingProperties}
                                onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
                            >
                                <option value="">
                                    {!form.customer
                                        ? "Select a customer first"
                                        : loadingProperties
                                          ? "Loading properties..."
                                          : properties.length === 0
                                            ? "This customer has no properties"
                                            : "Select property"}
                                </option>
                                {properties.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.addressLine1}, {p.city}
                                    </option>
                                ))}
                            </select>
                            {fieldError("property")}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="plan-title">Plan title</Label>
                        <Input
                            id="plan-title"
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder="Quarterly HVAC preventive service"
                        />
                        {fieldError("title")}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="plan-frequency">Frequency</Label>
                            <select
                                id="plan-frequency"
                                className={selectClass}
                                value={form.frequency}
                                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
                            >
                                {FREQUENCIES.map((f) => (
                                    <option key={f} value={f}>
                                        {FREQUENCY_LABEL[f]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="plan-when">{editing ? "Next run" : "First job"}</Label>
                            <Input
                                id="plan-when"
                                type="datetime-local"
                                value={form.when}
                                onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))}
                            />
                            {fieldError("when")}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="plan-end">End date (optional)</Label>
                        <Input
                            id="plan-end"
                            type="datetime-local"
                            value={form.endDate}
                            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                        />
                        {fieldError("endDate")}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="plan-notes">Notes</Label>
                        <Textarea
                            id="plan-notes"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Filter replacement, coil clean, safety checklist."
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={save.isPending}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editing ? "Save changes" : "Create plan"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function RecurringPlansPage() {
    const qc = useQueryClient();
    // Deactivate/reactivate is ADMIN/OFFICE only on the API (matches DELETE).
    const canToggle = useAuthStore((s) => s.user?.role === "ADMIN" || s.user?.role === "OFFICE");
    const [filter, setFilter] = useState<Filter>("all");
    const [dialog, setDialog] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });

    const { data: plans = [], isLoading, isError, refetch } = useQuery<Plan[]>({
        queryKey: ["recurring-plans"],
        queryFn: () => api.get("/recurring").then((r) => r.data.data.plans),
    });

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: ["recurring-plans"] });
    };

    const runDue = useMutation({
        mutationFn: () =>
            api.post("/recurring/run-due").then((r) => r.data.data as { created: number; failed?: number }),
        onSuccess: ({ created, failed = 0 }) => {
            toast({
                title: `Created ${created} ${created === 1 ? "job" : "jobs"}`,
                ...(failed > 0
                    ? { description: `${failed} ${failed === 1 ? "plan" : "plans"} could not be processed. Try again or check the server log.`, variant: "destructive" as const }
                    : {}),
            });
            refresh();
            void qc.invalidateQueries({ queryKey: ["unscheduled-jobs"] });
        },
        onError: (err) =>
            toast({ title: "Could not generate jobs", description: errorMessage(err, "Please try again."), variant: "destructive" }),
    });

    const toggleActive = useMutation({
        mutationFn: (plan: Plan) => api.patch(`/recurring/${plan.id}`, { active: !plan.active }),
        onSuccess: (_res, plan) => {
            toast({ title: plan.active ? "Plan deactivated" : "Plan reactivated" });
            refresh();
        },
        onError: (err) =>
            toast({ title: "Could not update plan", description: errorMessage(err, "Please try again."), variant: "destructive" }),
    });

    const dueCount = useMemo(() => plans.filter((p) => p.active && p.isDue).length, [plans]);

    const visible = useMemo(
        () =>
            plans.filter((p) => {
                if (filter === "due") return p.active && p.isDue;
                if (filter === "active") return p.active;
                if (filter === "inactive") return !p.active;
                return true;
            }),
        [plans, filter],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <Repeat className="h-6 w-6" /> Recurring plans
                    </h1>
                    <p className="page-subtitle">
                        Maintenance contracts that generate a job each time they come due.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() => runDue.mutate()}
                        disabled={runDue.isPending}
                    >
                        {runDue.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Play className="mr-2 h-4 w-4" />
                        )}
                        Generate due jobs now{dueCount > 0 ? ` (${dueCount})` : ""}
                    </Button>
                    <Button onClick={() => setDialog({ open: true, plan: null })}>
                        <Plus className="mr-2 h-4 w-4" /> New plan
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter plans">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.key}
                        onClick={() => setFilter(f.key)}
                        className={cn(
                            "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            filter === f.key
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading plans...
                </p>
            ) : isError ? (
                <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <p className="text-sm text-destructive">Could not load recurring plans.</p>
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            ) : visible.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        {plans.length === 0
                            ? "No recurring plans yet. Create one to start generating maintenance jobs automatically."
                            : "No plans match this filter."}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {visible.map((plan) => (
                        <Card key={plan.id} className={cn(!plan.active && "opacity-75")}>
                            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                                <div className="min-w-0 flex-1 basis-60">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-sm font-semibold">{plan.title}</p>
                                        <StatusBadge plan={plan} />
                                    </div>
                                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                        {plan.customer?.name ?? "Unknown customer"}
                                        {plan.property && ` · ${plan.property.addressLine1}, ${plan.property.city}`}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {FREQUENCY_LABEL[plan.frequency] ?? plan.frequency} · Next run {formatDate(plan.nextRunAt)}
                                        {plan.endDate && ` · Ends ${formatDate(plan.endDate)}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setDialog({ open: true, plan })}>
                                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                                    </Button>
                                    {canToggle && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => toggleActive.mutate(plan)}
                                            disabled={toggleActive.isPending && toggleActive.variables?.id === plan.id}
                                        >
                                            <Power className="mr-1.5 h-3.5 w-3.5" />
                                            {plan.active ? "Deactivate" : "Reactivate"}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <PlanDialog
                open={dialog.open}
                plan={dialog.plan}
                onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
                onSaved={refresh}
            />
        </div>
    );
}
