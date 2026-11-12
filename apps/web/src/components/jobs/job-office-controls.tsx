"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, XCircle, RotateCcw, CalendarClock } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { ReassignDialog } from "@/components/schedule/reassign-dialog";

interface Tech {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
}

interface VanTeam {
    id: string;
    name: string;
    active?: boolean;
}

interface OfficeJob {
    id: string;
    title: string;
    description?: string | null;
    priority?: string | null;
    status: string;
    techId?: string | null;
    vanId?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    invoice?: { id: string } | null;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "EMERGENCY"] as const;

export function JobOfficeControls({
    job,
    role,
    onChanged,
}: {
    job: OfficeJob;
    role: string;
    onChanged: () => void;
}) {
    const queryClient = useQueryClient();
    const [editOpen, setEditOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [reopenOpen, setReopenOpen] = useState(false);
    const [reassignOpen, setReassignOpen] = useState(false);

    const [editForm, setEditForm] = useState({
        title: job.title,
        description: job.description ?? "",
        priority: (job.priority as string) ?? "MEDIUM",
        notes: "",
    });
    const [cancelReason, setCancelReason] = useState("");
    const [reopenReason, setReopenReason] = useState("");

    // ADMIN / OFFICE may reopen; cancel is ADMIN / OFFICE / DISPATCHER.
    const canReopen = role === "ADMIN" || role === "OFFICE";
    const isCanceled = job.status === "CANCELED";
    const isCompleted = job.status === "COMPLETED";
    // A finished job can only be reopened while it has not been invoiced.
    const reopenable = isCanceled || (isCompleted && !job.invoice);
    const cancelable = !isCanceled && !isCompleted;

    // Technician + van pickers for the reassign dialog, loaded on demand.
    const { data: techs = [] } = useQuery<Tech[]>({
        queryKey: ["users", "technicians"],
        queryFn: () =>
            api.get("/users").then((r) =>
                (r.data.data.users as Tech[]).filter((u) => u.role === "TECHNICIAN")
            ),
        enabled: reassignOpen,
    });
    const { data: vans = [] } = useQuery<VanTeam[]>({
        queryKey: ["vans", "active"],
        queryFn: () =>
            api
                .get("/vans")
                .then((r) => (r.data.data.vans ?? []).filter((v: VanTeam) => v.active))
                .catch(() => []),
        enabled: reassignOpen,
    });

    const invalidate = () => {
        onChanged();
        void queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    };

    const saveEdit = useMutation({
        mutationFn: async () => {
            await api.patch(`/jobs/${job.id}`, {
                title: editForm.title,
                description: editForm.description,
                priority: editForm.priority,
            });
            // Jobs have no notes column: an internal note is a JobNote, added
            // through the notes endpoint and shown in the job's notes list.
            const note = editForm.notes.trim();
            if (note) await api.post(`/jobs/${job.id}/notes`, { message: note });
        },
        onSuccess: () => {
            toast({ title: "Job updated" });
            setEditOpen(false);
            invalidate();
        },
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Could not update the job",
                variant: "destructive",
            }),
    });

    const cancelJob = useMutation({
        mutationFn: () => api.post(`/jobs/${job.id}/cancel`, { reason: cancelReason.trim() }),
        onSuccess: () => {
            toast({ title: "Job cancelled" });
            setCancelOpen(false);
            setCancelReason("");
            invalidate();
        },
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Could not cancel the job",
                variant: "destructive",
            }),
    });

    const reopenJob = useMutation({
        mutationFn: () => api.post(`/jobs/${job.id}/reopen`, { reason: reopenReason.trim() }),
        onSuccess: () => {
            toast({ title: "Job reopened" });
            setReopenOpen(false);
            setReopenReason("");
            invalidate();
        },
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Could not reopen the job",
                variant: "destructive",
            }),
    });

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                        setEditForm({
                            title: job.title,
                            description: job.description ?? "",
                            priority: (job.priority as string) ?? "MEDIUM",
                            notes: "",
                        });
                        setEditOpen(true);
                    }}
                >
                    <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setReassignOpen(true)}
                >
                    <CalendarClock className="h-4 w-4" /> Reschedule / reassign
                </Button>
                {cancelable && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-rose-600 hover:text-rose-700"
                        onClick={() => setCancelOpen(true)}
                    >
                        <XCircle className="h-4 w-4" /> Cancel job
                    </Button>
                )}
                {canReopen && reopenable && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setReopenOpen(true)}
                    >
                        <RotateCcw className="h-4 w-4" /> Reopen
                    </Button>
                )}
            </div>

            {/* Edit */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit job</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="job-title">Title</Label>
                            <Input
                                id="job-title"
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="job-priority">Priority</Label>
                            <select
                                id="job-priority"
                                value={editForm.priority}
                                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                        {p.charAt(0) + p.slice(1).toLowerCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="job-description">Description</Label>
                            <Textarea
                                id="job-description"
                                rows={3}
                                value={editForm.description}
                                onChange={(e) =>
                                    setEditForm({ ...editForm, description: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="job-notes">Add an internal note</Label>
                            <Textarea
                                id="job-notes"
                                rows={2}
                                placeholder="Optional — visible to the office only"
                                value={editForm.notes}
                                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => saveEdit.mutate()}
                            disabled={!editForm.title.trim() || saveEdit.isPending}
                        >
                            {saveEdit.isPending ? "Saving…" : "Save changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel */}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancel this job</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            A reason is recorded on the job and helps the office track why work
                            fell away.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="cancel-reason">Reason</Label>
                            <Textarea
                                id="cancel-reason"
                                rows={3}
                                placeholder="e.g. Customer rescheduled / duplicate booking"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)}>
                            Keep job
                        </Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700"
                            onClick={() => cancelJob.mutate()}
                            disabled={!cancelReason.trim() || cancelJob.isPending}
                        >
                            {cancelJob.isPending ? "Cancelling…" : "Cancel job"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reopen */}
            <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reopen this job</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="reopen-reason">Reason</Label>
                            <Textarea
                                id="reopen-reason"
                                rows={3}
                                placeholder="e.g. Customer called back / follow-up needed"
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReopenOpen(false)}>
                            Close
                        </Button>
                        <Button
                            onClick={() => reopenJob.mutate()}
                            disabled={!reopenReason.trim() || reopenJob.isPending}
                        >
                            {reopenJob.isPending ? "Reopening…" : "Reopen job"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reschedule / reassign — reuses the schedule board's dialog */}
            <ReassignDialog
                open={reassignOpen}
                onClose={() => setReassignOpen(false)}
                jobId={reassignOpen ? job.id : null}
                currentTechId={job.techId}
                currentVanId={job.vanId}
                currentStart={job.scheduledStart}
                currentEnd={job.scheduledEnd}
                techs={techs}
                vans={vans}
                onReassigned={invalidate}
            />
        </>
    );
}
