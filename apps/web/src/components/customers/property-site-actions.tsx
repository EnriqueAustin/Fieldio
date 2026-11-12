"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";

interface SiteProperty {
    id: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zip: string;
}

export function PropertySiteActions({
    customerId,
    property,
    canEdit,
    canDelete,
}: {
    customerId: string;
    property: SiteProperty;
    canEdit: boolean;
    canDelete: boolean;
}) {
    const qc = useQueryClient();
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [form, setForm] = useState({
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2 ?? "",
        city: property.city,
        state: property.state,
        zip: property.zip,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["customer", customerId] });

    const save = useMutation({
        mutationFn: () =>
            api.patch(`/customers/${customerId}/properties/${property.id}`, {
                addressLine1: form.addressLine1,
                addressLine2: form.addressLine2 || null,
                city: form.city,
                state: form.state,
                zip: form.zip,
            }),
        onSuccess: () => {
            toast({ title: "Site updated" });
            setEditOpen(false);
            void invalidate();
        },
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Could not update the site",
                variant: "destructive",
            }),
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/customers/${customerId}/properties/${property.id}`),
        onSuccess: () => {
            toast({ title: "Site deleted" });
            setDeleteOpen(false);
            void invalidate();
        },
        // A site with jobs returns 409 with a message — surface it in the toast.
        onError: (err: any) =>
            toast({
                title: err?.response?.data?.message || "Could not delete the site",
                variant: "destructive",
            }),
    });

    if (!canEdit && !canDelete) return null;

    return (
        <>
            <div className="mt-3 flex items-center gap-2">
                {canEdit && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() => {
                            setForm({
                                addressLine1: property.addressLine1,
                                addressLine2: property.addressLine2 ?? "",
                                city: property.city,
                                state: property.state,
                                zip: property.zip,
                            });
                            setEditOpen(true);
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                )}
                {canDelete && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-rose-600 hover:text-rose-700"
                        onClick={() => setDeleteOpen(true)}
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                )}
            </div>

            {/* Edit site */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit service address</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-addr1">Street address</Label>
                            <Input
                                id="edit-addr1"
                                value={form.addressLine1}
                                onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-addr2">Unit / complex</Label>
                            <Input
                                id="edit-addr2"
                                value={form.addressLine2}
                                placeholder="Optional"
                                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-city">City</Label>
                                <Input
                                    id="edit-city"
                                    value={form.city}
                                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-state">Province</Label>
                                <Input
                                    id="edit-state"
                                    value={form.state}
                                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-zip">Postal code</Label>
                                <Input
                                    id="edit-zip"
                                    value={form.zip}
                                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => save.mutate()}
                            disabled={!form.addressLine1.trim() || !form.city.trim() || save.isPending}
                        >
                            {save.isPending ? "Saving…" : "Save changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete site */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this site?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {property.addressLine1}
                        {property.city ? `, ${property.city}` : ""}. This cannot be undone. A site
                        that still has jobs linked to it cannot be deleted.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            Keep site
                        </Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700"
                            onClick={() => remove.mutate()}
                            disabled={remove.isPending}
                        >
                            {remove.isPending ? "Deleting…" : "Delete site"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
