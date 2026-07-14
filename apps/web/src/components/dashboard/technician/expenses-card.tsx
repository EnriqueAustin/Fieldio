"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface ExpenseDraft {
    description: string;
    amount: string;
    category: string;
}

interface ExpensesCardProps {
    newExpense: ExpenseDraft;
    setNewExpense: Dispatch<SetStateAction<ExpenseDraft>>;
    setExpenseReceipt: Dispatch<SetStateAction<File | null>>;
    onSubmit: () => void;
}

export function ExpensesCard({ newExpense, setNewExpense, setExpenseReceipt, onSubmit }: ExpensesCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Job Expenses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-xl border p-4 space-y-3">
                    <div className="grid grid-cols-[1fr,100px] gap-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Description</label>
                            <input
                                placeholder="What did you buy? e.g. Copper fittings at Plumblink"
                                value={newExpense.description}
                                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Amount (R)</label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={newExpense.amount}
                                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Category</label>
                            <select
                                value={newExpense.category}
                                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                            >
                                <option value="PARTS_PURCHASE">Parts purchase</option>
                                <option value="MATERIALS">Materials</option>
                                <option value="TOOLS">Tools</option>
                                <option value="TRAVEL">Travel</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Receipt photo</label>
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setExpenseReceipt(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={onSubmit}
                            disabled={!newExpense.description || !newExpense.amount}
                        >
                            Add expense
                        </Button>
                    </div>
                </div>

                <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                    Expenses for this job will appear on the invoice as cost-of-sale items for Sage export.
                </div>
            </CardContent>
        </Card>
    );
}
