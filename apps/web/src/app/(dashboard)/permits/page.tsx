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
    ClipboardCheck,
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Permit {
    id: string;
    permitNumber: string | null;
    permitType: string;
    authority: string | null;
    status: string;
    applicationDate: string;
    issueDate: string | null;
    expirationDate: string | null;
    fee: number | null;
    job: { id: string; title: string };
    inspections: Array<{
        id: string;
        scheduledDate: string;
        completedDate: string | null;
        result: string | null;
        inspectorName: string | null;
    }>;
}

const statusColors: Record<string, string> = {
    APPLIED: "bg-blue-50 text-blue-700",
    ISSUED: "bg-indigo-50 text-indigo-700",
    INSPECTION_SCHEDULED: "bg-amber-50 text-amber-700",
    PASSED: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-rose-50 text-rose-700",
    EXPIRED: "bg-slate-100 text-slate-600",
};

export default function PermitsPage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [inspDialogOpen, setInspDialogOpen] = useState<string | null>(null);

    const { data: permits, isLoading } = useQuery({
        queryKey: ["permits"],
        queryFn: () => api.get("/permits").then((r) => r.data.data.permits as Permit[]),
    });

    const { data: upcoming } = useQuery({
        queryKey: ["upcoming-inspections"],
        queryFn: () => api.get("/permits/inspections/upcoming").then((r) => r.data.data.inspections),
    });

    const [form, setForm] = useState({ jobId: "", permitType: "Plumbing", authority: "", fee: "" });
    const [inspForm, setInspForm] = useState({ scheduledDate: "", inspectorName: "" });

    const createPermit = async () => {
        await api.post("/permits", { ...form, fee: form.fee ? parseFloat(form.fee) : undefined });
        void qc.invalidateQueries({ queryKey: ["permits"] });
        setDialogOpen(false);
        setForm({ jobId: "", permitType: "Plumbing", authority: "", fee: "" });
    };

    const addInspection = async (permitId: string) => {
        await api.post(`/permits/${permitId}/inspections`, inspForm);
        void qc.invalidateQueries({ queryKey: ["permits"] });
        void qc.invalidateQueries({ queryKey: ["upcoming-inspections"] });
        setInspDialogOpen(null);
        setInspForm({ scheduledDate: "", inspectorName: "" });
    };

    const passedCount = permits?.filter((p) => p.status === "PASSED").length ?? 0;
    const pendingCount = permits?.filter((p) => ["APPLIED", "ISSUED", "INSPECTION_SCHEDULED"].includes(p.status)).length ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Permits & Inspections</h1>
                    <p className="page-subtitle">Track permit applications and inspections for jobs.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New Permit</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Create Permit</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Job ID</Label>
                                <Input value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} placeholder="Paste job ID" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Permit Type</Label>
                                    <select className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.permitType} onChange={(e) => setForm({ ...form, permitType: e.target.value })}>
                                        <option>Plumbing</option>
                                        <option>Gas</option>
                                        <option>Drainage</option>
                                        <option>Building</option>
                                        <option>Electrical</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Fee</Label>
                                    <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Authority / Municipality</Label>
                                <Input value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
                            </div>
                        </div>
                        <DialogFooter><Button onClick={createPermit}>Create Permit</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><ClipboardCheck className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{permits?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Permits</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600"><Clock className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{pendingCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Pending</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{passedCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Passed</p>
                </div>
            </div>

            {/* Upcoming Inspections */}
            {(upcoming ?? []).length > 0 && (
                <div className="surface-card p-5">
                    <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-500" /> Upcoming Inspections (Next 7 Days)</h2>
                    <div className="space-y-2">
                        {(upcoming ?? []).map((insp: any) => (
                            <div key={insp.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                                <div>
                                    <p className="font-medium">{insp.permit?.job?.title}</p>
                                    <p className="text-xs text-muted-foreground">{insp.permit?.permitType} - {insp.permit?.permitNumber || "No #"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-medium">{new Date(insp.scheduledDate).toLocaleDateString()}</p>
                                    {insp.inspectorName && <p className="text-xs text-muted-foreground">{insp.inspectorName}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Permits Table */}
            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Job</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Permit #</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Inspections</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {isLoading ? (
                            <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                        ) : (permits ?? []).length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="flex flex-col items-center py-16">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><ClipboardCheck className="h-5 w-5" /></div>
                                        <p className="mt-3 text-sm font-medium">No permits yet</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            (permits ?? []).map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50/70 transition">
                                    <td className="px-6 py-3.5">
                                        <p className="font-medium">{p.job.title}</p>
                                        <p className="text-xs text-muted-foreground">{p.authority || "—"}</p>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm">{p.permitType}</td>
                                    <td className="px-6 py-3.5 text-sm font-mono text-muted-foreground">{p.permitNumber || "—"}</td>
                                    <td className="px-6 py-3.5">
                                        <span className={cn("status-pill", statusColors[p.status])}>{p.status.replace(/_/g, " ")}</span>
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <div className="space-y-1">
                                            {p.inspections.length === 0 ? (
                                                <span className="text-xs text-muted-foreground">None</span>
                                            ) : (
                                                p.inspections.map((insp) => (
                                                    <div key={insp.id} className="flex items-center gap-1.5 text-xs">
                                                        {insp.result === "PASS" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> :
                                                         insp.result === "FAIL" ? <XCircle className="h-3 w-3 text-rose-500" /> :
                                                         <Clock className="h-3 w-3 text-amber-500" />}
                                                        {new Date(insp.scheduledDate).toLocaleDateString()}
                                                        {insp.result && <span className="text-muted-foreground">({insp.result})</span>}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <Dialog open={inspDialogOpen === p.id} onOpenChange={(open) => setInspDialogOpen(open ? p.id : null)}>
                                            <DialogTrigger asChild>
                                                <button className="text-xs text-blue-600 hover:underline">+ Inspection</button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Schedule Inspection</DialogTitle></DialogHeader>
                                                <div className="space-y-4">
                                                    <div className="space-y-1.5">
                                                        <Label>Scheduled Date</Label>
                                                        <Input type="datetime-local" value={inspForm.scheduledDate} onChange={(e) => setInspForm({ ...inspForm, scheduledDate: e.target.value })} />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label>Inspector Name</Label>
                                                        <Input value={inspForm.inspectorName} onChange={(e) => setInspForm({ ...inspForm, inspectorName: e.target.value })} />
                                                    </div>
                                                </div>
                                                <DialogFooter><Button onClick={() => addInspection(p.id)}>Schedule</Button></DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
