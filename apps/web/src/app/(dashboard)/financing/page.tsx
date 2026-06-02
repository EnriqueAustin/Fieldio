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
    CreditCard,
    DollarSign,
    CheckCircle2,
    Clock,
    XCircle,
    Percent,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface FinancingOption {
    id: string;
    name: string;
    provider: string | null;
    termMonths: number;
    interestRate: number;
    minAmount: number;
    maxAmount: number | null;
    active: boolean;
}

interface Application {
    id: string;
    amount: number;
    status: string;
    monthlyPayment: number | null;
    createdAt: string;
    customer: { id: string; name: string; email: string | null };
    financingOption: { id: string; name: string; termMonths: number; interestRate: number };
}

const statusColors: Record<string, string> = {
    OFFERED: "bg-slate-100 text-slate-600",
    APPLIED: "bg-blue-50 text-blue-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    DECLINED: "bg-rose-50 text-rose-700",
    ACTIVE: "bg-indigo-50 text-indigo-700",
    PAID_OFF: "bg-emerald-50 text-emerald-700",
    DEFAULTED: "bg-rose-50 text-rose-700",
};

export default function FinancingPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState<"applications" | "options">("applications");
    const [optionDialogOpen, setOptionDialogOpen] = useState(false);

    const { data: options } = useQuery({
        queryKey: ["financing-options"],
        queryFn: () => api.get("/financing/options?includeInactive=true").then((r) => r.data.data.options as FinancingOption[]),
    });

    const { data: applications, isLoading } = useQuery({
        queryKey: ["financing-applications"],
        queryFn: () => api.get("/financing/applications").then((r) => r.data.data.applications as Application[]),
    });

    const [optForm, setOptForm] = useState({
        name: "", provider: "", termMonths: "12", interestRate: "0", minAmount: "500", maxAmount: "",
    });

    const createOption = async () => {
        await api.post("/financing/options", {
            ...optForm,
            termMonths: parseInt(optForm.termMonths),
            interestRate: parseFloat(optForm.interestRate),
            minAmount: parseFloat(optForm.minAmount),
            maxAmount: optForm.maxAmount ? parseFloat(optForm.maxAmount) : undefined,
        });
        void qc.invalidateQueries({ queryKey: ["financing-options"] });
        setOptionDialogOpen(false);
        setOptForm({ name: "", provider: "", termMonths: "12", interestRate: "0", minAmount: "500", maxAmount: "" });
    };

    const updateAppStatus = async (id: string, status: string) => {
        await api.put(`/financing/applications/${id}`, { status });
        void qc.invalidateQueries({ queryKey: ["financing-applications"] });
    };

    const totalFinanced = applications?.filter((a) => ["APPROVED", "ACTIVE"].includes(a.status)).reduce((sum, a) => sum + Number(a.amount), 0) ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Customer Financing</h1>
                    <p className="page-subtitle">Payment plans and financing options for customers.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setTab(tab === "applications" ? "options" : "applications")}>
                        {tab === "applications" ? "Manage Options" : "View Applications"}
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><CreditCard className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{options?.filter((o) => o.active).length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Active Plans</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-indigo-50 text-indigo-600"><DollarSign className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{totalFinanced.toFixed(0)}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Financed</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{applications?.filter((a) => a.status === "APPROVED").length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Approved</p>
                </div>
            </div>

            {tab === "options" ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Financing Options</h2>
                        <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New Option</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Create Financing Option</DialogTitle></DialogHeader>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>Plan Name</Label>
                                            <Input value={optForm.name} onChange={(e) => setOptForm({ ...optForm, name: e.target.value })} placeholder="e.g. 12-Month Plan" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Provider</Label>
                                            <Input value={optForm.provider} onChange={(e) => setOptForm({ ...optForm, provider: e.target.value })} placeholder="e.g. In-House, Wisetack" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>Term (months)</Label>
                                            <Input type="number" value={optForm.termMonths} onChange={(e) => setOptForm({ ...optForm, termMonths: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Interest Rate %</Label>
                                            <Input type="number" step="0.1" value={optForm.interestRate} onChange={(e) => setOptForm({ ...optForm, interestRate: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>Min Amount</Label>
                                            <Input type="number" value={optForm.minAmount} onChange={(e) => setOptForm({ ...optForm, minAmount: e.target.value })} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Max Amount (optional)</Label>
                                            <Input type="number" value={optForm.maxAmount} onChange={(e) => setOptForm({ ...optForm, maxAmount: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter><Button onClick={createOption}>Create Option</Button></DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {(options ?? []).map((opt) => (
                            <div key={opt.id} className={cn("surface-card p-5", !opt.active && "opacity-50")}>
                                <h3 className="font-semibold">{opt.name}</h3>
                                {opt.provider && <p className="text-xs text-muted-foreground mt-0.5">{opt.provider}</p>}
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    <div><span className="text-muted-foreground">Term:</span> <span className="font-medium">{opt.termMonths} mo</span></div>
                                    <div><span className="text-muted-foreground">Rate:</span> <span className="font-medium">{opt.interestRate}%</span></div>
                                    <div><span className="text-muted-foreground">Min:</span> <span className="font-medium">{Number(opt.minAmount).toFixed(0)}</span></div>
                                    {opt.maxAmount && <div><span className="text-muted-foreground">Max:</span> <span className="font-medium">{Number(opt.maxAmount).toFixed(0)}</span></div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="surface-card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {isLoading ? (
                                <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                            ) : (applications ?? []).length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex flex-col items-center py-16">
                                            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><CreditCard className="h-5 w-5" /></div>
                                            <p className="mt-3 text-sm font-medium">No financing applications yet</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                (applications ?? []).map((app) => (
                                    <tr key={app.id} className="hover:bg-slate-50/70 transition">
                                        <td className="px-6 py-3.5">
                                            <p className="font-medium">{app.customer.name}</p>
                                            <p className="text-xs text-muted-foreground">{app.customer.email}</p>
                                        </td>
                                        <td className="px-6 py-3.5 text-sm">
                                            <p>{app.financingOption.name}</p>
                                            <p className="text-xs text-muted-foreground">{app.financingOption.termMonths}mo @ {app.financingOption.interestRate}%</p>
                                        </td>
                                        <td className="px-6 py-3.5 text-sm font-medium">{Number(app.amount).toFixed(2)}</td>
                                        <td className="px-6 py-3.5 text-sm">{app.monthlyPayment ? Number(app.monthlyPayment).toFixed(2) : "—"}</td>
                                        <td className="px-6 py-3.5">
                                            <span className={cn("status-pill", statusColors[app.status])}>{app.status.replace("_", " ")}</span>
                                        </td>
                                        <td className="px-6 py-3.5">
                                            <div className="flex gap-2 text-xs">
                                                {app.status === "APPLIED" && (
                                                    <>
                                                        <button onClick={() => updateAppStatus(app.id, "APPROVED")} className="text-emerald-600 hover:underline">Approve</button>
                                                        <button onClick={() => updateAppStatus(app.id, "DECLINED")} className="text-rose-600 hover:underline">Decline</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
