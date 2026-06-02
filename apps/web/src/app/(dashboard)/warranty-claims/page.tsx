"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
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
    Shield,
    AlertTriangle,
    CheckCircle2,
    Clock,
    XCircle,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface WarrantyClaim {
    id: string;
    claimNumber: string | null;
    manufacturer: string | null;
    status: string;
    issueDescription: string;
    submittedDate: string;
    resolvedDate: string | null;
    resolution: string | null;
    propertyAsset: {
        id: string;
        name: string;
        manufacturer: string | null;
        model: string | null;
        serialNumber: string | null;
        warrantyUntil: string | null;
        property: { addressLine1: string; city: string; customer: { name: string } };
    };
}

interface ExpiringAsset {
    id: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    warrantyUntil: string;
    property: { addressLine1: string; city: string; customer: { id: string; name: string } };
}

const statusColors: Record<string, string> = {
    SUBMITTED: "bg-blue-50 text-blue-700",
    IN_REVIEW: "bg-amber-50 text-amber-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    DENIED: "bg-rose-50 text-rose-700",
    FULFILLED: "bg-indigo-50 text-indigo-700",
};

export default function WarrantyClaimsPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState<"claims" | "expiring">("claims");
    const [statusFilter, setStatusFilter] = useState("");

    const { data: claims, isLoading } = useQuery({
        queryKey: ["warranty-claims", statusFilter],
        queryFn: () => api.get(`/warranty-claims${statusFilter ? `?status=${statusFilter}` : ""}`).then((r) => r.data.data.claims as WarrantyClaim[]),
    });

    const { data: expiring } = useQuery({
        queryKey: ["expiring-warranties"],
        queryFn: () => api.get("/warranty-claims/expiring-warranties?days=90").then((r) => r.data.data.assets as ExpiringAsset[]),
    });

    const updateStatus = async (id: string, status: string) => {
        await api.put(`/warranty-claims/${id}`, { status });
        void qc.invalidateQueries({ queryKey: ["warranty-claims"] });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Warranty Claims</h1>
                    <p className="page-subtitle">Track warranty claims and expiring warranties.</p>
                </div>
                <Button variant="outline" onClick={() => setTab(tab === "claims" ? "expiring" : "claims")}>
                    {tab === "claims" ? `Expiring Warranties (${expiring?.length ?? 0})` : "View Claims"}
                </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><Shield className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{claims?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Claims</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600"><Clock className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{claims?.filter((c) => ["SUBMITTED", "IN_REVIEW"].includes(c.status)).length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Pending</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-rose-50 text-rose-600"><AlertTriangle className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{expiring?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Expiring (90 days)</p>
                </div>
            </div>

            {tab === "expiring" ? (
                <div className="surface-card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equipment</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Warranty Expires</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(expiring ?? []).length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-16 text-center text-sm text-muted-foreground">No warranties expiring in the next 90 days</td></tr>
                            ) : (
                                (expiring ?? []).map((a) => (
                                    <tr key={a.id} className="hover:bg-slate-50/70 transition">
                                        <td className="px-6 py-3.5">
                                            <p className="font-medium">{a.name}</p>
                                            <p className="text-xs text-muted-foreground">{[a.manufacturer, a.model].filter(Boolean).join(" - ")}</p>
                                        </td>
                                        <td className="px-6 py-3.5 text-sm">{a.property.customer.name}</td>
                                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{a.property.addressLine1}, {a.property.city}</td>
                                        <td className="px-6 py-3.5">
                                            <span className="text-sm font-medium text-amber-600">{new Date(a.warrantyUntil).toLocaleDateString()}</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <>
                    <div className="surface-card p-3 flex gap-1">
                        {["", "SUBMITTED", "IN_REVIEW", "APPROVED", "DENIED", "FULFILLED"].map((s) => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", statusFilter === s ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100")}>
                                {s || "All"}
                            </button>
                        ))}
                    </div>

                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/60 bg-slate-50/50">
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equipment</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Issue</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submitted</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {isLoading ? (
                                    <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                                ) : (claims ?? []).length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <div className="flex flex-col items-center py-16">
                                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Shield className="h-5 w-5" /></div>
                                                <p className="mt-3 text-sm font-medium">No warranty claims</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    (claims ?? []).map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                                            <td className="px-6 py-3.5">
                                                <p className="font-medium">{c.propertyAsset.name}</p>
                                                <p className="text-xs text-muted-foreground">{[c.manufacturer || c.propertyAsset.manufacturer, c.propertyAsset.model].filter(Boolean).join(" - ")}</p>
                                            </td>
                                            <td className="px-6 py-3.5 text-sm">{c.propertyAsset.property.customer.name}</td>
                                            <td className="px-6 py-3.5 text-sm text-muted-foreground max-w-[200px] truncate">{c.issueDescription}</td>
                                            <td className="px-6 py-3.5">
                                                <span className={cn("status-pill", statusColors[c.status])}>{c.status.replace("_", " ")}</span>
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-muted-foreground">{new Date(c.submittedDate).toLocaleDateString()}</td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex gap-2 text-xs">
                                                    {c.status === "SUBMITTED" && (
                                                        <button onClick={() => updateStatus(c.id, "IN_REVIEW")} className="text-blue-600 hover:underline">Review</button>
                                                    )}
                                                    {c.status === "IN_REVIEW" && (
                                                        <>
                                                            <button onClick={() => updateStatus(c.id, "APPROVED")} className="text-emerald-600 hover:underline">Approve</button>
                                                            <button onClick={() => updateStatus(c.id, "DENIED")} className="text-rose-600 hover:underline">Deny</button>
                                                        </>
                                                    )}
                                                    {c.status === "APPROVED" && (
                                                        <button onClick={() => updateStatus(c.id, "FULFILLED")} className="text-indigo-600 hover:underline">Fulfill</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
