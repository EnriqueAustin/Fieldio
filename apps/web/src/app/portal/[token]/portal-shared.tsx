"use client";

import type { ReactNode } from "react";
import { Phone, X } from "lucide-react";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const rand = (n: number) =>
    `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Normalise a phone number for a tel: link (keeps a leading +). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function CallLink({ phone, label }: { phone: string; label?: string }) {
    return (
        <a
            href={telHref(phone)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
            <Phone className="h-4 w-4 text-emerald-600" /> {label ?? `Call ${phone}`}
        </a>
    );
}

/** Bottom sheet on phones, centred dialog from sm up — same pattern as the approval modal. */
export function PortalSheet({ title, subtitle, onClose, children }: {
    title: string; subtitle?: string; onClose: () => void; children: ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-white"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-4">
                    <div>
                        <h2 className="text-lg font-semibold">{title}</h2>
                        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>
    );
}
