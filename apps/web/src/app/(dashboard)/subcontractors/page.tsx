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
    HardHat,
    AlertTriangle,
    Shield,
    Phone,
    Mail,
    Wrench,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Subcontractor {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    specialty: string | null;
    licenseNumber: string | null;
    licenseExpiry: string | null;
    insuranceExpiry: string | null;
    hourlyRate: number | null;
    status: string;
    _count: { assignments: number };
}

export default function SubcontractorsPage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);

    const { data: subs, isLoading } = useQuery({
        queryKey: ["subcontractors"],
        queryFn: () => api.get("/subcontractors?includeInactive=true").then((r) => r.data.data.subcontractors as Subcontractor[]),
    });

    const { data: expiring } = useQuery({
        queryKey: ["subcontractors-expiring"],
        queryFn: () => api.get("/subcontractors/expiring-docs").then((r) => r.data.data.subcontractors),
    });

    const [form, setForm] = useState({
        name: "", contactName: "", email: "", phone: "", specialty: "Plumbing",
        licenseNumber: "", hourlyRate: "",
    });

    const createSub = async () => {
        await api.post("/subcontractors", {
            ...form,
            hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
        });
        void qc.invalidateQueries({ queryKey: ["subcontractors"] });
        setDialogOpen(false);
        setForm({ name: "", contactName: "", email: "", phone: "", specialty: "Plumbing", licenseNumber: "", hourlyRate: "" });
    };

    const deactivate = async (id: string) => {
        await api.delete(`/subcontractors/${id}`);
        void qc.invalidateQueries({ queryKey: ["subcontractors"] });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Subcontractors</h1>
                    <p className="page-subtitle">Manage subcontractors, licensing, and payouts.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Subcontractor</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Add Subcontractor</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Company / Name</Label>
                                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Contact Person</Label>
                                    <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Email</Label>
                                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Phone</Label>
                                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Specialty</Label>
                                    <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>License #</Label>
                                    <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Hourly Rate</Label>
                                    <Input type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <DialogFooter><Button onClick={createSub}>Add</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Expiring docs alert */}
            {(expiring ?? []).length > 0 && (
                <div className="surface-card border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" /> Expiring Documents
                    </div>
                    <div className="space-y-1">
                        {(expiring ?? []).map((s: any) => (
                            <p key={s.id} className="text-xs text-amber-800">
                                <span className="font-medium">{s.name}</span> —
                                {s.licenseExpiry && new Date(s.licenseExpiry) <= new Date(Date.now() + 30 * 86400000) && ` License expires ${new Date(s.licenseExpiry).toLocaleDateString()}`}
                                {s.insuranceExpiry && new Date(s.insuranceExpiry) <= new Date(Date.now() + 30 * 86400000) && ` Insurance expires ${new Date(s.insuranceExpiry).toLocaleDateString()}`}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* Grid */}
            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[...Array(6)].map((_, i) => <div key={i} className="surface-card p-5 h-36 animate-pulse" />)}
                </div>
            ) : (subs ?? []).length === 0 ? (
                <div className="surface-card flex flex-col items-center py-16">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><HardHat className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-medium">No subcontractors yet</p>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(subs ?? []).map((s) => (
                        <div key={s.id} className={cn("surface-card p-5", s.status !== "ACTIVE" && "opacity-50")}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-medium">{s.name}</p>
                                    {s.contactName && <p className="text-xs text-muted-foreground">{s.contactName}</p>}
                                </div>
                                <span className={cn("status-pill text-[10px]", s.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                                    {s.status}
                                </span>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                {s.specialty && <div className="flex items-center gap-1.5"><Wrench className="h-3 w-3" />{s.specialty}</div>}
                                {s.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{s.email}</div>}
                                {s.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{s.phone}</div>}
                                {s.licenseNumber && <div className="flex items-center gap-1.5"><Shield className="h-3 w-3" />License: {s.licenseNumber}</div>}
                            </div>
                            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{s._count.assignments} assignments</span>
                                {s.hourlyRate && <span className="font-medium">{Number(s.hourlyRate).toFixed(0)}/hr</span>}
                                {s.status === "ACTIVE" && (
                                    <button onClick={() => deactivate(s.id)} className="text-rose-600 hover:underline">Deactivate</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
