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
    Wrench,
    Search,
    Clock,
    DollarSign,
    Trash2,
} from "lucide-react";
import { cn } from "../../../lib/utils";

interface Bundle {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    flatPrice: number;
    laborMinutes: number | null;
    items: Array<{ name: string; type: string; quantity: number; unitCost: number }>;
    active: boolean;
}

export default function FlatRatePage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [catFilter, setCatFilter] = useState("");

    const { data: bundles, isLoading } = useQuery({
        queryKey: ["flat-rate-bundles", catFilter],
        queryFn: () => api.get(`/flat-rate${catFilter ? `?category=${encodeURIComponent(catFilter)}` : ""}`).then((r) => r.data.data.bundles as Bundle[]),
    });

    const { data: categories } = useQuery({
        queryKey: ["flat-rate-categories"],
        queryFn: () => api.get("/flat-rate/categories").then((r) => r.data.data.categories as string[]),
    });

    const [form, setForm] = useState({
        name: "", description: "", category: "", flatPrice: "", laborMinutes: "",
        items: [{ name: "", type: "MATERIAL" as string, quantity: 1, unitCost: 0 }],
    });

    const addItem = () => setForm({ ...form, items: [...form.items, { name: "", type: "MATERIAL", quantity: 1, unitCost: 0 }] });
    const removeItem = (i: number) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
    const updateItem = (i: number, field: string, value: any) => {
        const items = [...form.items];
        (items[i] as any)[field] = value;
        setForm({ ...form, items });
    };

    const createBundle = async () => {
        await api.post("/flat-rate", {
            name: form.name,
            description: form.description || undefined,
            category: form.category || undefined,
            flatPrice: parseFloat(form.flatPrice),
            laborMinutes: form.laborMinutes ? parseInt(form.laborMinutes) : undefined,
            items: form.items.filter((i) => i.name),
        });
        void qc.invalidateQueries({ queryKey: ["flat-rate-bundles"] });
        void qc.invalidateQueries({ queryKey: ["flat-rate-categories"] });
        setDialogOpen(false);
    };

    const deactivate = async (id: string) => {
        await api.delete(`/flat-rate/${id}`);
        void qc.invalidateQueries({ queryKey: ["flat-rate-bundles"] });
    };

    const filtered = (bundles ?? []).filter((b) =>
        query ? b.name.toLowerCase().includes(query.toLowerCase()) : true
    );

    const calcMargin = (bundle: Bundle) => {
        const totalCost = (bundle.items || []).reduce((s, i) => s + i.unitCost * i.quantity, 0);
        const flatPrice = Number(bundle.flatPrice);
        const profit = flatPrice - totalCost;
        return flatPrice > 0 ? Math.round((profit / flatPrice) * 100) : 0;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Flat-Rate Bundles</h1>
                    <p className="page-subtitle">Pre-packaged service bundles with all-inclusive pricing.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New Bundle</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Create Flat-Rate Bundle</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Bundle Name</Label>
                                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Replace Kitchen Faucet" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Category</Label>
                                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Faucets, Water Heaters" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Description</Label>
                                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Flat Price (customer sees this)</Label>
                                    <Input type="number" value={form.flatPrice} onChange={(e) => setForm({ ...form, flatPrice: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Est. Labor (minutes)</Label>
                                    <Input type="number" value={form.laborMinutes} onChange={(e) => setForm({ ...form, laborMinutes: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label>Cost Breakdown (internal only)</Label>
                                    <button onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add item</button>
                                </div>
                                <div className="space-y-2">
                                    {form.items.map((item, i) => (
                                        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
                                            <Input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Item name" />
                                            <select className="rounded-lg border border-border px-2 py-2 text-sm w-24" value={item.type} onChange={(e) => updateItem(i, "type", e.target.value)}>
                                                <option value="MATERIAL">Material</option>
                                                <option value="LABOR">Labor</option>
                                                <option value="SERVICE">Service</option>
                                            </select>
                                            <Input type="number" className="w-16" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)} />
                                            <Input type="number" className="w-20" value={item.unitCost} onChange={(e) => updateItem(i, "unitCost", parseFloat(e.target.value) || 0)} />
                                            <button onClick={() => removeItem(i)} className="p-2 text-rose-500 hover:bg-rose-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter><Button onClick={createBundle}>Create Bundle</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Toolbar */}
            <div className="surface-card p-3 flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bundles..." className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setCatFilter("")} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", !catFilter ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100")}>All</button>
                    {(categories ?? []).map((cat) => (
                        <button key={cat} onClick={() => setCatFilter(cat!)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", catFilter === cat ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-slate-100")}>{cat}</button>
                    ))}
                </div>
            </div>

            {/* Bundles Grid */}
            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[...Array(6)].map((_, i) => <div key={i} className="surface-card p-5 h-40 animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="surface-card flex flex-col items-center py-16">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Wrench className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-medium">No bundles yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Create flat-rate task bundles for common plumbing jobs.</p>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((b) => {
                        const margin = calcMargin(b);
                        return (
                            <div key={b.id} className="surface-card p-5">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-medium">{b.name}</p>
                                        {b.category && <span className="inline-block mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{b.category}</span>}
                                    </div>
                                    <p className="text-lg font-bold">{Number(b.flatPrice).toFixed(0)}</p>
                                </div>
                                {b.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
                                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                                    {b.laborMinutes && (
                                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{b.laborMinutes} min</span>
                                    )}
                                    <span className={cn("flex items-center gap-1 font-medium", margin >= 40 ? "text-emerald-600" : margin >= 20 ? "text-amber-600" : "text-rose-600")}>
                                        {margin}% margin
                                    </span>
                                    <span>{(b.items || []).length} items</span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-border/60 flex justify-end">
                                    <button onClick={() => deactivate(b.id)} className="text-xs text-rose-600 hover:underline">Deactivate</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
