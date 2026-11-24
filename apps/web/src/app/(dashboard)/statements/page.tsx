"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { FileText, Mail, Printer, Loader2, Users } from "lucide-react";

const money = (n: any) => `R ${Number(n || 0).toFixed(2)}`;
const esc = (s: any) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const d = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");

/** Build a clean, printable HTML statement (no PDF library — the browser's
 *  own print-to-PDF renders / downloads it). */
function renderStatementHtml(data: any): string {
    const customer = data.customer ?? data.statement?.customer ?? {};
    const s = data.statement ?? {};
    const inv = data.lines?.invoices ?? [];
    const pay = data.lines?.payments ?? [];
    const cred = data.lines?.credits ?? [];
    const period = `${d(s.periodStart)} – ${d(s.periodEnd)}`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(customer.name)}</title>
<style>
 body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px}
 h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;margin:0 0 20px}
 table{width:100%;border-collapse:collapse;margin:8px 0 20px}
 th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0}
 th{font-size:11px;text-transform:uppercase;color:#64748b}
 td.r,th.r{text-align:right} .totals{max-width:320px;margin-left:auto}
 .totals div{display:flex;justify-content:space-between;padding:3px 0}
 .totals .grand{border-top:2px solid #0f172a;font-weight:700;margin-top:4px;padding-top:6px}
 h2{font-size:13px;text-transform:uppercase;color:#64748b;margin:16px 0 4px}
 @media print{button{display:none}}
</style></head><body>
 <h1>Statement of account</h1>
 <p class="sub">${esc(customer.name)}${customer.email ? " · " + esc(customer.email) : ""}<br>Period: ${esc(period)}</p>

 <h2>Invoices</h2>
 <table><thead><tr><th>Number</th><th>Date</th><th>Status</th><th class="r">Total</th><th class="r">Balance</th></tr></thead><tbody>
 ${inv.length ? inv.map((i: any) => `<tr><td>${esc(i.invoiceNumber ?? "—")}</td><td>${d(i.createdAt)}</td><td>${esc(i.status)}</td><td class="r">${money(i.total)}</td><td class="r">${money(i.balance)}</td></tr>`).join("") : `<tr><td colspan="5" style="color:#94a3b8">None this period</td></tr>`}
 </tbody></table>

 <h2>Payments</h2>
 <table><thead><tr><th>Date</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>
 ${pay.length ? pay.map((p: any) => `<tr><td>${d(p.createdAt)}</td><td>${esc(p.method)}</td><td class="r">${money(p.amount)}</td></tr>`).join("") : `<tr><td colspan="3" style="color:#94a3b8">None this period</td></tr>`}
 </tbody></table>

 ${cred.length ? `<h2>Credit notes</h2><table><thead><tr><th>Number</th><th>Date</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>${cred.map((c: any) => `<tr><td>${esc(c.number ?? "—")}</td><td>${d(c.createdAt)}</td><td>${esc(c.status)}</td><td class="r">${money(c.total)}</td></tr>`).join("")}</tbody></table>` : ""}

 <div class="totals">
   <div><span>Opening balance</span><span>${money(data.openingBalance ?? s.openingBalance)}</span></div>
   <div><span>Invoiced</span><span>${money(data.invoicedTotal ?? s.invoicedTotal)}</span></div>
   <div><span>Payments</span><span>−${money(data.paymentsTotal ?? s.paymentsTotal)}</span></div>
   <div><span>Credits</span><span>−${money(data.creditsTotal ?? s.creditsTotal)}</span></div>
   <div class="grand"><span>Closing balance</span><span>${money(data.closingBalance ?? s.closingBalance)}</span></div>
 </div>
 <button onclick="window.print()" style="margin-top:16px;padding:8px 16px;border:1px solid #0f172a;border-radius:8px;background:#0f172a;color:#fff;cursor:pointer">Print / Save as PDF</button>
</body></html>`;
}

type BulkResult = { customerId: string; name: string; ok: boolean; closingBalance?: number; error?: string };

export default function StatementsPage() {
    const qc = useQueryClient();
    const [customerId, setCustomerId] = useState("");
    const [start, setStart] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
    const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
    const [viewing, setViewing] = useState<string | null>(null);
    const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number; results: BulkResult[] } | null>(null);

    const { data: customers = [] } = useQuery({
        queryKey: ["customers-light"],
        queryFn: () => api.get("/customers?limit=100").then((r) => r.data.data.items ?? []),
    });
    const { data: statements = [], isLoading } = useQuery({
        queryKey: ["statements"],
        queryFn: () => api.get("/statements").then((r) => r.data.data.statements),
    });

    const build = useMutation({
        mutationFn: () => api.post("/statements/build", { customerId, periodStart: start, periodEnd: end }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["statements"] }),
    });
    const email = useMutation({
        mutationFn: (id: string) => api.post(`/statements/${id}/email`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["statements"] }),
    });

    const view = async (id: string) => {
        setViewing(id);
        // Open the window synchronously so the browser does not block it as a popup.
        const win = window.open("", "_blank");
        try {
            const data = await api.get(`/statements/${id}`).then((r) => r.data.data);
            if (win) {
                win.document.write(renderStatementHtml(data));
                win.document.close();
            }
        } catch {
            win?.close();
            alert("Could not load the statement.");
        } finally {
            setViewing(null);
        }
    };

    // Month-end run: build a statement for every customer that has a balance.
    const buildForAll = async () => {
        const customersWithBalance: { customerId: string; name: string }[] = await api
            .get("/statements/outstanding-customers")
            .then((r) => r.data.data.customers ?? []);

        if (customersWithBalance.length === 0) {
            setBulk({ running: false, done: 0, total: 0, results: [] });
            return;
        }

        setBulk({ running: true, done: 0, total: customersWithBalance.length, results: [] });
        const results: BulkResult[] = [];
        for (const c of customersWithBalance) {
            try {
                const res = await api.post("/statements/build", {
                    customerId: c.customerId,
                    periodStart: start,
                    periodEnd: end,
                });
                results.push({ customerId: c.customerId, name: c.name, ok: true, closingBalance: Number(res.data.data.closingBalance) });
            } catch (e: any) {
                results.push({ customerId: c.customerId, name: c.name, ok: false, error: e?.response?.data?.message ?? "Failed" });
            }
            setBulk({ running: true, done: results.length, total: customersWithBalance.length, results: [...results] });
        }
        setBulk({ running: false, done: results.length, total: customersWithBalance.length, results });
        qc.invalidateQueries({ queryKey: ["statements"] });
    };

    return (
        <div className="space-y-4">
            <div>
                <h1 className="page-title flex items-center gap-2"><FileText className="h-6 w-6" /> Customer statements</h1>
                <p className="page-subtitle">Monthly statements with opening/closing balances.</p>
            </div>

            <div className="surface-card p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded border px-3 py-2 text-sm">
                        <option value="">Select customer…</option>
                        {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                    <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border px-3 py-2 text-sm" />
                    <button onClick={() => build.mutate()} disabled={!customerId || build.isPending} className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
                        {build.isPending ? "Building…" : "Build statement"}
                    </button>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                    <p className="text-xs text-slate-500">Run statements for the period above for every customer with an outstanding balance.</p>
                    <button
                        onClick={buildForAll}
                        disabled={bulk?.running}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                        {bulk?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Build for all with a balance
                    </button>
                </div>
            </div>

            {bulk && (
                <div className="surface-card p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                            {bulk.running ? "Building statements…" : "Statement run complete"}
                        </span>
                        <span className="text-slate-500">{bulk.done} / {bulk.total}</span>
                    </div>
                    {bulk.total === 0 ? (
                        <p className="text-sm text-slate-500">No customers currently have an outstanding balance.</p>
                    ) : (
                        <>
                            <div className="h-1.5 w-full rounded bg-slate-100 overflow-hidden">
                                <div className="h-full bg-slate-900 transition-all" style={{ width: `${bulk.total ? (bulk.done / bulk.total) * 100 : 0}%` }} />
                            </div>
                            <ul className="text-xs divide-y max-h-48 overflow-y-auto">
                                {bulk.results.map((r) => (
                                    <li key={r.customerId} className="flex items-center justify-between py-1.5">
                                        <span>{r.name}</span>
                                        {r.ok ? (
                                            <span className="text-emerald-600">Closing {money(r.closingBalance)}</span>
                                        ) : (
                                            <span className="text-rose-600">{r.error}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}

            <div className="surface-card overflow-hidden">
                {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                        <tr>
                            <th className="px-4 py-2">Customer</th>
                            <th>Period</th>
                            <th>Opening</th>
                            <th>Closing</th>
                            <th>Built</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {statements.map((s: any) => (
                            <tr key={s.id} className="border-t">
                                <td className="px-4 py-2">{s.customer?.name}</td>
                                <td className="text-xs">{new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}</td>
                                <td>R {Number(s.openingBalance).toFixed(2)}</td>
                                <td className="font-semibold">R {Number(s.closingBalance).toFixed(2)}</td>
                                <td className="text-xs">{new Date(s.createdAt).toLocaleString()}</td>
                                <td className="space-x-3 whitespace-nowrap">
                                    <button onClick={() => view(s.id)} disabled={viewing === s.id} className="text-xs text-slate-700 hover:underline inline-flex items-center gap-1 disabled:opacity-50">
                                        {viewing === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />} View / PDF
                                    </button>
                                    <button onClick={() => email.mutate(s.id)} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                        <Mail className="h-3 w-3" /> Email
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {statements.length === 0 && !isLoading && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400 italic">No statements yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
