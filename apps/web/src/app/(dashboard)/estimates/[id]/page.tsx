"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
    ArrowLeft,
    Send,
    CheckCircle2,
    Briefcase,
    XCircle,
    Loader2,
    PenLine,
} from "lucide-react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { StatusPill } from "../../../../components/ui/status-pill";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../../../components/ui/dialog";
import { EstimateOptionsPanel } from "../../../../components/estimates/estimate-options-panel";
import { useToast } from "../../../../hooks/use-toast";

interface LineItem {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    type?: string;
}

interface Estimate {
    id: string;
    status: string;
    total: string;
    items: LineItem[] | null;
    validUntil: string | null;
    sentAt: string | null;
    createdAt: string;
    signerName: string | null;
    signedAt: string | null;
    jobId: string | null;
    customer: { id: string; name: string; email: string | null; phone: string | null };
}

function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(val);
}

function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EstimateDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const { toast } = useToast();
    const [approving, setApproving] = useState(false);
    const [signerName, setSignerName] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["estimate", id],
        queryFn: () => api.get(`/finance/estimates/${id}`).then((r) => r.data.data.estimate as Estimate),
        enabled: !!id,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["estimate", id] });
        qc.invalidateQueries({ queryKey: ["estimates"] });
    };

    const send = useMutation({
        mutationFn: () => api.post(`/finance/estimates/${id}/send`).then((r) => r.data.data),
        onSuccess: (res: { url: string | null }) => {
            invalidate();
            toast({
                title: "Quote sent",
                description: res.url ? `Approval link: ${res.url}` : "Customer notified.",
            });
        },
        onError: (e: any) =>
            toast({ title: "Could not send", description: e?.response?.data?.message ?? "", variant: "destructive" }),
    });

    const approve = useMutation({
        mutationFn: () =>
            api.post(`/finance/estimates/${id}/approve`, {
                signerName,
                signatureUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(signerName)}`,
            }),
        onSuccess: () => {
            invalidate();
            setApproving(false);
            setSignerName("");
            toast({ title: "Quote approved" });
        },
        onError: (e: any) =>
            toast({ title: "Could not approve", description: e?.response?.data?.message ?? "", variant: "destructive" }),
    });

    const convert = useMutation({
        mutationFn: () => api.post(`/finance/estimates/${id}/convert`).then((r) => r.data.data.job),
        onSuccess: (job: { id: string }) => {
            invalidate();
            toast({ title: "Converted to job" });
            router.push(`/jobs/${job.id}`);
        },
        onError: (e: any) =>
            toast({ title: "Could not convert", description: e?.response?.data?.message ?? "", variant: "destructive" }),
    });

    const decline = useMutation({
        mutationFn: () => api.post(`/finance/estimates/${id}/decline`),
        onSuccess: () => {
            invalidate();
            toast({ title: "Quote declined" });
        },
        onError: (e: any) =>
            toast({ title: "Could not decline", description: e?.response?.data?.message ?? "", variant: "destructive" }),
    });

    if (isLoading || !data) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
                <div className="surface-card h-96 animate-pulse" />
            </div>
        );
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const isTerminal = data.status === "APPROVED" || data.status === "DECLINED";

    return (
        <div className="space-y-6">
            <Link
                href="/estimates"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to quotes
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="page-title">Quote #{data.id.slice(0, 8)}</h1>
                        <StatusPill status={data.status} />
                    </div>
                    <p className="page-subtitle">
                        {data.customer.name}
                        {data.customer.email ? ` · ${data.customer.email}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {!isTerminal && (
                        <Button variant="outline" onClick={() => send.mutate()} disabled={send.isPending} className="gap-1.5">
                            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Send approval link
                        </Button>
                    )}
                    {!isTerminal && (
                        <Button onClick={() => setApproving(true)} className="gap-1.5">
                            <PenLine className="h-4 w-4" />
                            Approve
                        </Button>
                    )}
                    {data.status === "APPROVED" && !data.jobId && (
                        <Button onClick={() => convert.mutate()} disabled={convert.isPending} className="gap-1.5">
                            {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
                            Convert to job
                        </Button>
                    )}
                    {data.jobId && (
                        <Button asChild variant="outline" className="gap-1.5">
                            <Link href={`/jobs/${data.jobId}`}>
                                <Briefcase className="h-4 w-4" />
                                View job
                            </Link>
                        </Button>
                    )}
                    {!isTerminal && (
                        <Button
                            variant="ghost"
                            onClick={() => decline.mutate()}
                            disabled={decline.isPending}
                            className="gap-1.5 text-rose-600 hover:text-rose-700"
                        >
                            <XCircle className="h-4 w-4" />
                            Decline
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-2xl font-bold mt-0.5">{formatCurrency(Number(data.total))}</div>
                </div>
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="text-sm font-medium mt-1">{formatDate(data.createdAt)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                        {data.sentAt ? `Sent ${formatDate(data.sentAt)}` : "Not sent yet"}
                    </div>
                </div>
                <div className="surface-card p-4">
                    <div className="text-xs text-muted-foreground">Valid until</div>
                    <div className="text-sm font-medium mt-1">{formatDate(data.validUntil)}</div>
                    {data.signerName && (
                        <div className="text-xs text-emerald-600 mt-0.5 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Signed by {data.signerName}
                        </div>
                    )}
                </div>
            </div>

            {/* Line items */}
            <div className="surface-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/60 bg-slate-50/70 text-sm font-medium">
                    Line items
                </div>
                {items.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground">No line items.</div>
                ) : (
                    <div className="divide-y divide-border/60">
                        {items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                                <span className="truncate">
                                    {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                                </span>
                                <span className="font-medium">{formatCurrency(Number(item.total))}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Good / Better / Best options */}
            <div className="surface-card p-5">
                <EstimateOptionsPanel estimateId={data.id} />
            </div>

            {/* Approve dialog */}
            <Dialog open={approving} onOpenChange={setApproving}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Approve quote</DialogTitle>
                        <DialogDescription>
                            Capture the customer&apos;s name as an on-file acceptance signature.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="signer">Signer name</Label>
                        <Input
                            id="signer"
                            placeholder="e.g. Jane Dlamini"
                            value={signerName}
                            onChange={(e) => setSignerName(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setApproving(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={signerName.trim().length < 2 || approve.isPending}
                            onClick={() => approve.mutate()}
                        >
                            {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Approve quote
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
