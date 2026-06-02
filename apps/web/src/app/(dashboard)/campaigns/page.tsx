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
import { Textarea } from "../../../components/ui/textarea";
import {
    Plus,
    Megaphone,
    Play,
    Pause,
    Mail,
    MessageSquare,
    Send,
    BarChart3,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Campaign {
    id: string;
    name: string;
    type: string;
    status: string;
    channels: string[];
    lastRunAt: string | null;
    createdAt: string;
    _count: { sends: number };
}

const typeLabels: Record<string, string> = {
    UNSOLD_ESTIMATE: "Unsold Estimate Follow-up",
    SEASONAL_REMINDER: "Seasonal Reminder",
    SERVICE_ANNIVERSARY: "Service Anniversary",
    MEMBERSHIP_RENEWAL: "Membership Renewal",
    CUSTOM: "Custom Campaign",
};

const statusColors: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-700",
    DRAFT: "bg-slate-100 text-slate-600",
    COMPLETED: "bg-blue-50 text-blue-700",
};

export default function CampaignsPage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);

    const { data: campaigns, isLoading } = useQuery({
        queryKey: ["campaigns"],
        queryFn: () => api.get("/campaigns").then((r) => r.data.data.campaigns as Campaign[]),
    });

    const [form, setForm] = useState({
        name: "",
        type: "UNSOLD_ESTIMATE",
        channels: ["EMAIL"],
        daysSince: "7",
        templateBody: "",
    });

    const createCampaign = async () => {
        await api.post("/campaigns", {
            name: form.name,
            type: form.type,
            channels: form.channels,
            trigger: { daysSince: parseInt(form.daysSince) },
            template: { body: form.templateBody },
        });
        void qc.invalidateQueries({ queryKey: ["campaigns"] });
        setDialogOpen(false);
        setForm({ name: "", type: "UNSOLD_ESTIMATE", channels: ["EMAIL"], daysSince: "7", templateBody: "" });
    };

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
        await api.put(`/campaigns/${id}`, { status: newStatus });
        void qc.invalidateQueries({ queryKey: ["campaigns"] });
    };

    const deleteCampaign = async (id: string) => {
        await api.delete(`/campaigns/${id}`);
        void qc.invalidateQueries({ queryKey: ["campaigns"] });
    };

    const totalSends = campaigns?.reduce((sum, c) => sum + c._count.sends, 0) ?? 0;
    const activeCampaigns = campaigns?.filter((c) => c.status === "ACTIVE").length ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Campaigns</h1>
                    <p className="page-subtitle">Automated follow-ups and marketing campaigns.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New Campaign</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Campaign Name</Label>
                                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Follow up on unsold estimates" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Campaign Type</Label>
                                    <select className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                        <option value="UNSOLD_ESTIMATE">Unsold Estimate Follow-up</option>
                                        <option value="SEASONAL_REMINDER">Seasonal Reminder</option>
                                        <option value="SERVICE_ANNIVERSARY">Service Anniversary</option>
                                        <option value="MEMBERSHIP_RENEWAL">Membership Renewal</option>
                                        <option value="CUSTOM">Custom</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Days Since Trigger</Label>
                                    <Input type="number" value={form.daysSince} onChange={(e) => setForm({ ...form, daysSince: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Channels</Label>
                                <div className="flex gap-2">
                                    {["EMAIL", "SMS", "WHATSAPP"].map((ch) => (
                                        <button
                                            key={ch}
                                            onClick={() => {
                                                const channels = form.channels.includes(ch) ? form.channels.filter((c) => c !== ch) : [...form.channels, ch];
                                                setForm({ ...form, channels });
                                            }}
                                            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium border transition", form.channels.includes(ch) ? "bg-slate-900 text-white border-slate-900" : "border-border text-muted-foreground hover:bg-slate-50")}
                                        >
                                            {ch === "EMAIL" ? <Mail className="h-3 w-3 inline mr-1" /> : <MessageSquare className="h-3 w-3 inline mr-1" />}
                                            {ch}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Message Template</Label>
                                <Textarea value={form.templateBody} onChange={(e) => setForm({ ...form, templateBody: e.target.value })} placeholder="Hi {customer_name}, we noticed you haven't scheduled your service yet..." rows={4} />
                            </div>
                        </div>
                        <DialogFooter><Button onClick={createCampaign}>Create Campaign</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-indigo-50 text-indigo-600"><Megaphone className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{campaigns?.length ?? 0}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Campaigns</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><Play className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{activeCampaigns}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Active</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><Send className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{totalSends}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Total Sends</p>
                </div>
            </div>

            {/* Campaign List */}
            <div className="surface-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border/60 bg-slate-50/50">
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sends</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {isLoading ? (
                            <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</td></tr>
                        ) : (campaigns ?? []).length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="flex flex-col items-center py-16">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Megaphone className="h-5 w-5" /></div>
                                        <p className="mt-3 text-sm font-medium">No campaigns yet</p>
                                        <p className="text-xs text-muted-foreground mt-1">Create your first automated campaign.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            (campaigns ?? []).map((c) => (
                                <tr key={c.id} className="hover:bg-slate-50/70 transition">
                                    <td className="px-6 py-3.5">
                                        <p className="font-medium">{c.name}</p>
                                        <p className="text-xs text-muted-foreground">Created {new Date(c.createdAt).toLocaleDateString()}</p>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground">{typeLabels[c.type] || c.type}</td>
                                    <td className="px-6 py-3.5">
                                        <span className={cn("status-pill", statusColors[c.status])}>{c.status}</span>
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <div className="flex gap-1">
                                            {c.channels.map((ch) => (
                                                <span key={ch} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{ch}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm font-medium">{c._count.sends}</td>
                                    <td className="px-6 py-3.5">
                                        <div className="flex gap-2">
                                            <button onClick={() => toggleStatus(c.id, c.status)} className="text-xs text-blue-600 hover:underline">
                                                {c.status === "ACTIVE" ? "Pause" : "Activate"}
                                            </button>
                                            <button onClick={() => deleteCampaign(c.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
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
