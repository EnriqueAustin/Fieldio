"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { toast } from "../ui/use-toast";

interface Tech {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
}

interface VanTeam {
    id: string;
    name: string;
}

interface ReassignDialogProps {
    open: boolean;
    onClose: () => void;
    jobId: string | null;
    currentTechId?: string | null;
    currentVanId?: string | null;
    currentStart?: string | null;
    currentEnd?: string | null;
    techs: Tech[];
    vans: VanTeam[];
    onReassigned?: () => void;
}

const techLabel = (t: Tech) =>
    [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email.split("@")[0];

export function ReassignDialog({
    open,
    onClose,
    jobId,
    currentTechId,
    currentVanId,
    currentStart,
    currentEnd,
    techs,
    vans,
    onReassigned,
}: ReassignDialogProps) {
    const queryClient = useQueryClient();
    const [assignmentType, setAssignmentType] = useState<"tech" | "van" | "unassign">(
        currentVanId ? "van" : currentTechId ? "tech" : "tech"
    );
    const [techId, setTechId] = useState(currentTechId ?? "");
    const [vanId, setVanId] = useState(currentVanId ?? "");
    const [scheduledStart, setScheduledStart] = useState(
        currentStart ? currentStart.slice(0, 16) : ""
    );
    const [scheduledEnd, setScheduledEnd] = useState(
        currentEnd ? currentEnd.slice(0, 16) : ""
    );

    const mutation = useMutation({
        mutationFn: async () => {
            if (!jobId) return;
            const payload: Record<string, unknown> = {};
            if (assignmentType === "tech") {
                payload.techId = techId || null;
                payload.vanId = null;
            } else if (assignmentType === "van") {
                payload.vanId = vanId || null;
                payload.techId = null;
            } else {
                payload.techId = null;
                payload.vanId = null;
            }
            if (scheduledStart) payload.scheduledStart = new Date(scheduledStart).toISOString();
            if (scheduledEnd) payload.scheduledEnd = new Date(scheduledEnd).toISOString();
            await api.patch(`/schedule/jobs/${jobId}`, payload);
        },
        onSuccess: async () => {
            toast({ title: "Job re-assigned" });
            await queryClient.invalidateQueries({ queryKey: ["unscheduled-jobs"] });
            onReassigned?.();
            onClose();
        },
        onError: (err: any) => {
            const msg = err?.response?.data?.message || "Could not re-assign job";
            toast({ title: msg, variant: "destructive" });
        },
    });

    if (!jobId) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Re-assign job</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Assign to</Label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setAssignmentType("tech")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                    assignmentType === "tech"
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-border hover:bg-slate-50"
                                }`}
                            >
                                Technician
                            </button>
                            <button
                                type="button"
                                onClick={() => setAssignmentType("van")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                    assignmentType === "van"
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-border hover:bg-slate-50"
                                }`}
                            >
                                Van team
                            </button>
                            <button
                                type="button"
                                onClick={() => setAssignmentType("unassign")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                    assignmentType === "unassign"
                                        ? "border-rose-600 bg-rose-50 text-rose-700"
                                        : "border-border hover:bg-slate-50"
                                }`}
                            >
                                Unassign
                            </button>
                        </div>
                    </div>

                    {assignmentType === "tech" && (
                        <div className="space-y-2">
                            <Label htmlFor="re-tech">Technician</Label>
                            <select
                                id="re-tech"
                                value={techId}
                                onChange={(e) => setTechId(e.target.value)}
                                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Select technician</option>
                                {techs.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {techLabel(t)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {assignmentType === "van" && (
                        <div className="space-y-2">
                            <Label htmlFor="re-van">Van team</Label>
                            <select
                                id="re-van"
                                value={vanId}
                                onChange={(e) => setVanId(e.target.value)}
                                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Select van</option>
                                {vans.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="re-start">Start</Label>
                            <Input
                                id="re-start"
                                type="datetime-local"
                                value={scheduledStart}
                                onChange={(e) => setScheduledStart(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="re-end">End</Label>
                            <Input
                                id="re-end"
                                type="datetime-local"
                                value={scheduledEnd}
                                onChange={(e) => setScheduledEnd(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => mutation.mutate()}
                        disabled={
                            mutation.isPending ||
                            (assignmentType === "tech" && !techId) ||
                            (assignmentType === "van" && !vanId)
                        }
                    >
                        {mutation.isPending ? "Saving…" : "Re-assign"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
