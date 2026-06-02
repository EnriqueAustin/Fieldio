'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { defaultCompanySettings, formatCurrency, normalizeCompanySettings } from '@/lib/company-settings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Invoice = {
    id: string;
    invoiceNumber: string | null;
    status: string;
    subtotal: string | number;
    tax: string | number;
    total: string | number;
    balance: string | number;
    taxLabel?: string;
    taxRate?: string | number;
    taxNumber?: string | null;
    supplierName?: string | null;
    supplierCompanyRegistration?: string | null;
    paymentReference?: string | null;
    dueDate: string | null;
    items?: any;
    company: { name: string; settings?: unknown };
    job: {
        title: string;
        customer: { name: string; email: string | null };
        property: { addressLine1: string; city: string; state: string; zip: string };
    };
    payments: Array<{ id: string; amount: string; createdAt: string; status: string }>;
};

export default function PayPage() {
    const { token } = useParams<{ token: string }>();
    const search = useSearchParams();
    const status = search.get('status');
    const [invoice, setInvoice] = useState<Invoice | null>(null);
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
    if (error || !invoice) return <Center>{error ?? 'Invoice not found'}</Center>;

    const balance = Number(invoice.balance);
    const isPaid = invoice.status === 'PAID' || balance <= 0;
    const settings = normalizeCompanySettings(invoice.company.settings);
    const canPayByCard = settings.billing.paymentMethods.cardEnabled;
    const canPayByEft = settings.billing.paymentMethods.eftEnabled;
    const canPayByPayFast = settings.billing.paymentMethods.payFastEnabled;
    const money = (value: string | number) => formatCurrency(Number(value), settings);
    const reference =
        invoice.paymentReference ||
        invoice.invoiceNumber ||
        (settings.billing.eftDetails.referencePrefix
            ? `${settings.billing.eftDetails.referencePrefix}-${invoice.id.slice(0, 8).toUpperCase()}`
            : invoice.id.slice(0, 8).toUpperCase());

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] py-12 px-4">
            <div className="max-w-4xl mx-auto grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200 bg-slate-50">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{invoice.company.name}</p>
                    <h1 className="text-2xl font-semibold mt-1">Invoice payment</h1>
                </div>

                <div className="px-8 py-6 space-y-4">
                    <Row label="Service">{invoice.job.title}</Row>
                    <Row label="Invoice">{invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase()}</Row>
                    <Row label="Supplier">{invoice.supplierName || invoice.company.name}</Row>
                    {invoice.supplierCompanyRegistration && (
                        <Row label="Reg. No.">{invoice.supplierCompanyRegistration}</Row>
                    )}
                    {invoice.taxNumber && (
                        <Row label="VAT No.">{invoice.taxNumber}</Row>
                    )}
                    <Row label="Customer">{invoice.job.customer.name}</Row>
                    <Row label="Address">
                        {invoice.job.property.addressLine1}, {invoice.job.property.city}{' '}
                        {invoice.job.property.state} {invoice.job.property.zip}
                    </Row>
                    {invoice.dueDate && (
                        <Row label="Due">{new Date(invoice.dueDate).toLocaleDateString('en-ZA')}</Row>
                    )}
                </div>

                {/* Line items breakdown */}
                {Array.isArray(invoice.items) && invoice.items.length > 0 && (
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
                                {(invoice.items as any[]).map((item: any, idx: number) => (
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
                            <span className="text-sm text-slate-600">Subtotal (excl. {settings.billing.taxLabel})</span>
                            <span>{money(invoice.subtotal ?? 0)}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-slate-600">{settings.billing.taxLabel} ({settings.billing.taxRate}%)</span>
                            <span>{money(invoice.tax ?? 0)}</span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 border-t border-slate-200">
                            <span className="text-sm text-slate-600">Total (incl. {settings.billing.taxLabel})</span>
                            <span className="text-lg">{money(invoice.total)}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="font-medium">Balance due</span>
                            <span className="text-2xl font-semibold">{money(balance)}</span>
                        </div>
                    </div>
                    {invoice.taxNumber && (
                        <div className="mt-3 text-xs text-slate-500">
                            {settings.billing.taxLabel} Registration: {invoice.taxNumber}
                        </div>
                    )}
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
                            {canPayByCard && (
                                <button
                                    onClick={startCheckout}
                                    disabled={paying}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition disabled:opacity-60"
                                >
                                    {paying ? 'Redirecting…' : `Pay by card ${money(balance)}`}
                                </button>
                            )}
                            {canPayByPayFast && (
                                <button
                                    onClick={startPayFast}
                                    disabled={paying}
                                    className="w-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium py-3 rounded-xl transition disabled:opacity-60"
                                >
                                    {paying ? 'Redirecting...' : `Pay with PayFast ${money(balance)}`}
                                </button>
                            )}
                            {!canPayByCard && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    Online card payments are currently disabled for this invoice.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <aside className="bg-slate-950 text-white rounded-3xl p-6 shadow-xl shadow-slate-900/10">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-200">Payment options</p>
                <h2 className="mt-3 text-2xl font-semibold">Built for local and international customers</h2>
                <div className="mt-6 space-y-4 text-sm text-slate-300">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="font-medium text-white">Primary market</div>
                        <div className="mt-1">
                            {settings.regional.homeMarket === 'ZA'
                                ? 'South Africa-first setup with VAT and EFT support.'
                                : 'International setup with flexible currency and tax handling.'}
                        </div>
                    </div>

                    {canPayByEft && (
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                            <div className="font-medium text-emerald-100">Bank transfer / EFT</div>
                            <div className="mt-3 space-y-2 text-emerald-50/90">
                                {settings.billing.eftDetails.bankName && <div>Bank: {settings.billing.eftDetails.bankName}</div>}
                                {settings.billing.eftDetails.accountName && <div>Account name: {settings.billing.eftDetails.accountName}</div>}
                                {settings.billing.eftDetails.accountNumber && <div>Account number: {settings.billing.eftDetails.accountNumber}</div>}
                                {settings.billing.eftDetails.branchCode && <div>Branch code: {settings.billing.eftDetails.branchCode}</div>}
                                {settings.billing.eftDetails.accountType && <div>Account type: {settings.billing.eftDetails.accountType}</div>}
                                <div>Reference: {reference}</div>
                                <div className="text-emerald-100/80">
                                    {settings.billing.eftDetails.paymentInstructions || defaultCompanySettings.billing.eftDetails.paymentInstructions}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="font-medium text-white">Need help?</div>
                        <div className="mt-2 space-y-1">
                            {settings.contact.phone && <div>Call: {settings.contact.phone}</div>}
                            {settings.contact.email && <div>Email: {settings.contact.email}</div>}
                            {!settings.contact.phone && !settings.contact.email && (
                                <div>Contact the service provider directly for payment support.</div>
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
        <div className="flex justify-between text-sm">
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
