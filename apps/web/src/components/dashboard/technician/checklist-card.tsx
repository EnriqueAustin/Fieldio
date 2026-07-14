"use client";

import { format } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import type { TechnicianJob } from "./types";

interface ChecklistCardProps {
    job: TechnicianJob;
    onToggle: (checkId: string, isCompleted: boolean) => void;
}

export function ChecklistCard({ job, onToggle }: ChecklistCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Service checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {job.description && (
                    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                        {job.description}
                    </div>
                )}
                {job.checklist.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                        No checklist items were created for this job yet.
                    </div>
                ) : (
                    job.checklist.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle(item.id, !item.isCompleted)}
                            className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition hover:bg-slate-50"
                        >
                            {item.isCompleted ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                                <Circle className="h-5 w-5 text-slate-400" />
                            )}
                            <div className="flex-1">
                                <div
                                    className={`font-medium ${
                                        item.isCompleted ? "text-slate-500 line-through" : "text-slate-900"
                                    }`}
                                >
                                    {item.label}
                                </div>
                                {item.completedAt && (
                                    <div className="text-xs text-muted-foreground">
                                        Completed {format(new Date(item.completedAt), "p")}
                                    </div>
                                )}
                            </div>
                        </button>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
