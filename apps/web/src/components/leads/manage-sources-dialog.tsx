"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Archive, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import api from "../../lib/api";
import { formatRand } from "./types";

interface Source {
    id: string;
    name: string;
    costPerMonth: number;
    active: boolean;
}

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}

export function ManageSourcesDialog({ open, onOpenChange }: Props) {
    const qc = useQueryClient();
    const [name, setName] = useState("");
    const [cost, setCost] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editCost, setEditCost] = useState("");
    const [error, setError] = useState<string | null>(null);

    const { data: sources, isLoading } = useQuery<Source[]>({
        queryKey: ["lead-sources"],
        queryFn: () => api.get("/leads/sources").then((r) => r.data.data.sources),
        enabled: open,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["lead-sources"] });
        qc.invalidateQueries({ queryKey: ["leads-funnel"] });
    };

    const create = useMutation({
        mutationFn: () => api.post("/leads/sources", { name: name.trim(), costPerMonth: cost ? Number(cost) : 0 }),
        onSuccess: () => { invalidate(); setName(""); setCost(""); setError(null); },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not add source (name may already exist)"),
    });

    const update = useMutation({
        mutationFn: (vars: { id: string }) =>
            api.patch(`/leads/sources/${vars.id}`, { name: editName.trim(), costPerMonth: editCost ? Number(editCost) : 0 }),
        onSuccess: () => { invalidate(); setEditId(null); setError(null); },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not update source"),
    });

    const archive = useMutation({
        mutationFn: (id: string) => api.delete(`/leads/sources/${id}`),
        onSuccess: invalidate,
    });

    const startEdit = (s: Source) => {
        setEditId(s.id);
        setEditName(s.name);
        setEditCost(String(Number(s.costPerMonth)));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Lead sources</DialogTitle>
                    <DialogDescription>
                        Track where leads come from and their monthly spend — this drives the Marketing ROI table.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-lg border divide-y">
                        {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
                        {!isLoading && (sources ?? []).length === 0 && (
                            <div className="p-3 text-sm text-muted-foreground italic">No sources yet. Add your first below.</div>
                        )}
                        {(sources ?? []).map((s) => (
                            <div key={s.id} className="flex items-center gap-2 p-2.5 text-sm">
                                {editId === s.id ? (
                                    <>
                                        <Input className="flex-1 h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                                        <Input className="w-24 h-8" type="number" min={0} value={editCost} onChange={(e) => setEditCost(e.target.value)} />
                                        <Button size="icon" className="h-8 w-8" disabled={!editName.trim() || update.isPending} onClick={() => update.mutate({ id: s.id })}>
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 font-medium">{s.name}</span>
                                        <span className="text-muted-foreground tabular-nums">{formatRand(s.costPerMonth)}/mo</span>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(s)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Archive" onClick={() => archive.mutate(s.id)}>
                                            <Archive className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                        <Label>Add a source</Label>
                        <div className="flex items-end gap-2">
                            <div className="flex-1 space-y-1">
                                <Input placeholder="e.g. Google Ads, Referral" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="w-28 space-y-1">
                                <Input type="number" min={0} placeholder="R / month" value={cost} onChange={(e) => setCost(e.target.value)} />
                            </div>
                            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
