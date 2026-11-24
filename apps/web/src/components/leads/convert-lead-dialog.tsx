"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import api from "../../lib/api";
import { formatRand, type Lead } from "./types";

interface Props {
    lead: Lead | null;
    target: "QUOTE" | "JOB" | null;
    onOpenChange: (v: boolean) => void;
}

export function ConvertLeadDialog({ lead, target, onOpenChange }: Props) {
    const qc = useQueryClient();
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [line1, setLine1] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [zip, setZip] = useState("");
    const [total, setTotal] = useState("");
    const [error, setError] = useState<string | null>(null);

    const open = !!lead && !!target;

    const convert = useMutation({
        mutationFn: () => {
            const body: any = { target };
            if (target === "JOB") {
                body.title = title.trim() || undefined;
                body.address = { line1: line1.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() };
            } else {
                if (total) body.total = Number(total);
            }
            return api.post(`/leads/${lead!.id}/convert`, body).then((r) => r.data.data);
        },
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
            qc.invalidateQueries({ queryKey: ["leads-funnel"] });
            onOpenChange(false);
            if (data.estimateId) router.push(`/estimates/${data.estimateId}`);
            else if (data.jobId) router.push(`/jobs/${data.jobId}`);
        },
        onError: (e: any) => setError(e?.response?.data?.message ?? "Could not convert lead"),
    });

    const reset = () => {
        setTitle(""); setLine1(""); setCity(""); setState(""); setZip(""); setTotal(""); setError(null);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(false); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {target === "JOB" ? <Briefcase className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        {target === "JOB" ? "Create job" : "Create quote"} from lead
                    </DialogTitle>
                    <DialogDescription>
                        {lead?.name}
                        {target === "QUOTE"
                            ? " will become an active customer with a draft quote the office can fill in."
                            : " will become an active customer with a new job."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {target === "QUOTE" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="conv-total">Quote total (R)</Label>
                            <Input
                                id="conv-total"
                                type="number"
                                min={0}
                                value={total}
                                onChange={(e) => setTotal(e.target.value)}
                                placeholder={lead?.leadValue != null ? String(lead.leadValue) : "0"}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Defaults to the lead value ({formatRand(lead?.leadValue)}). Edit line items on the quote afterwards.
                            </p>
                        </div>
                    )}

                    {target === "JOB" && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="conv-title">Job title</Label>
                                <Input id="conv-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`New job for ${lead?.name ?? ""}`} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="conv-line1">Site address</Label>
                                <Input id="conv-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Street address" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Province" />
                                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Code" />
                            </div>
                        </>
                    )}

                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={convert.isPending} onClick={() => convert.mutate()}>
                        {convert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {target === "JOB" ? "Create job" : "Create quote"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
