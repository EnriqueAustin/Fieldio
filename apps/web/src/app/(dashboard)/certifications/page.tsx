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
    Award,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    User,
    Shield,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Certification {
    id: string;
    name: string;
    issuingBody: string | null;
    certificateNumber: string | null;
    issuedDate: string | null;
    expiryDate: string | null;
    verified: boolean;
    user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

export default function CertificationsPage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);

    const { data: certs, isLoading } = useQuery({
        queryKey: ["certifications"],
        queryFn: () => api.get("/certifications").then((r) => r.data.data.certifications as Certification[]),
    });

    const { data: expiring } = useQuery({
        queryKey: ["certifications-expiring"],
        queryFn: () => api.get("/certifications/expiring?days=60").then((r) => r.data.data.certifications as Certification[]),
    });

    const [form, setForm] = useState({
        userId: "", name: "", issuingBody: "", certificateNumber: "",
        issuedDate: "", expiryDate: "",
    });

    const createCert = async () => {
        await api.post("/certifications", {
            ...form,
            issuedDate: form.issuedDate || undefined,
            expiryDate: form.expiryDate || undefined,
        });
        void qc.invalidateQueries({ queryKey: ["certifications"] });
        void qc.invalidateQueries({ queryKey: ["certifications-expiring"] });
        setDialogOpen(false);
        setForm({ userId: "", name: "", issuingBody: "", certificateNumber: "", issuedDate: "", expiryDate: "" });
    };

    const toggleVerified = async (id: string, current: boolean) => {
        await api.put(`/certifications/${id}`, { verified: !current });
        void qc.invalidateQueries({ queryKey: ["certifications"] });
    };

    const deleteCert = async (id: string) => {
        await api.delete(`/certifications/${id}`);
        void qc.invalidateQueries({ queryKey: ["certifications"] });
    };

    const verifiedCount = certs?.filter((c) => c.verified).length ?? 0;
    const expiringCount = expiring?.length ?? 0;

    const isExpiringSoon = (date: string | null) => {
        if (!date) return false;
        const d = new Date(date);
        return d <= new Date(Date.now() + 60 * 86400000);
    };

    const techName = (c: Certification) =>
        [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Certifications</h1>
                    <p className="page-subtitle">Track technician licenses, certifications, and training.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Certification</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Add Certification</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Technician User ID</Label>
                                <Input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="User ID of the technician" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Certification Name</Label>
                                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gas Safe, City & Guilds" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Issuing Body</Label>
                                    <Input value={form.issuingBody} onChange={(e) => setForm({ ...form, issuingBody: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Certificate Number</Label>
                                <Input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Issued Date</Label>
                                    <Input type="date" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Expiry Date</Label>
                                    <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <DialogFooter><Button onClick={createCert}>Add</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-indigo-50 text-indigo-600"><Award className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{certs?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Certifications</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{verifiedCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Verified</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{expiringCount}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Expiring (60 days)</p>
                </div>
            </div>

            {/* Expiring alert */}
            {expiringCount > 0 && (
                <div className="surface-card border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" /> Certifications Expiring Soon
                    </div>
                    <div className="space-y-1">
                        {(expiring ?? []).slice(0, 5).map((c) => (
                            <p key={c.id} className="text-xs text-amber-800">
                                <span className="font-medium">{techName(c)}</span> — {c.name}
                                {c.expiryDate && ` expires ${new Date(c.expiryDate).toLocaleDateString()}`}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Technician</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Certification</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Issuer</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Certificate #</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expiry</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {isLoading ? (
                            <tr><td colSpan={7} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                        ) : (certs ?? []).length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center py-16">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Award className="h-5 w-5" /></div>
                                        <p className="mt-3 text-sm font-medium">No certifications tracked</p>
                                        <p className="text-xs text-muted-foreground mt-1">Add technician certifications and licenses.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            (certs ?? []).map((c) => (
                                <tr key={c.id} className="hover:bg-slate-50/70 transition">
                                    <td className="px-6 py-3.5">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-medium">
                                                {(c.user.firstName?.[0] || c.user.email[0]).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium">{techName(c)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm font-medium">{c.name}</td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground">{c.issuingBody || "—"}</td>
                                    <td className="px-6 py-3.5 text-sm font-mono text-muted-foreground">{c.certificateNumber || "—"}</td>
                                    <td className="px-6 py-3.5">
                                        {c.expiryDate ? (
                                            <span className={cn("text-sm", isExpiringSoon(c.expiryDate) ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                                                {new Date(c.expiryDate).toLocaleDateString()}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">No expiry</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        {c.verified ? (
                                            <span className="status-pill bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Verified</span>
                                        ) : (
                                            <span className="status-pill bg-slate-100 text-slate-600">Unverified</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <div className="flex gap-2 text-xs">
                                            <button onClick={() => toggleVerified(c.id, c.verified)} className="text-blue-600 hover:underline">
                                                {c.verified ? "Unverify" : "Verify"}
                                            </button>
                                            <button onClick={() => deleteCert(c.id)} className="text-rose-600 hover:underline">Delete</button>
                                        </div>
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
