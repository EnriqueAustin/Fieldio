"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import api from "../../lib/api";
import { STAGES, type LeadSource } from "./types";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onManageSources?: () => void;
}

export function NewLeadDialog({ open, onOpenChange, onManageSources }: Props) {
    const qc = useQueryClient();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [value, setValue] = useState("");
    const [sourceId, setSourceId] = useState("");
    const [stage, setStage] = useState<string>("NEW");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);

    const { data: sources } = useQuery<LeadSource[]>({
        queryKey: ["lead-sources"],
        queryFn: () => api.get("/leads/sources").then((r) => r.data.data.sources),
        enabled: open,
    });

    const reset = () => {
        setName(""); setPhone(""); setEmail(""); setValue("");
        setSourceId(""); setStage("NEW"); setNotes(""); setError(null);
    };

    const create = useMutation({
        mutationFn: () =>
            api.post("/leads", {
                name: name.trim(),
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                leadValue: value ? Number(value) : undefined,
                leadSourceId: sourceId || undefined,
                leadStage: stage,
                notes: notes.trim() || undefined,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
            qc.invalidateQueries({ queryKey: ["leads-funnel"] });
            reset();
            onOpenChange(false);
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not create lead"),
    });

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New lead</DialogTitle>
                    <DialogDescription>Capture a prospect and place them on the pipeline.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="lead-name">Name *</Label>
                        <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sipho Dlamini" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-phone">Phone</Label>
                            <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082…" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-email">Email</Label>
                            <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-value">Estimated value (R)</Label>
                            <Input id="lead-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-stage">Stage</Label>
                            <select
                                id="lead-stage"
                                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={stage}
                                onChange={(e) => setStage(e.target.value)}
                            >
                                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="lead-source">Source</Label>
                            {onManageSources && (
                                <button type="button" className="text-xs text-primary hover:underline" onClick={onManageSources}>
                                    Manage sources
                                </button>
                            )}
                        </div>
                        <select
                            id="lead-source"
                            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={sourceId}
                            onChange={(e) => setSourceId(e.target.value)}
                        >
                            <option value="">— none —</option>
                            {(sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="lead-notes">Notes</Label>
                        <Textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                    </div>
                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                        {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Create lead
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
