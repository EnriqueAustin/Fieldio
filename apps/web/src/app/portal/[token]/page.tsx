"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Briefcase, Clock, CheckCircle2, XCircle, AlertCircle, CreditCard } from "lucide-react";

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

    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/public/portal/${token}`)
            .then(r => { if (!r.ok) throw new Error("Invalid or expired link"); return r.json(); })
            .then(r => setData(r.data))
            .catch(e => setError(e.message));
    }, [token]);

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
                            <div key={est.id} className="bg-white rounded-xl border border-border p-5 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">Estimate #{est.id.slice(0, 8)}</p>
                                    <p className="text-sm text-muted-foreground">Total: R {Number(est.total).toFixed(2)}</p>
                                    {est.validUntil && <p className="text-xs text-muted-foreground">Valid until: {new Date(est.validUntil).toLocaleDateString()}</p>}
                                </div>
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[est.status] || ""}`}>{est.status}</span>
                            </div>
                        ))}
                        {data.estimates.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No estimates found</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
