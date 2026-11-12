"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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

// The API accepts a fixed enum (CASH | CHECK | EFT | OTHER). We surface a few
// friendlier labels and map them onto that enum, carrying the human label into
// the note when the enum value would otherwise lose it (e.g. "Card machine").
const METHODS: { label: string; value: "CASH" | "CHECK" | "EFT" | "OTHER"; tag?: string }[] = [
    { label: "Cash", value: "CASH" },
    { label: "EFT / Bank transfer", value: "EFT" },
    { label: "Card machine", value: "OTHER", tag: "Card machine" },
    { label: "Cheque", value: "CHECK" },
    { label: "Other", value: "OTHER" },
];

function todayInJohannesburg() {
    // en-CA renders ISO-style yyyy-mm-dd, which <input type="date"> expects.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}

export function RecordPaymentDialog({
    invoiceId,
    balance,
    open,
    onOpenChange,
}: {
    invoiceId: string;
    balance: number;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const qc = useQueryClient();
    const { toast } = useToast();

    const [amount, setAmount] = useState("");
    const [methodIdx, setMethodIdx] = useState(0);
    const [date, setDate] = useState(todayInJohannesburg());
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    // One idempotency key per user action: minted when the dialog opens and
    // reused on every retry (a double-tap or a failed-then-retried submit) so
    // the money is booked at most once.
    const [idemKey, setIdemKey] = useState("");

    // Reset the form each time the dialog opens, defaulting the amount to the
    // outstanding balance.
    useEffect(() => {
        if (open) {
            setAmount(balance > 0 ? balance.toFixed(2) : "");
            setMethodIdx(0);
            setDate(todayInJohannesburg());
            setReference("");
            setNote("");
            setIdemKey(crypto.randomUUID());
        }
    }, [open, balance]);

    const amountNum = Number(amount);
    const amountValid = Number.isFinite(amountNum) && amountNum > 0;
    const overpaying = amountValid && amountNum > balance + 0.005;

    const record = useMutation({
        mutationFn: () => {
            const method = METHODS[methodIdx];
            // The API stores the reference and the effective date (paidAt) on
            // their own; only the method label for OTHER is folded into the note.
            const parts: string[] = [];
            if (method.tag) parts.push(method.tag);
            if (note.trim()) parts.push(note.trim());
            const composedNote = parts.join(" · ") || undefined;
            return api
                .post(
                    `/payments/invoices/${invoiceId}/record`,
                    {
                        amount: Number(amountNum.toFixed(2)),
                        method: method.value,
                        note: composedNote,
                        reference: reference.trim() ? reference.trim().slice(0, 100) : undefined,
                        // Effective date the money was received (stored as metadata.paidAt).
                        paidAt: date || undefined,
                    },
                    { headers: { "Idempotency-Key": idemKey } }
                )
                .then((r) => r.data.data);
        },
        onSuccess: (data: { overpayment?: number }) => {
            qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            onOpenChange(false);
            toast({
                title: "Payment recorded",
                description:
                    data?.overpayment && data.overpayment > 0
                        ? `${formatCurrency(data.overpayment)} recorded as an overpayment.`
                        : undefined,
            });
        },
        onError: (e: any) =>
            toast({
                title: "Could not record payment",
                description: e?.response?.data?.message ?? "",
                variant: "destructive",
            }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Record payment</DialogTitle>
                    <DialogDescription>
                        Log a cash, EFT, cheque or card-machine payment received against this invoice.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="pay-amount">Amount (ZAR)</Label>
                        <Input
                            id="pay-amount"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                        />
                        <p className="text-xs text-muted-foreground">
                            Balance outstanding: {formatCurrency(balance)}
                        </p>
                        {overpaying && (
                            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>
                                    This is more than the balance — {formatCurrency(amountNum - balance)} will be
                                    recorded as an overpayment.
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-method">Method</Label>
                            <select
                                id="pay-method"
                                value={methodIdx}
                                onChange={(e) => setMethodIdx(Number(e.target.value))}
                                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                {METHODS.map((m, i) => (
                                    <option key={i} value={i}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pay-date">Date received</Label>
                            <Input
                                id="pay-date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="pay-reference">Reference (optional)</Label>
                        <Input
                            id="pay-reference"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="e.g. bank reference or receipt no."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="pay-note">Note (optional)</Label>
                        <Textarea
                            id="pay-note"
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Anything else worth recording"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
                        Cancel
                    </Button>
                    <Button onClick={() => record.mutate()} disabled={!amountValid || record.isPending} className="gap-1.5">
                        {record.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Record payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
