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

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

/**
 * Reverse a recorded payment that was keyed in error. The invoice balance is
 * recomputed from the remaining payments, so a fully-paid invoice becomes
 * payable (and voidable) again.
 */
export function ReversePaymentDialog({
    invoiceId,
    paymentId,
    amount,
    method,
    open,
    onOpenChange,
}: {
    invoiceId: string;
    paymentId: string | null;
    amount: number;
    method: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [reason, setReason] = useState("");
    // One idempotency key per reversal, reused on retry.
    const [idemKey, setIdemKey] = useState("");

    useEffect(() => {
        if (open) {
            setReason("");
            setIdemKey(crypto.randomUUID());
        }
    }, [open]);

    const reverse = useMutation({
        mutationFn: () =>
            api
                .post(
                    `/payments/${paymentId}/reverse`,
                    { reason: reason.trim() },
                    { headers: { "Idempotency-Key": idemKey } }
                )
                .then((r) => r.data.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            onOpenChange(false);
            toast({ title: "Payment reversed", description: "The invoice balance has been restored." });
        },
        onError: (e: any) =>
            toast({
                title: "Could not reverse payment",
                description: e?.response?.data?.message ?? "",
                variant: "destructive",
            }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reverse payment</DialogTitle>
                    <DialogDescription>
                        Reverse the {method.toLowerCase()} payment of {formatCurrency(amount)}. The amount is
                        added back to the invoice balance.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Use this for a mis-keyed payment or one recorded against the wrong invoice. The payment is
                        kept on record as reversed.
                    </span>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="reverse-reason">Reason</Label>
                    <Textarea
                        id="reverse-reason"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Recorded against the wrong invoice"
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reverse.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => reverse.mutate()}
                        disabled={reason.trim().length < 3 || !paymentId || reverse.isPending}
                        className="gap-1.5"
                    >
                        {reverse.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Reverse payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
