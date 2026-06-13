"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
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
    Truck,
    Users,
    Package,
    Briefcase,
    UserPlus,
    X,
    Crown,
    Wrench,
    AlertCircle,
} from "lucide-react";
import { toast } from "../../../components/ui/use-toast";

interface VanMember {
    id: string;
    role: "DRIVER" | "MEMBER";
    user: {
        id: string;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
        role: string;
        status?: string;
    };
}

interface Van {
    id: string;
    name: string;
    registration?: string | null;
    active: boolean;
    odometerKm?: number | null;
    nextServiceKm?: number | null;
    nextServiceAt?: string | null;
    lastServiceAt?: string | null;
    members: VanMember[];
    _count: { jobs: number; inventory: number };
}

interface TeamUser {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    status: string;
}

function userName(u: { email: string; firstName?: string | null; lastName?: string | null }) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
    return name || u.email.split("@")[0];
}

export default function VansPage() {
    const qc = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [addMemberVanId, setAddMemberVanId] = useState<string | null>(null);
    const [newVan, setNewVan] = useState({ name: "", registration: "" });
    const [selectedUserId, setSelectedUserId] = useState("");
    const [selectedRole, setSelectedRole] = useState<"DRIVER" | "MEMBER">("MEMBER");
    const [serviceVan, setServiceVan] = useState<Van | null>(null);
    const [svcType, setSvcType] = useState<"SERVICE" | "ODOMETER" | "FUEL" | "REPAIR">("SERVICE");
    const [svcOdo, setSvcOdo] = useState("");
    const [svcCost, setSvcCost] = useState("");
    const [svcDesc, setSvcDesc] = useState("");
    const [svcNextKm, setSvcNextKm] = useState("");
    const [svcNextAt, setSvcNextAt] = useState("");

    const { data: vans = [] } = useQuery<Van[]>({
        queryKey: ["vans"],
        queryFn: () => api.get("/vans").then((r) => r.data.data.vans),
    });

    const { data: teamUsers = [] } = useQuery<TeamUser[]>({
        queryKey: ["team-users"],
        queryFn: () => api.get("/users").then((r) => r.data.data.users),
    });

    const techs = teamUsers.filter((u) => u.role === "TECHNICIAN" && u.status === "ACTIVE");

    const createMutation = useMutation({
        mutationFn: (data: { name: string; registration?: string }) => api.post("/vans", data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["vans"] });
            setCreateOpen(false);
            setNewVan({ name: "", registration: "" });
        },
        onError: () => toast({ title: "Failed to create van", variant: "destructive" }),
    });

    const addMemberMutation = useMutation({
        mutationFn: ({ vanId, ...body }: { vanId: string; userId: string; role: string }) =>
            api.post(`/vans/${vanId}/members`, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["vans"] });
            setAddMemberVanId(null);
            setSelectedUserId("");
            setSelectedRole("MEMBER");
        },
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Failed to add member",
                variant: "destructive",
            }),
    });

    const removeMemberMutation = useMutation({
        mutationFn: ({ vanId, userId }: { vanId: string; userId: string }) =>
            api.delete(`/vans/${vanId}/members/${userId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["vans"] }),
    });

    const addServiceLog = useMutation({
        mutationFn: ({ vanId, payload }: { vanId: string; payload: any }) =>
            api.post(`/vans/${vanId}/service-logs`, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["vans"] });
            setServiceVan(null);
            setSvcOdo(""); setSvcCost(""); setSvcDesc(""); setSvcNextKm(""); setSvcNextAt("");
            setSvcType("SERVICE");
            toast({ title: "Service log saved" });
        },
        onError: (e: any) => toast({ title: e?.response?.data?.message || "Failed to save", variant: "destructive" }),
    });

    const submitServiceLog = () => {
        if (!serviceVan) return;
        const payload: any = { type: svcType };
        if (svcOdo) payload.odometerKm = parseInt(svcOdo);
        if (svcCost) payload.cost = parseFloat(svcCost);
        if (svcDesc) payload.description = svcDesc;
        if (svcNextKm) payload.nextServiceKm = parseInt(svcNextKm);
        if (svcNextAt) payload.nextServiceAt = new Date(svcNextAt).toISOString();
        addServiceLog.mutate({ vanId: serviceVan.id, payload });
    };

    const serviceStatus = (v: Van) => {
        const now = Date.now();
        const reasons: string[] = [];
        if (v.nextServiceAt) {
            const due = new Date(v.nextServiceAt).getTime();
            if (due < now) reasons.push(`overdue ${new Date(v.nextServiceAt).toLocaleDateString()}`);
            else if (due - now < 14 * 86400000) reasons.push(`due ${new Date(v.nextServiceAt).toLocaleDateString()}`);
        }
        if (v.nextServiceKm != null && v.odometerKm != null) {
            const rem = v.nextServiceKm - v.odometerKm;
            if (rem <= 0) reasons.push(`${Math.abs(rem)} km over`);
            else if (rem <= 500) reasons.push(`${rem} km until service`);
        }
        return reasons;
    };

    const alreadyAssigned = new Set(vans.flatMap((v) => v.members.map((m) => m.user.id)));
    const availableTechs = techs.filter((t) => !alreadyAssigned.has(t.id));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Vans &amp; Teams</h1>
                    <p className="page-subtitle">
                        Manage your fleet, assign technicians to vans, and track stock per vehicle.
                    </p>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800">
                            <Plus className="h-4 w-4" /> Add van
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add a new van</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Van name</Label>
                                <Input
                                    placeholder='e.g. "Van 1" or "CT-45678"'
                                    value={newVan.name}
                                    onChange={(e) => setNewVan({ ...newVan, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Registration (optional)</Label>
                                <Input
                                    placeholder="CA 123-456"
                                    value={newVan.registration}
                                    onChange={(e) => setNewVan({ ...newVan, registration: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={() => createMutation.mutate({
                                    name: newVan.name,
                                    registration: newVan.registration || undefined,
                                })}
                                disabled={!newVan.name || createMutation.isPending}
                            >
                                Create van
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-blue-50 text-blue-600"><Truck className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">{vans.filter(v => v.active).length}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Active vans</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-emerald-50 text-emerald-600"><Users className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">
                            {vans.reduce((s, v) => s + v.members.length, 0)}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Assigned technicians</p>
                </div>
                <div className="surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="icon-tile bg-violet-50 text-violet-600"><Package className="h-5 w-5" /></div>
                        <span className="text-2xl font-semibold">
                            {vans.reduce((s, v) => s + v._count.inventory, 0)}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-medium">Items on vans</p>
                </div>
            </div>

            {vans.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Truck className="h-10 w-10 text-slate-300" />
                        <p className="mt-3 text-sm font-medium">No vans yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Create a van and assign technicians to start dispatching by team.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {vans.map((van) => {
                        const driver = van.members.find((m) => m.role === "DRIVER");
                        return (
                            <Card key={van.id} className="overflow-hidden">
                                <CardHeader className="border-b border-border/60 bg-slate-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                                <Truck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{van.name}</CardTitle>
                                                {van.registration && (
                                                    <p className="text-xs text-muted-foreground">{van.registration}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Briefcase className="h-3.5 w-3.5" /> {van._count.jobs}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Package className="h-3.5 w-3.5" /> {van._count.inventory}
                                            </span>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3">
                                    {driver && (
                                        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-sm">
                                            <Crown className="h-4 w-4 text-amber-600" />
                                            <span className="font-medium">{userName(driver.user)}</span>
                                            <span className="text-xs text-amber-700">Driver</span>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        {van.members
                                            .filter((m) => m.role !== "DRIVER")
                                            .map((member) => (
                                                <div
                                                    key={member.id}
                                                    className="flex items-center justify-between rounded-lg border p-2.5"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                                                            {member.user.email[0].toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-medium">{userName(member.user)}</span>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            removeMemberMutation.mutate({
                                                                vanId: van.id,
                                                                userId: member.user.id,
                                                            })
                                                        }
                                                        className="text-slate-400 hover:text-rose-500 transition"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                    </div>

                                    {van.members.length === 0 && (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            No team members assigned yet.
                                        </p>
                                    )}

                                    <div className="rounded-lg border bg-slate-50/40 p-3 space-y-1.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Odometer</span>
                                            <span className="font-medium tabular-nums">{van.odometerKm != null ? `${van.odometerKm.toLocaleString()} km` : '—'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Next service</span>
                                            <span className="font-medium">{van.nextServiceAt ? new Date(van.nextServiceAt).toLocaleDateString() : van.nextServiceKm ? `${van.nextServiceKm.toLocaleString()} km` : '—'}</span>
                                        </div>
                                        {serviceStatus(van).length > 0 && (
                                            <div className="flex items-center gap-1.5 text-rose-600 mt-1">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                <span>{serviceStatus(van).join(' · ')}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            variant="outline"
                                            className="gap-2"
                                            onClick={() => setAddMemberVanId(van.id)}
                                        >
                                            <UserPlus className="h-4 w-4" /> Member
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="gap-2"
                                            onClick={() => setServiceVan(van)}
                                        >
                                            <Wrench className="h-4 w-4" /> Log service
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!serviceVan} onOpenChange={(o) => !o && setServiceVan(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Log service · {serviceVan?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Type</Label>
                            <select
                                value={svcType}
                                onChange={(e) => setSvcType(e.target.value as any)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="SERVICE">Service / PM</option>
                                <option value="ODOMETER">Odometer reading</option>
                                <option value="FUEL">Fuel fill</option>
                                <option value="REPAIR">Repair</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Odometer (km)</Label>
                                <Input type="number" value={svcOdo} onChange={(e) => setSvcOdo(e.target.value)} placeholder="e.g. 84500" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Cost</Label>
                                <Input type="number" step="0.01" value={svcCost} onChange={(e) => setSvcCost(e.target.value)} placeholder="0.00" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Notes</Label>
                            <Input value={svcDesc} onChange={(e) => setSvcDesc(e.target.value)} placeholder="Oil change + filter…" />
                        </div>
                        {svcType === 'SERVICE' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Next service at (km)</Label>
                                    <Input type="number" value={svcNextKm} onChange={(e) => setSvcNextKm(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Next service by</Label>
                                    <Input type="date" value={svcNextAt} onChange={(e) => setSvcNextAt(e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={submitServiceLog} disabled={addServiceLog.isPending}>
                            Save log
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!addMemberVanId} onOpenChange={(o) => !o && setAddMemberVanId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add team member</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Technician</Label>
                            <select
                                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                            >
                                <option value="">Select technician</option>
                                {availableTechs.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {userName(t)} ({t.email})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Role</Label>
                            <select
                                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as "DRIVER" | "MEMBER")}
                            >
                                <option value="MEMBER">Team member</option>
                                <option value="DRIVER">Driver (lead)</option>
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() =>
                                addMemberVanId &&
                                selectedUserId &&
                                addMemberMutation.mutate({
                                    vanId: addMemberVanId,
                                    userId: selectedUserId,
                                    role: selectedRole,
                                })
                            }
                            disabled={!selectedUserId || addMemberMutation.isPending}
                        >
                            Add to van
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
