"use client";

import type { Dispatch, SetStateAction } from "react";
import { format } from "date-fns";
import { CheckCircle2, Clock, FileText, PenTool, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { LiveTimer } from "./live-timer";
import { SignaturePad } from "./signature-pad";
import type { TechnicianJob } from "./types";

interface CloseoutTabProps {
    job: TechnicianJob;
    checklistCompleted: number;
    checklistRequired: number;
    signerName: string;
    setSignerName: Dispatch<SetStateAction<string>>;
    signatureDataUrl: string | null;
    setSignatureDataUrl: (value: string | null) => void;
    onSaveSignature: () => void;
    isSaving: boolean;
    onSendSummary: () => void;
    isSendingSummary: boolean;
}

export function CloseoutTab({
    job,
    checklistCompleted,
    checklistRequired,
    signerName,
    setSignerName,
    signatureDataUrl,
    setSignatureDataUrl,
    onSaveSignature,
    isSaving,
    onSendSummary,
    isSendingSummary,
}: CloseoutTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Completion and handoff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border p-4">
                        <div className="flex items-center gap-2 font-medium">
                            <Clock className="h-4 w-4" />
                            Labor timer
                        </div>
                        {job.actualStart ? (
                            <>
                                <p className="mt-2 text-2xl font-semibold text-slate-900">
                                    <LiveTimer start={job.actualStart} end={job.actualEnd} />
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {job.actualEnd ? "Total on-site time" : "Running"} · started{" "}
                                    {format(new Date(job.actualStart), "p")}
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-muted-foreground">
                                Timer begins automatically when you start travel or arrive on site.
                            </p>
                        )}
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="flex items-center gap-2 font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            Checklist
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {checklistCompleted} of {checklistRequired} service steps complete.
                        </p>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="flex items-center gap-2 font-medium">
                            <PenTool className="h-4 w-4" />
                            Signature
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {job.signatures.length > 0
                                ? `Latest signoff by ${job.signatures[0].signerName}`
                                : "Customer signoff still required."}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                            <FileText className="h-4 w-4" />
                            Customer job summary
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {job.summaryEmailedAt
                                ? `Sent ${format(new Date(job.summaryEmailedAt), "MMM d, p")}. Re-send if the customer needs another copy.`
                                : "Send the customer a summary of the work done, checklist and sign-off — no pricing shown to you."}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={onSendSummary}
                        disabled={isSendingSummary}
                    >
                        <Send className="mr-2 h-4 w-4" />
                        {isSendingSummary
                            ? "Sending…"
                            : job.summaryEmailedAt
                            ? "Re-send summary"
                            : "Send job summary"}
                    </Button>
                </div>

                <div className="space-y-4 rounded-2xl border p-5">
                    <div className="space-y-2">
                        <label htmlFor="signer-name" className="text-sm font-medium">
                            Customer name
                        </label>
                        <Input
                            id="signer-name"
                            value={signerName}
                            onChange={(event) => setSignerName(event.target.value)}
                            placeholder="Name of person approving the completed work"
                        />
                    </div>
                    <SignaturePad onChange={setSignatureDataUrl} disabled={isSaving} />
                    <div className="flex justify-end">
                        <Button
                            onClick={onSaveSignature}
                            disabled={!signerName.trim() || !signatureDataUrl}
                        >
                            Save signature
                        </Button>
                    </div>
                </div>

                {job.signatures.length > 0 && (
                    <div className="space-y-3">
                        {job.signatures.map((signature) => (
                            <div key={signature.id} className="rounded-xl border p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{signature.signerName}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Signed {format(new Date(signature.signedAt), "MMM d, p")}
                                        </div>
                                    </div>
                                </div>
                                <img
                                    src={signature.signatureDataUrl}
                                    alt={`Signature from ${signature.signerName}`}
                                    className="h-24 rounded-lg border bg-white p-2"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
