"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, X } from "lucide-react";
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
    const [open, setOpen] = useState(false);

    const handleSubmit = () => {
        onSubmit();
        setOpen(false);
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Job Expenses</CardTitle>
                <Button
                    type="button"
                    variant={open ? "ghost" : "outline"}
                    size="sm"
                    className="h-11 gap-1.5"
                    onClick={() => setOpen((v) => !v)}
                >
                    {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {open ? "Cancel" : "Add expense"}
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {!open ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Bought parts or materials for this job? Tap “Add expense” to log it with a receipt photo.
                    </div>
                ) : (
                <div className="rounded-xl border p-4 space-y-3">
                    <div className="grid grid-cols-[1fr,100px] gap-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Description</label>
                            <input
                                placeholder="What did you buy? e.g. Copper fittings at Plumblink"
                                value={newExpense.description}
                                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Amount (R)</label>
                            <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={newExpense.amount}
                                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Category</label>
                            <select
                                value={newExpense.category}
                                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                className="w-full rounded-lg border border-border px-3 h-11 text-sm"
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
                                capture="environment"
                                className="h-11"
                                onChange={(e) => setExpenseReceipt(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Logged as a cost-of-sale item on the invoice for Sage export.
                    </p>
                    <div className="flex justify-end">
                        <Button
                            className="h-11"
                            onClick={handleSubmit}
                            disabled={!newExpense.description || !newExpense.amount}
                        >
                            Save expense
                        </Button>
                    </div>
                </div>
                )}
            </CardContent>
        </Card>
    );
}
