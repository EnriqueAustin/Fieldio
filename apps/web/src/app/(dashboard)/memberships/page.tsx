"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "../../../components/ui/dialog";
import {
    Plus,
    Crown,
    Users,
    DollarSign,
    Star,
    XCircle,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Tier {
    id: string;
    name: string;
    price: number;
    interval: string;
    laborDiscountPct: number;
    materialDiscountPct: number;
    priorityBooking: boolean;
    includedVisits: number;
    active: boolean;
    _count: { memberships: number };
}

interface Membership {
    id: string;
    status: string;
    startDate: string;
    nextBillingDate: string | null;
    visitsUsed: number;
    autoRenew: boolean;
    customer: { id: string; name: string; email: string | null; phone: string | null };
    tier: { id: string; name: string; price: number; interval: string; laborDiscountPct: number; materialDiscountPct: number };
}

const statusColors: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PAST_DUE: "bg-amber-50 text-amber-700 ring-amber-200",
    CANCELED: "bg-slate-100 text-slate-600 ring-slate-200",
    EXPIRED: "bg-rose-50 text-rose-700 ring-rose-200",
};

export default function MembershipsPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState<"members" | "tiers">("members");
    const [tierDialogOpen, setTierDialogOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("");

    const { data: tiers } = useQuery({
        queryKey: ["membership-tiers"],
        queryFn: () => api.get("/memberships/tiers?includeInactive=true").then((r) => r.data.data.tiers as Tier[]),
    });

    const { data: memberships, isLoading } = useQuery({
        queryKey: ["memberships", statusFilter],
        queryFn: () =>
            api.get(`/memberships${statusFilter ? `?status=${statusFilter}` : ""}`).then((r) => r.data.data.memberships as Membership[]),
    });

    const [tierForm, setTierForm] = useState({
        name: "",
        price: "",
        interval: "MONTHLY",
        laborDiscountPct: "0",
        materialDiscountPct: "0",
        includedVisits: "0",
        priorityBooking: false,
    });

    const createTier = async () => {
        await api.post("/memberships/tiers", {
            ...tierForm,
            price: parseFloat(tierForm.price),
            laborDiscountPct: parseFloat(tierForm.laborDiscountPct),
            materialDiscountPct: parseFloat(tierForm.materialDiscountPct),
            includedVisits: parseInt(tierForm.includedVisits),
        });
        void qc.invalidateQueries({ queryKey: ["membership-tiers"] });
        setTierDialogOpen(false);
        setTierForm({ name: "", price: "", interval: "MONTHLY", laborDiscountPct: "0", materialDiscountPct: "0", includedVisits: "0", priorityBooking: false });
    };

    const cancelMembership = async (id: string) => {
        await api.post(`/memberships/${id}/cancel`, { reason: "Canceled by admin" });
        void qc.invalidateQueries({ queryKey: ["memberships"] });
    };

    const activeTiers = tiers?.filter((t) => t.active) ?? [];
    const totalMembers = memberships?.filter((m) => m.status === "ACTIVE").length ?? 0;
    const monthlyRecurring = memberships
        ?.filter((m) => m.status === "ACTIVE")
        .reduce((sum, m) => {
            const multiplier = m.tier.interval === "MONTHLY" ? 1 : m.tier.interval === "QUARTERLY" ? 1 / 3 : 1 / 12;
            return sum + Number(m.tier.price) * multiplier;
        }, 0) ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Memberships</h1>
                    <p className="page-subtitle">Service agreements and membership plans.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setTab(tab === "members" ? "tiers" : "members")}>
                        {tab === "members" ? "Manage Tiers" : "View Members"}
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600"><Crown className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{activeTiers.length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Active Tiers</p>
                    <p className="text-xs text-muted-foreground">Membership plans available</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{totalMembers}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Active Members</p>
                    <p className="text-xs text-muted-foreground">Current subscriptions</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><DollarSign className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{monthlyRecurring.toFixed(0)}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Monthly Recurring</p>
                    <p className="text-xs text-muted-foreground">Estimated MRR</p>
                </div>
            </div>

            {tab === "tiers" ? (
                /* Tiers Management */
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Membership Tiers</h2>
                        <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New Tier</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Create Membership Tier</DialogTitle></DialogHeader>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label>Tier Name</Label>
                                        <Input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="e.g. Gold, Silver, Bronze" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>Price</Label>
                                            <Input type="number" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Billing Interval</Label>
                                            <select className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={tierForm.interval} onChange={(e) => setTierForm({ ...tierForm, interval: e.target.value })}>
                                                <option value="MONTHLY">Monthly</option>
                                                <option value="QUARTERLY">Quarterly</option>
                                                <option value="ANNUAL">Annual</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>Labor Discount %</Label>
                                            <Input type="number" value={tierForm.laborDiscountPct} onChange={(e) => setTierForm({ ...tierForm, laborDiscountPct: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Material Discount %</Label>
                                            <Input type="number" value={tierForm.materialDiscountPct} onChange={(e) => setTierForm({ ...tierForm, materialDiscountPct: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Included Visits/yr</Label>
                                            <Input type="number" value={tierForm.includedVisits} onChange={(e) => setTierForm({ ...tierForm, includedVisits: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="priority" checked={tierForm.priorityBooking} onChange={(e) => setTierForm({ ...tierForm, priorityBooking: e.target.checked })} className="rounded" />
                                        <Label htmlFor="priority">Priority Booking</Label>
                                    </div>
                                </div>
                                <DialogFooter><Button onClick={createTier}>Create Tier</Button></DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {(tiers ?? []).map((tier) => (
                            <div key={tier.id} className={cn("surface-card p-6", !tier.active && "opacity-50")}>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Star className="h-4 w-4 text-amber-500" />
                                            <h3 className="font-semibold">{tier.name}</h3>
                                        </div>
                                        <p className="mt-1 text-2xl font-bold">{Number(tier.price).toFixed(0)} <span className="text-sm font-normal text-muted-foreground">/ {tier.interval.toLowerCase()}</span></p>
                                    </div>
                                    {!tier.active && <span className="text-xs text-muted-foreground">Inactive</span>}
                                </div>
                                <div className="mt-4 space-y-2 text-sm">
                                    {tier.laborDiscountPct > 0 && <p className="text-muted-foreground">{tier.laborDiscountPct}% labor discount</p>}
                                    {tier.materialDiscountPct > 0 && <p className="text-muted-foreground">{tier.materialDiscountPct}% material discount</p>}
                                    {tier.includedVisits > 0 && <p className="text-muted-foreground">{tier.includedVisits} included visits/yr</p>}
                                    {tier.priorityBooking && <p className="text-muted-foreground">Priority booking</p>}
                                </div>
                                <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                                    {tier._count.memberships} active members
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* Members List */
                <div className="space-y-4">
                    <div className="surface-card p-3 flex gap-1">
                        {["", "ACTIVE", "PAST_DUE", "CANCELED"].map((s) => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", statusFilter === s ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100")}>
                                {s || "All"}
                            </button>
                        ))}
                    </div>

                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/60 bg-slate-50/50">
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tier</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next Billing</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discounts</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {isLoading ? (
                                    <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                                ) : (memberships ?? []).length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <div className="flex flex-col items-center py-16">
                                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Crown className="h-5 w-5" /></div>
                                                <p className="mt-3 text-sm font-medium">No memberships yet</p>
                                                <p className="text-xs text-muted-foreground mt-1">Create tiers first, then enroll customers.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    (memberships ?? []).map((m) => (
                                        <tr key={m.id} className="hover:bg-slate-50/70 transition">
                                            <td className="px-6 py-3.5">
                                                <p className="font-medium">{m.customer.name}</p>
                                                <p className="text-xs text-muted-foreground">{m.customer.email || m.customer.phone}</p>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span className="inline-flex items-center gap-1.5 text-sm"><Star className="h-3.5 w-3.5 text-amber-500" />{m.tier.name}</span>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span className={cn("status-pill", statusColors[m.status] || "bg-slate-100 text-slate-600")}>
                                                    {m.status === "ACTIVE" ? <CheckCircle2 className="h-3 w-3" /> : m.status === "PAST_DUE" ? <AlertCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    {m.status.replace("_", " ")}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-muted-foreground">
                                                {m.nextBillingDate ? new Date(m.nextBillingDate).toLocaleDateString() : "—"}
                                            </td>
                                            <td className="px-6 py-3.5 text-xs text-muted-foreground">
                                                {m.tier.laborDiscountPct > 0 && <span className="mr-2">{m.tier.laborDiscountPct}% labor</span>}
                                                {m.tier.materialDiscountPct > 0 && <span>{m.tier.materialDiscountPct}% material</span>}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                {m.status === "ACTIVE" && (
                                                    <button onClick={() => cancelMembership(m.id)} className="text-xs text-rose-600 hover:underline">Cancel</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
