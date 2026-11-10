'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { defaultCompanySettings, formatCurrency, normalizeCompanySettings } from '@/lib/company-settings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Mirrors the whitelisted DTO from GET /public/payments/invoices/:token.
type PublicInvoice = {
    id: string;
    invoiceNumber: string | null;
    heading: string;
    status: string;
    issuedAt: string | null;
    dueDate: string | null;
    paidAt: string | null;
    jobTitle: string | null;
    items: Array<{ name: string; description: string | null; quantity: number; unitPrice: number; total: number }>;
    subtotal: number;
    tax: number;
    total: number;
    balance: number;
    taxLabel: string;
    taxRate: number;
    company: {
        name: string;
        registrationNumber: string | null;
        vatNumber: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        currency: string;
        locale: string;
    };
    customer: { name: string | null };
    property: {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
    } | null;
    paymentOptions: {
        card: boolean;
        payFast: boolean;
        eft: {
            bankName: string | null;
            accountName: string | null;
            accountNumber: string | null;
            branchCode: string | null;
            accountType: string | null;
            reference: string;
            instructions: string | null;
        } | null;
    };
    payments: Array<{ amount: number; method: string; date: string | null; status: string }>;
};

export default function PayPage() {
    const { token } = useParams<{ token: string }>();
    const search = useSearchParams();
    const status = search.get('status');
    const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API}/public/payments/invoices/${token}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.status === 'success') setInvoice(data.data.invoice);
                else setError(data.message ?? 'Invoice not found');
            })
            .catch(() => setError('Could not load invoice'))
            .finally(() => setLoading(false));
    }, [token]);

    const startCheckout = async () => {
        setPaying(true);
        setError(null);
        try {
            const res = await fetch(`${API}/public/payments/invoices/${token}/checkout`, {
                method: 'POST',
            });
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message ?? 'Checkout failed');
            window.location.href = data.data.session.url;
        } catch (e: any) {
            setError(e.message);
            setPaying(false);
        }
    };

    const startPayFast = async () => {
        setPaying(true);
        setError(null);
        try {
            const res = await fetch(`${API}/public/payments/invoices/${token}/payfast`, {
                method: 'POST',
            });
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message ?? 'PayFast checkout failed');
            window.location.href = data.data.session.url;
        } catch (e: any) {
            setError(e.message);
            setPaying(false);
        }
    };

    if (loading) return <Center>Loading…</Center>;
    if (!invoice) return <Center>{error ?? 'Invoice not found'}</Center>;

    const balance = Number(invoice.balance);
    const isPaid = invoice.status === 'PAID' || balance <= 0;
    const regional = normalizeCompanySettings({
        regional: { currency: invoice.company.currency, locale: invoice.company.locale },
    });
    const money = (value: number) => formatCurrency(Number(value), regional);
    const { card: canPayByCard, payFast: canPayByPayFast, eft } = invoice.paymentOptions;
    const hasOnlineOption = canPayByCard || canPayByPayFast;
    const property = invoice.property;
    const address = property
        ? [property.addressLine1, property.addressLine2, property.city, property.state, property.zip]
              .filter(Boolean)
              .join(', ')
        : '';
    const settledPayments = invoice.payments.filter((p) => p.status === 'SUCCEEDED');

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] py-12 px-4">
            <div className="max-w-4xl mx-auto grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{invoice.company.name}</p>
                        <h1 className="text-2xl font-semibold mt-1">{invoice.heading || 'Invoice'}</h1>
                    </div>
                    <a
                        href={`${API}/public/payments/invoices/${token}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                        Download invoice (PDF)
                    </a>
                </div>

                <div className="px-8 py-6 space-y-4">
                    {invoice.jobTitle && <Row label="Service">{invoice.jobTitle}</Row>}
                    <Row label="Invoice">{invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase()}</Row>
                    <Row label="Supplier">{invoice.company.name}</Row>
                    {invoice.company.registrationNumber && (
                        <Row label="Reg. No.">{invoice.company.registrationNumber}</Row>
                    )}
                    {invoice.company.vatNumber && (
                        <Row label={`${invoice.taxLabel} No.`}>{invoice.company.vatNumber}</Row>
                    )}
                    {invoice.customer.name && <Row label="Customer">{invoice.customer.name}</Row>}
                    {address && <Row label="Address">{address}</Row>}
                    {invoice.issuedAt && (
                        <Row label="Issued">{new Date(invoice.issuedAt).toLocaleDateString('en-ZA')}</Row>
                    )}
                    {invoice.dueDate && (
                        <Row label="Due">{new Date(invoice.dueDate).toLocaleDateString('en-ZA')}</Row>
                    )}
                </div>

                {/* Line items breakdown */}
                {invoice.items.length > 0 && (
                    <div className="px-8 py-4 border-t border-slate-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                    <th className="text-left py-2">Item</th>
                                    <th className="text-right py-2">Qty</th>
                                    <th className="text-right py-2">Price</th>
                                    <th className="text-right py-2">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoice.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2 text-slate-700">{item.name}</td>
                                        <td className="py-2 text-right text-slate-600">{item.quantity}</td>
                                        <td className="py-2 text-right text-slate-600">{money(item.unitPrice)}</td>
                                        <td className="py-2 text-right font-medium">{money(item.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="px-8 py-6 border-t border-slate-200 bg-slate-50">
                    <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-slate-600">Subtotal (excl. {invoice.taxLabel})</span>
                            <span>{money(invoice.subtotal)}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-slate-600">{invoice.taxLabel} ({invoice.taxRate}%)</span>
                            <span>{money(invoice.tax)}</span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-slate-200">
                            <span className="text-sm text-slate-600">Total (incl. {invoice.taxLabel})</span>
                            <span className="text-lg">{money(invoice.total)}</span>
                        </div>
                        {settledPayments.map((p, idx) => (
                            <div key={idx} className="flex items-baseline justify-between text-sm text-slate-600">
                                <span>
                                    Paid{p.date ? ` ${new Date(p.date).toLocaleDateString('en-ZA')}` : ''}
                                </span>
                                <span>−{money(p.amount)}</span>
                            </div>
                        ))}
                        <div className="flex items-baseline justify-between">
                            <span className="font-medium">Balance due</span>
                            <span className="text-2xl font-semibold">{money(Math.max(0, balance))}</span>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6 border-t border-slate-200">
                    {status === 'success' && (
                        <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">
                            Payment received — thank you!
                        </div>
                    )}
                    {status === 'cancel' && (
                        <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
                            Payment cancelled.
                        </div>
                    )}
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-rose-50 text-rose-800 text-sm">
                            {error}
                        </div>
                    )}

                    {isPaid ? (
                        <div className="text-center text-emerald-700 font-medium">Paid in full</div>
                    ) : (
                        <div className="space-y-3">
                            {canPayByPayFast && (
                                <button
                                    onClick={startPayFast}
                                    disabled={paying}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition disabled:opacity-60"
                                >
                                    {paying ? 'Redirecting…' : `Pay with PayFast ${money(balance)}`}
                                </button>
                            )}
                            {canPayByCard && (
                                <button
                                    onClick={startCheckout}
                                    disabled={paying}
                                    className="w-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium py-3 rounded-xl transition disabled:opacity-60"
                                >
                                    {paying ? 'Redirecting…' : `Pay by card ${money(balance)}`}
                                </button>
                            )}
                            {!hasOnlineOption && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    {eft
                                        ? 'Please pay by EFT using the bank details provided.'
                                        : 'Please contact us to arrange payment.'}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <aside className="bg-slate-950 text-white rounded-3xl p-6 shadow-xl shadow-slate-900/10">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-200">Payment details</p>
                <div className="mt-4 space-y-4 text-sm text-slate-300">
                    {eft && !isPaid && (
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                            <div className="font-medium text-emerald-100">Bank transfer / EFT</div>
                            <div className="mt-3 space-y-2 text-emerald-50/90">
                                {eft.bankName && <div>Bank: {eft.bankName}</div>}
                                {eft.accountName && <div>Account name: {eft.accountName}</div>}
                                {eft.accountNumber && <div>Account number: {eft.accountNumber}</div>}
                                {eft.branchCode && <div>Branch code: {eft.branchCode}</div>}
                                {eft.accountType && <div>Account type: {eft.accountType}</div>}
                                <div>Reference: {eft.reference}</div>
                                <div className="text-emerald-100/80">
                                    {eft.instructions || defaultCompanySettings.billing.eftDetails.paymentInstructions}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="font-medium text-white">Need help?</div>
                        <div className="mt-2 space-y-1">
                            {invoice.company.phone && <div>Call: {invoice.company.phone}</div>}
                            {invoice.company.email && <div>Email: {invoice.company.email}</div>}
                            {!invoice.company.phone && !invoice.company.email && (
                                <div>Contact {invoice.company.name} directly for payment support.</div>
                            )}
                        </div>
                    </div>
                </div>
            </aside>
            </div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-900 text-right">{children}</span>
        </div>
    );
}

function Center({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center text-slate-500">
            {children}
        </div>
    );
}
