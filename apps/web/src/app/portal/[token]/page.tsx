"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Briefcase, Clock, CheckCircle2, XCircle, AlertCircle, CreditCard } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Lightweight finger/mouse signature pad for the public portal (no app deps). */
function PortalSignaturePad({ onChange }: { onChange: (value: string | null) => void }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const hasStroke = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0f172a";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const pt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const begin = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const p = pt(e);
        drawing.current = true;
        canvasRef.current!.setPointerCapture(e.pointerId);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    };
    const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        const p = pt(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasStroke.current = true;
    };
    const end = () => {
        if (!drawing.current) return;
        drawing.current = false;
        onChange(hasStroke.current ? canvasRef.current!.toDataURL("image/png") : null);
    };
    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        hasStroke.current = false;
        onChange(null);
    };

    return (
        <div className="space-y-2">
            <canvas
                ref={canvasRef}
                width={800}
                height={240}
                className="h-40 w-full rounded-xl border border-dashed border-slate-300 bg-white touch-none"
                onPointerDown={begin}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
            />
            <button type="button" onClick={clear} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                Clear signature
            </button>
        </div>
    );
}

interface PortalData {
    customer: { id: string; name: string; email: string | null; phone: string | null };
    jobs: Array<{
        id: string; title: string; status: string; priority: string;
        scheduledStart: string | null; actualEnd: string | null; createdAt: string;
        property: { addressLine1: string; city: string };
        tech: { firstName: string | null; lastName: string | null } | null;
    }>;
    estimates: Array<{ id: string; status: string; total: string; validUntil: string | null; createdAt: string }>;
    invoices: Array<{
        id: string; invoiceNumber: string | null; status: string;
        total: string; balance: string; dueDate: string | null; paidAt: string | null; publicToken: string | null;
    }>;
}

const statusIcon: Record<string, React.ReactNode> = {
    COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    CANCELED: <XCircle className="h-4 w-4 text-rose-500" />,
    EN_ROUTE: <Clock className="h-4 w-4 text-blue-500" />,
    ON_SITE: <AlertCircle className="h-4 w-4 text-amber-500" />,
};

const statusColors: Record<string, string> = {
    REQUESTED: "bg-slate-100 text-slate-700",
    ASSIGNED: "bg-blue-50 text-blue-700",
    EN_ROUTE: "bg-blue-50 text-blue-700",
    ON_SITE: "bg-amber-50 text-amber-700",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    CANCELED: "bg-rose-50 text-rose-700",
    DRAFT: "bg-slate-100 text-slate-700",
    SENT: "bg-blue-50 text-blue-700",
    PAID: "bg-emerald-50 text-emerald-700",
    OVERDUE: "bg-rose-50 text-rose-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    DECLINED: "bg-rose-50 text-rose-700",
};

export default function CustomerPortalPage() {
    const params = useParams();
    const token = params.token as string;
    const [data, setData] = useState<PortalData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<"jobs" | "invoices" | "estimates">("jobs");

    // Quote approval flow state
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [signerName, setSignerName] = useState("");
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(() => {
        fetch(`${API_BASE}/public/portal/${token}`)
            .then(r => { if (!r.ok) throw new Error("Invalid or expired link"); return r.json(); })
            .then(r => setData(r.data))
            .catch(e => setError(e.message));
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const closeApproval = () => {
        setApprovingId(null);
        setSignerName("");
        setSignatureDataUrl(null);
        setActionError(null);
    };

    const submitApproval = async () => {
        if (!approvingId || !signerName.trim() || !signatureDataUrl) return;
        setSubmitting(true);
        setActionError(null);
        try {
            const r = await fetch(`${API_BASE}/public/portal/${token}/estimates/${approvingId}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signerName: signerName.trim(), signatureUrl: signatureDataUrl }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Could not approve quote");
            closeApproval();
            load();
        } catch (e: any) {
            setActionError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const declineEstimate = async (id: string) => {
        if (!confirm("Decline this quote? The team will be notified.")) return;
        try {
            const r = await fetch(`${API_BASE}/public/portal/${token}/estimates/${id}/decline`, { method: "POST" });
            if (!r.ok) throw new Error("Could not decline quote");
            load();
        } catch {
            /* surfaced via reload — non-blocking */
        }
    };

    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center p-8"><XCircle className="h-12 w-12 mx-auto text-rose-400 mb-4" />
                <h1 className="text-xl font-semibold mb-2">Portal unavailable</h1>
                <p className="text-muted-foreground">{error}</p>
            </div>
        </div>
    );

    if (!data) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-border">
                <div className="max-w-4xl mx-auto px-4 py-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer Portal</p>
                    <h1 className="text-2xl font-semibold mt-1">Welcome, {data.customer.name}</h1>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-white rounded-xl border border-border p-5">
                        <div className="flex items-center gap-3"><Briefcase className="h-5 w-5 text-blue-600" /><div>
                            <p className="text-2xl font-semibold">{data.jobs.length}</p>
                            <p className="text-xs text-muted-foreground">Jobs</p>
                        </div></div>
                    </div>
                    <div className="bg-white rounded-xl border border-border p-5">
                        <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-emerald-600" /><div>
                            <p className="text-2xl font-semibold">{data.invoices.length}</p>
                            <p className="text-xs text-muted-foreground">Invoices</p>
                        </div></div>
                    </div>
                    <div className="bg-white rounded-xl border border-border p-5">
                        <div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-amber-600" /><div>
                            <p className="text-2xl font-semibold">
                                R {data.invoices.filter(i => i.status !== "PAID").reduce((s, i) => s + Number(i.balance), 0).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">Outstanding</p>
                        </div></div>
                    </div>
                </div>

                <div className="flex gap-1 border-b border-border">
                    {(["jobs", "invoices", "estimates"] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition capitalize ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-muted-foreground"}`}>
                            {t}
                        </button>
                    ))}
                </div>

                {tab === "jobs" && (
                    <div className="space-y-3">
                        {data.jobs.map(j => (
                            <div key={j.id} className="bg-white rounded-xl border border-border p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-medium">{j.title}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">{j.property.addressLine1}, {j.property.city}</p>
                                        {j.tech && <p className="text-xs text-muted-foreground mt-1">Tech: {[j.tech.firstName, j.tech.lastName].filter(Boolean).join(" ")}</p>}
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[j.status] || ""}`}>
                                        {statusIcon[j.status]}{j.status.replace("_", " ")}
                                    </span>
                                </div>
                                {j.scheduledStart && <p className="text-xs text-muted-foreground mt-2">Scheduled: {new Date(j.scheduledStart).toLocaleDateString()}</p>}
                            </div>
                        ))}
                        {data.jobs.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No jobs found</p>}
                    </div>
                )}

                {tab === "invoices" && (
                    <div className="space-y-3">
                        {data.invoices.map(inv => (
                            <div key={inv.id} className="bg-white rounded-xl border border-border p-5 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{inv.invoiceNumber || inv.id.slice(0, 8)}</p>
                                    <p className="text-sm text-muted-foreground">Total: R {Number(inv.total).toFixed(2)}</p>
                                    {inv.dueDate && <p className="text-xs text-muted-foreground">Due: {new Date(inv.dueDate).toLocaleDateString()}</p>}
                                </div>
                                <div className="text-right">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || ""}`}>{inv.status}</span>
                                    {inv.status !== "PAID" && inv.publicToken && (
                                        <a href={`/pay/${inv.publicToken}`} className="block mt-2 text-xs font-medium text-blue-600 hover:underline">Pay now</a>
                                    )}
                                </div>
                            </div>
                        ))}
                        {data.invoices.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No invoices found</p>}
                    </div>
                )}

                {tab === "estimates" && (
                    <div className="space-y-3">
                        {data.estimates.map(est => (
                            <div key={est.id} className="bg-white rounded-xl border border-border p-5">
                                <div className="flex justify-between items-start gap-3">
                                    <div>
                                        <p className="font-medium">Estimate #{est.id.slice(0, 8)}</p>
                                        <p className="text-sm text-muted-foreground">Total: R {Number(est.total).toFixed(2)}</p>
                                        {est.validUntil && <p className="text-xs text-muted-foreground">Valid until: {new Date(est.validUntil).toLocaleDateString()}</p>}
                                    </div>
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[est.status] || ""}`}>{est.status}</span>
                                </div>
                                {est.status === "SENT" && (
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                                        <button
                                            onClick={() => { setApprovingId(est.id); setSignerName(data.customer.name); }}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition"
                                        >
                                            <CheckCircle2 className="h-4 w-4" /> Approve quote
                                        </button>
                                        <button
                                            onClick={() => declineEstimate(est.id)}
                                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                                        >
                                            <XCircle className="h-4 w-4" /> Decline
                                        </button>
                                    </div>
                                )}
                                {est.status === "APPROVED" && (
                                    <p className="mt-3 text-xs text-emerald-700 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> You approved this quote. The team will be in touch.
                                    </p>
                                )}
                            </div>
                        ))}
                        {data.estimates.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No estimates found</p>}
                    </div>
                )}
            </div>

            {approvingId && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={closeApproval}>
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div>
                            <h2 className="text-lg font-semibold">Approve quote</h2>
                            <p className="text-sm text-muted-foreground mt-1">Sign below to accept this quote. This is your authorisation to proceed with the work.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Your name</label>
                            <input
                                value={signerName}
                                onChange={e => setSignerName(e.target.value)}
                                placeholder="Full name"
                                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Signature</label>
                            <PortalSignaturePad onChange={setSignatureDataUrl} />
                        </div>
                        {actionError && <p className="text-sm text-rose-600">{actionError}</p>}
                        <div className="flex gap-2 justify-end pt-2">
                            <button onClick={closeApproval} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button
                                onClick={submitApproval}
                                disabled={submitting || !signerName.trim() || !signatureDataUrl}
                                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? "Approving…" : "Approve & sign"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
