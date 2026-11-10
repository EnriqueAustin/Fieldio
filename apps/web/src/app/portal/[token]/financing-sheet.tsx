"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { API_BASE, CallLink, PortalSheet, rand } from "./portal-shared";

export interface FinancingOffer {
    optionId: string;
    name: string;
    termMonths: number;
    interestRate: number;
    monthlyPayment: number;
}

export interface FinancingApplicationSummary {
    status: string;
    monthlyPayment: number | string | null;
    financingOptionId: string | null;
}

export const lowestMonthly = (offers: FinancingOffer[]) =>
    offers.reduce((min, o) => Math.min(min, Number(o.monthlyPayment)), Infinity);

/** Status line shown in place of the "Pay monthly" button once a plan has been requested. */
export function FinancingStatusNote({ application, companyName }: {
    application: FinancingApplicationSummary; companyName: string | null;
}) {
    const approved = application.status === "APPROVED" || application.status === "ACTIVE";
    const monthly = application.monthlyPayment != null ? ` (${rand(Number(application.monthlyPayment))}/month)` : "";
    if (approved) {
        return (
            <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Payment plan approved{monthly}
            </p>
        );
    }
    if (application.status === "APPLIED" || application.status === "OFFERED") {
        return (
            <p className="text-sm text-blue-700 flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 shrink-0" />
                Payment plan requested{monthly} — {companyName || "the team"} will be in touch
            </p>
        );
    }
    return null;
}

export function FinancingSheet({ token, estimateId, total, offers, companyPhone, onClose, onDone }: {
    token: string;
    estimateId: string;
    total: number;
    offers: FinancingOffer[];
    companyPhone: string | null;
    onClose: () => void;
    onDone: () => void;
}) {
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const choose = async (optionId: string) => {
        setSubmittingId(optionId);
        setError(null);
        try {
            const r = await fetch(`${API_BASE}/public/portal/${token}/estimates/${estimateId}/financing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ financingOptionId: optionId }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Could not request this payment plan");
            onDone();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmittingId(null);
        }
    };

    const sorted = [...offers].sort((a, b) => Number(a.monthlyPayment) - Number(b.monthlyPayment));

    return (
        <PortalSheet title="Pay monthly" subtitle={`Spread the ${rand(total)} quote over a payment plan.`} onClose={onClose}>
            <div className="space-y-3">
                {sorted.map(o => {
                    const monthly = Number(o.monthlyPayment);
                    const rate = Number(o.interestRate);
                    return (
                        <button
                            key={o.optionId}
                            onClick={() => choose(o.optionId)}
                            disabled={submittingId !== null}
                            className="w-full rounded-xl border border-border bg-white p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50/40 disabled:opacity-60"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-medium">{o.name}</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {o.termMonths} months · {rate > 0 ? `${rate}% p.a.` : "Interest-free"}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-semibold text-slate-900">{rand(monthly)}</p>
                                    <p className="text-xs text-muted-foreground">per month</p>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                                <span>Total repayable {rand(monthly * o.termMonths)}</span>
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                    {submittingId === o.optionId ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Requesting…</> : "Choose plan"}
                                </span>
                            </div>
                        </button>
                    );
                })}
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <p className="text-xs text-muted-foreground">
                    Requesting a plan doesn&apos;t approve the quote — you can approve it separately. Plans are subject to approval.
                </p>
                {companyPhone && <CallLink phone={companyPhone} label="Questions? Call us" />}
            </div>
        </PortalSheet>
    );
}
