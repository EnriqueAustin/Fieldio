"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Plus, Building2, Search, Package } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

interface Supplier {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    accountNumber: string | null;
    active: boolean;
    _count: { purchaseOrders: number };
}

interface PurchaseOrder {
    id: string;
    orderNumber: string;
    status: string;
    total: string;
    createdAt: string;
    supplier: { name: string };
    job: { id: string; title: string } | null;
}

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isPODialogOpen, setIsPODialogOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");
    const [form, setForm] = useState({ name: "", contactName: "", email: "", phone: "", accountNumber: "" });
    const [poForm, setPOForm] = useState({ supplierId: "", notes: "", items: [{ name: "", quantity: 1, unitPrice: 0 }] });

    const fetchSuppliers = async () => {
        try {
            const res = await api.get("/suppliers?includeInactive=true");
            setSuppliers(res.data.data.suppliers);
        } catch (e) { console.error(e); }
    };

    const fetchPOs = async () => {
        try {
            const res = await api.get("/suppliers/purchase-orders/all");
            setPurchaseOrders(res.data.data.items);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchSuppliers(); fetchPOs(); }, []);

    const createSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.post("/suppliers", form);
        setForm({ name: "", contactName: "", email: "", phone: "", accountNumber: "" });
        setIsDialogOpen(false);
        fetchSuppliers();
    };

    const createPO = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.post("/suppliers/purchase-orders", {
            supplierId: poForm.supplierId,
            notes: poForm.notes,
            items: poForm.items.filter(i => i.name),
        });
        setIsPODialogOpen(false);
        setPOForm({ supplierId: "", notes: "", items: [{ name: "", quantity: 1, unitPrice: 0 }] });
        fetchPOs();
    };

    const statusColors: Record<string, string> = {
        DRAFT: "bg-slate-100 text-slate-700",
        SENT: "bg-blue-50 text-blue-700",
        RECEIVED: "bg-emerald-50 text-emerald-700",
        PARTIAL: "bg-amber-50 text-amber-700",
        CANCELED: "bg-rose-50 text-rose-700",
    };

    const filtered = suppliers.filter(s =>
        !search || s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Suppliers & Purchase Orders</h1>
                    <p className="page-subtitle">Manage suppliers and track material purchases.</p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2"><Building2 className="h-4 w-4" /> Add supplier</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Add supplier</DialogTitle></DialogHeader>
                            <form onSubmit={createSupplier} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Company name *</Label>
                                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5"><Label>Contact name</Label><Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></div>
                                    <div className="space-y-1.5"><Label>Account #</Label><Input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                                    <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                                </div>
                                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isPODialogOpen} onOpenChange={setIsPODialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-slate-900 hover:bg-slate-800"><Plus className="h-4 w-4" /> New PO</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                            <DialogHeader><DialogTitle>Create purchase order</DialogTitle></DialogHeader>
                            <form onSubmit={createPO} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Supplier *</Label>
                                    <select
                                        value={poForm.supplierId}
                                        onChange={e => setPOForm({ ...poForm, supplierId: e.target.value })}
                                        required
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Select supplier...</option>
                                        {suppliers.filter(s => s.active).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Items</Label>
                                    {poForm.items.map((item, idx) => (
                                        <div key={idx} className="grid grid-cols-6 gap-2">
                                            <Input className="col-span-3" placeholder="Item name" value={item.name}
                                                onChange={e => { const items = [...poForm.items]; items[idx] = { ...items[idx], name: e.target.value }; setPOForm({ ...poForm, items }); }} />
                                            <Input type="number" placeholder="Qty" value={item.quantity}
                                                onChange={e => { const items = [...poForm.items]; items[idx] = { ...items[idx], quantity: Number(e.target.value) }; setPOForm({ ...poForm, items }); }} />
                                            <Input type="number" placeholder="Price" value={item.unitPrice}
                                                onChange={e => { const items = [...poForm.items]; items[idx] = { ...items[idx], unitPrice: Number(e.target.value) }; setPOForm({ ...poForm, items }); }} />
                                            <Button type="button" variant="ghost" size="sm" onClick={() => { const items = poForm.items.filter((_, i) => i !== idx); setPOForm({ ...poForm, items: items.length ? items : [{ name: "", quantity: 1, unitPrice: 0 }] }); }}>×</Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => setPOForm({ ...poForm, items: [...poForm.items, { name: "", quantity: 1, unitPrice: 0 }] })}>+ Add line</Button>
                                </div>
                                <div className="space-y-1.5"><Label>Notes</Label><Input value={poForm.notes} onChange={e => setPOForm({ ...poForm, notes: e.target.value })} /></div>
                                <DialogFooter><Button type="submit">Create PO</Button></DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="flex gap-1 border-b border-border pb-0">
                {(["suppliers", "orders"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-muted-foreground hover:text-slate-700"}`}>
                        {t === "suppliers" ? "Suppliers" : "Purchase Orders"}
                    </button>
                ))}
            </div>

            {tab === "suppliers" && (
                <>
                    <div className="surface-card p-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search suppliers..." className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
                        </div>
                    </div>
                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/60 bg-slate-50/50">
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account #</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Orders</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {filtered.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50/70 transition">
                                        <td className="px-6 py-3.5">
                                            <p className="font-medium">{s.name}</p>
                                            {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                                        </td>
                                        <td className="px-6 py-3.5 text-sm">{s.contactName || "—"}</td>
                                        <td className="px-6 py-3.5 text-sm font-mono text-muted-foreground">{s.accountNumber || "—"}</td>
                                        <td className="px-6 py-3.5 text-sm">{s._count.purchaseOrders}</td>
                                        <td className="px-6 py-3.5">
                                            <span className={`status-pill ${s.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                                {s.active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">No suppliers yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {tab === "orders" && (
                <div className="surface-card overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/60 bg-slate-50/50">
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Order #</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Job</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {purchaseOrders.map(po => (
                                <tr key={po.id} className="hover:bg-slate-50/70 transition">
                                    <td className="px-6 py-3.5 font-mono text-sm font-medium">{po.orderNumber}</td>
                                    <td className="px-6 py-3.5 text-sm">{po.supplier.name}</td>
                                    <td className="px-6 py-3.5 text-sm">{po.job?.title || "—"}</td>
                                    <td className="px-6 py-3.5 text-sm font-medium">R {Number(po.total).toFixed(2)}</td>
                                    <td className="px-6 py-3.5">
                                        <span className={`status-pill ${statusColors[po.status] || ""}`}>{po.status}</span>
                                    </td>
                                    <td className="px-6 py-3.5 text-sm text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                            {purchaseOrders.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />No purchase orders yet
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
