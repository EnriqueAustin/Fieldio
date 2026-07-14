"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { putPhotoBlob } from "../../../lib/offline-db";
import { toast } from "../../ui/use-toast";

/** Job-expense drafting + offline-queued submit (mirrors the photo pattern). */
export function useExpenses() {
    const [newExpense, setNewExpense] = useState({ description: "", amount: "", category: "PARTS_PURCHASE" });
    const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null);

    const expenseMutation = useMutation<unknown, any, { jobId: string; description: string; amount: number; category: string; receiptBlobId?: string }>({
        mutationKey: OFFLINE_KEYS.expense,
        onError: () => {
            toast({ title: "Could not add expense", variant: "destructive" });
        },
    });

    /** Persist the receipt bytes to IndexedDB (if any), then queue the expense so
     *  it survives reconnect and reload — same pattern as photo uploads. */
    const queueExpense = async (jobId: string, description: string, amount: number, category: string, receipt: File | null) => {
        let receiptBlobId: string | undefined;
        if (receipt) {
            receiptBlobId = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await putPhotoBlob(receiptBlobId, {
                jobId,
                caption: "",
                blob: receipt,
                fileName: receipt.name || `${receiptBlobId}.jpg`,
                createdAt: Date.now(),
            });
        }
        expenseMutation.mutate({ jobId, description, amount, category, receiptBlobId });
        setNewExpense({ description: "", amount: "", category: "PARTS_PURCHASE" });
        setExpenseReceipt(null);
    };

    const submitExpense = (jobId: string) => {
        if (!newExpense.description || !newExpense.amount) return;
        void queueExpense(
            jobId,
            newExpense.description,
            parseFloat(newExpense.amount),
            newExpense.category,
            expenseReceipt,
        );
    };

    return { newExpense, setNewExpense, expenseReceipt, setExpenseReceipt, submitExpense };
}
