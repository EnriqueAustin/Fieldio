"use client";

import { useEffect, useState } from "react";
import api from "../../../../lib/api";
import { useAuthStore } from "../../../../store/auth";
import { Button } from "../../../../components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../../../components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Plus, Building2, Pencil } from "lucide-react";

interface Branch {
    id: string;
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone?: string | null;
    active: boolean;
}

type BranchForm = {
    name: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
};

const emptyForm: BranchForm = {
    name: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", phone: "",
};

// Build a one-line display address from the parts we hold.
function addressLine(b: Branch): string {
    return [b.addressLine1, b.addressLine2, b.city, b.state, b.zip]
        .map((p) => (p ?? "").trim())
        .filter(Boolean)
        .join(", ");
}

export default function BranchesSettingsPage() {
    const role = useAuthStore((s) => s.user?.role);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Branch | null>(null);
    const [form, setForm] = useState<BranchForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBranches = async () => {
        try {
            const res = await api.get("/branches");
            setBranches(res.data.data.branches);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (role === "ADMIN") fetchBranches();
    }, [role]);

    // Everyone else would just 403 against the write endpoints, so we don't show
    // the screen — same stance as the settings tabs for owner-only pages.
    if (role && role !== "ADMIN") {
        return (
            <div className="space-y-2">
                <h3 className="text-lg font-medium">Branches</h3>
                <p className="text-sm text-muted-foreground">
                    Only an administrator can manage branches.
                </p>
            </div>
        );
    }

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setError(null);
        setDialogOpen(true);
    };

    const openEdit = (b: Branch) => {
        setEditing(b);
        setForm({
            name: b.name ?? "",
            addressLine1: b.addressLine1 ?? "",
            addressLine2: b.addressLine2 ?? "",
            city: b.city ?? "",
            state: b.state ?? "",
            zip: b.zip ?? "",
            phone: b.phone ?? "",
        });
        setError(null);
        setDialogOpen(true);
    };

    const save = async () => {
        if (!form.name.trim()) {
            setError("A branch name is required.");
            return;
        }
        setSaving(true);
        setError(null);
        // Send empty optional fields as undefined so we don't store blank strings.
        const payload = {
            name: form.name.trim(),
            addressLine1: form.addressLine1.trim() || undefined,
            addressLine2: form.addressLine2.trim() || undefined,
            city: form.city.trim() || undefined,
            state: form.state.trim() || undefined,
            zip: form.zip.trim() || undefined,
            phone: form.phone.trim() || undefined,
        };
        try {
            if (editing) {
                await api.patch(`/branches/${editing.id}`, payload);
            } else {
                await api.post("/branches", payload);
            }
            setDialogOpen(false);
            setForm(emptyForm);
            setEditing(null);
            fetchBranches();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? "Could not save the branch.");
        } finally {
            setSaving(false);
        }
    };

    const deactivate = async (b: Branch) => {
        if (!window.confirm(
            `Deactivate "${b.name}"? It will be removed from branch pickers. Jobs and team members must be reassigned first.`
        )) return;
        try {
            await api.delete(`/branches/${b.id}`);
            fetchBranches();
        } catch (err: any) {
            // The server guards against orphaning jobs / staff and returns 409.
            window.alert(err?.response?.data?.message ?? "Could not deactivate the branch.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Branches</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage the locations your team works out of. Branches drive job filtering and team assignments.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Branch
                </Button>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {branches.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4}>
                                    <div className="flex flex-col items-center py-12 text-center">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                            <Building2 className="h-5 w-5" />
                                        </div>
                                        <p className="mt-3 text-sm font-medium">No branches yet</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Add your first location to enable multi-branch filtering and assignments.
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            branches.map((b) => (
                                <TableRow key={b.id}>
                                    <TableCell className="font-medium">{b.name}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {addressLine(b) || "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{b.phone || "—"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                                                <Pencil className="mr-1 h-3 w-3" /> Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-rose-600 hover:text-rose-700"
                                                onClick={() => deactivate(b)}
                                            >
                                                Deactivate
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Branch" : "Add Branch"}</DialogTitle>
                        <DialogDescription>
                            {editing
                                ? "Update this location's details."
                                : "Create a new location for your company."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="branch-name">Name</Label>
                            <Input
                                id="branch-name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Cape Town Depot"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-addr1">Address Line 1</Label>
                            <Input
                                id="branch-addr1"
                                value={form.addressLine1}
                                onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-addr2">Address Line 2</Label>
                            <Input
                                id="branch-addr2"
                                value={form.addressLine2}
                                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="branch-city">City</Label>
                                <Input
                                    id="branch-city"
                                    value={form.city}
                                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="branch-state">Province</Label>
                                <Input
                                    id="branch-state"
                                    value={form.state}
                                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="branch-zip">Postal Code</Label>
                                <Input
                                    id="branch-zip"
                                    value={form.zip}
                                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-phone">Phone</Label>
                            <Input
                                id="branch-phone"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        {error && <p className="text-sm text-rose-600">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving}>
                            {saving ? "Saving..." : editing ? "Save Changes" : "Create Branch"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
