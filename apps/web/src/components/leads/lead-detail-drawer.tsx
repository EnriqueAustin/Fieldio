"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, FileText, Briefcase, Save } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import api from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { STAGES, NOTE_TYPES, formatRand, type Lead, type LeadSource } from "./types";

interface Note {
    id: string;
    type: string;
    body: string;
    createdAt: string;
    user?: { firstName: string | null; lastName: string | null; email: string } | null;
}

interface Props {
    lead: Lead | null;
    onClose: () => void;
    onConvert: (lead: Lead, target: "QUOTE" | "JOB") => void;
}

const OFFICE_ROLES = ["ADMIN", "OFFICE"];

export function LeadDetailDrawer({ lead, onClose, onConvert }: Props) {
    const qc = useQueryClient();
    const role = useAuthStore((s) => s.user?.role);
    const canConvert = !!role && OFFICE_ROLES.includes(role);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [value, setValue] = useState("");
    const [sourceId, setSourceId] = useState("");
    const [noteBody, setNoteBody] = useState("");
    const [noteType, setNoteType] = useState("NOTE");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (lead) {
            setName(lead.name ?? "");
            setPhone(lead.phone ?? "");
            setEmail(lead.email ?? "");
            setValue(lead.leadValue != null ? String(lead.leadValue) : "");
            setSourceId(lead.leadSource?.id ?? lead.leadSourceId ?? "");
            setError(null);
        }
    }, [lead]);

    const { data: sources } = useQuery<LeadSource[]>({
        queryKey: ["lead-sources"],
        queryFn: () => api.get("/leads/sources").then((r) => r.data.data.sources),
        enabled: !!lead,
    });

    const { data: notes } = useQuery<Note[]>({
        queryKey: ["lead-notes", lead?.id],
        queryFn: () => api.get(`/leads/${lead!.id}/notes`).then((r) => r.data.data.notes),
        enabled: !!lead,
    });

    const invalidatePipeline = () => {
        qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
        qc.invalidateQueries({ queryKey: ["leads-funnel"] });
    };

    const save = useMutation({
        mutationFn: () =>
            api.patch(`/leads/${lead!.id}`, {
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                leadValue: value ? Number(value) : null,
                leadSourceId: sourceId || null,
            }),
        onSuccess: () => { invalidatePipeline(); setError(null); },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not save"),
    });

    const moveStage = useMutation({
        mutationFn: (stage: string) => api.patch(`/leads/${lead!.id}/stage`, { stage }),
        onSuccess: () => { invalidatePipeline(); onClose(); },
    });

    const addNote = useMutation({
        mutationFn: () => api.post(`/leads/${lead!.id}/notes`, { type: noteType, body: noteBody.trim() }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["lead-notes", lead?.id] });
            setNoteBody("");
        },
    });

    if (!lead) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative h-full w-full max-w-md overflow-y-auto bg-background shadow-xl p-5 space-y-5">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{lead.name}</h2>
                        <p className="text-xs uppercase tracking-wide text-slate-400">{lead.leadStage}</p>
                    </div>
                    <button onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100"><X className="h-5 w-5" /></button>
                </div>

                {/* Edit fields */}
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="d-name">Name</Label>
                        <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="d-phone">Phone</Label>
                            <Input id="d-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="d-email">Email</Label>
                            <Input id="d-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="d-value">Value (R)</Label>
                            <Input id="d-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="d-source">Source</Label>
                            <select
                                id="d-source"
                                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={sourceId}
                                onChange={(e) => setSourceId(e.target.value)}
                            >
                                <option value="">— none —</option>
                                {(sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save changes
                    </Button>
                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                {/* Move stage */}
                <div className="space-y-2 border-t pt-4">
                    <Label>Move to stage</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {STAGES.filter((s) => s !== lead.leadStage).map((s) => (
                            <button
                                key={s}
                                disabled={moveStage.isPending}
                                onClick={() => moveStage.mutate(s)}
                                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Convert — office only */}
                {canConvert && (
                    <div className="space-y-2 border-t pt-4">
                        <Label>Convert</Label>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => onConvert(lead, "QUOTE")}>
                                <FileText className="mr-2 h-4 w-4" /> Create quote
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => onConvert(lead, "JOB")}>
                                <Briefcase className="mr-2 h-4 w-4" /> Create job
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Converting marks the lead Won.</p>
                    </div>
                )}

                {/* Contact log */}
                <div className="space-y-3 border-t pt-4">
                    <Label>Contact log</Label>
                    <div className="flex gap-2">
                        <select
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={noteType}
                            onChange={(e) => setNoteType(e.target.value)}
                        >
                            {NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <Input
                            className="flex-1 h-9"
                            placeholder="Log a contact attempt…"
                            value={noteBody}
                            onChange={(e) => setNoteBody(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && noteBody.trim()) addNote.mutate(); }}
                        />
                        <Button size="sm" disabled={!noteBody.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Log</Button>
                    </div>
                    <div className="space-y-2">
                        {(notes ?? []).length === 0 && <p className="text-xs text-slate-400 italic">No contact logged yet.</p>}
                        {(notes ?? []).map((n) => (
                            <div key={n.id} className="rounded-lg border p-2.5 text-sm">
                                <div className="flex justify-between text-[11px] text-slate-400 uppercase tracking-wide">
                                    <span>{NOTE_TYPES.find((t) => t.value === n.type)?.label ?? n.type}</span>
                                    <span>{new Date(n.createdAt).toLocaleString("en-ZA")}</span>
                                </div>
                                <div className="mt-1 whitespace-pre-wrap">{n.body}</div>
                                {n.user && (
                                    <div className="mt-1 text-[11px] text-slate-400">
                                        {[n.user.firstName, n.user.lastName].filter(Boolean).join(" ") || n.user.email}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {lead.leadValue != null && (
                    <div className="text-xs text-slate-400 border-t pt-3">Estimated value: {formatRand(lead.leadValue)}</div>
                )}
            </div>
        </div>
    );
}
