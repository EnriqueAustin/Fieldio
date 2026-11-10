"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../ui/dialog";
import { useToast } from "../../hooks/use-toast";

export function VoidInvoiceDialog({
    invoiceId,
    open,
    onOpenChange,
}: {
    invoiceId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [reason, setReason] = useState("");

    useEffect(() => {
        if (open) setReason("");
    }, [open]);

    const voidInvoice = useMutation({
        mutationFn: () =>
            api.post(`/finance/invoices/${invoiceId}/void`, { reason: reason.trim() }).then((r) => r.data.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            onOpenChange(false);
            toast({ title: "Invoice voided" });
        },
        onError: (e: any) =>
            toast({
                title: "Could not void invoice",
                description: e?.response?.data?.message ?? "",
                variant: "destructive",
            }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Void invoice</DialogTitle>
                    <DialogDescription>
                        Voiding cancels this invoice. This can&apos;t be undone — a new invoice would need to be
                        raised instead.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>The customer will no longer be able to pay this invoice through its pay link.</span>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="void-reason">Reason</Label>
                    <Textarea
                        id="void-reason"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Duplicate invoice, raised in error"
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={voidInvoice.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => voidInvoice.mutate()}
                        disabled={reason.trim().length < 3 || voidInvoice.isPending}
                        className="gap-1.5"
                    >
                        {voidInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Void invoice
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
