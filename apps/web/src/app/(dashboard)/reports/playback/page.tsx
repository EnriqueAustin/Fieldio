"use client";

import { useEffect, useMemo, useState } from "react";
import api from "../../../../lib/api";
import { MapPin, Clock, Activity } from "lucide-react";

interface Tech { id: string; email: string; firstName?: string | null; lastName?: string | null }
interface Ping { id: string; lat: number; lng: number; createdAt: string; accuracy?: number | null }
interface Job {
    id: string; title: string; status: string; customer: string; address: string;
    destination: { lat: number; lng: number } | null;
    actualStart: string | null; actualEnd: string | null;
    scheduledStart: string | null; scheduledEnd: string | null;
    onSiteMinutes: number | null;
}
interface PlaybackData {
    userId: string; date: string; pings: Ping[]; jobs: Job[];
    totals: { jobsWorked: number; onSiteMinutes: number; pingsRecorded: number };
}

function bbox(pings: Ping[], jobs: Job[]) {
    const pts: Array<[number, number]> = [];
    pings.forEach(p => pts.push([p.lat, p.lng]));
    jobs.forEach(j => j.destination && pts.push([j.destination.lat, j.destination.lng]));
    if (pts.length === 0) return null;
    let minLat = pts[0][0], maxLat = pts[0][0], minLng = pts[0][1], maxLng = pts[0][1];
    for (const [la, ln] of pts) {
        if (la < minLat) minLat = la;
        if (la > maxLat) maxLat = la;
        if (ln < minLng) minLng = ln;
        if (ln > maxLng) maxLng = ln;
    }
    const padLat = Math.max(0.001, (maxLat - minLat) * 0.1);
    const padLng = Math.max(0.001, (maxLng - minLng) * 0.1);
    return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
}

export default function PlaybackPage() {
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const [techs, setTechs] = useState<Tech[]>([]);
    const [techId, setTechId] = useState<string>("");
    const [data, setData] = useState<PlaybackData | null>(null);

    useEffect(() => {
        api.get(`/tracking/active-techs?date=${date}`).then(r => {
            setTechs(r.data.data.techs);
            if (r.data.data.techs.length > 0 && !techId) setTechId(r.data.data.techs[0].id);
        });
    }, [date]);

    useEffect(() => {
        if (!techId) { setData(null); return; }
        api.get(`/tracking/playback/${techId}?date=${date}`).then(r => setData(r.data.data));
    }, [techId, date]);

    const box = useMemo(() => data ? bbox(data.pings, data.jobs) : null, [data]);

    const project = (lat: number, lng: number) => {
        if (!box) return { x: 50, y: 50 };
        const x = ((lng - box.minLng) / (box.maxLng - box.minLng)) * 600;
        const y = (1 - (lat - box.minLat) / (box.maxLat - box.minLat)) * 360;
        return { x, y };
    };

    const polyline = data
        ? data.pings.map(p => { const xy = project(p.lat, p.lng); return `${xy.x},${xy.y}`; }).join(" ")
        : "";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Route playback</h1>
                <p className="page-subtitle">Where each tech was, what they worked on, and how long they spent.</p>
            </div>

            <div className="surface-card p-4 flex flex-col md:flex-row gap-3">
                <div>
                    <label className="text-xs font-medium text-muted-foreground">Date</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
                    />
                </div>
                <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Technician</label>
                    <select
                        value={techId}
                        onChange={(e) => setTechId(e.target.value)}
                        className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                        {techs.length === 0 && <option value="">No activity recorded</option>}
                        {techs.map(t => (
                            <option key={t.id} value={t.id}>
                                {[t.firstName, t.lastName].filter(Boolean).join(' ') || t.email}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {data && (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="surface-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" /> Jobs worked</div>
                            <p className="text-2xl font-semibold mt-1">{data.totals.jobsWorked}</p>
                        </div>
                        <div className="surface-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4" /> Time on site</div>
                            <p className="text-2xl font-semibold mt-1">
                                {Math.floor(data.totals.onSiteMinutes / 60)}h {data.totals.onSiteMinutes % 60}m
                            </p>
                        </div>
                        <div className="surface-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-4 w-4" /> GPS pings</div>
                            <p className="text-2xl font-semibold mt-1">{data.totals.pingsRecorded}</p>
                        </div>
                    </div>

                    <div className="surface-card p-4">
                        <h3 className="text-sm font-medium mb-3">Route map (schematic)</h3>
                        {data.pings.length === 0 && data.jobs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No GPS data for this day.</p>
                        ) : (
                            <svg viewBox="0 0 600 360" className="w-full border border-border rounded-lg bg-slate-50/40">
                                {polyline && (
                                    <polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" opacity="0.7" />
                                )}
                                {data.jobs.filter(j => j.destination).map((j, i) => {
                                    const xy = project(j.destination!.lat, j.destination!.lng);
                                    return (
                                        <g key={j.id} transform={`translate(${xy.x},${xy.y})`}>
                                            <circle r="10" fill="#10b981" stroke="white" strokeWidth="2" />
                                            <text x="0" y="4" fontSize="11" textAnchor="middle" fill="white" fontWeight="bold">{i + 1}</text>
                                        </g>
                                    );
                                })}
                                {data.pings.length > 0 && (() => {
                                    const first = project(data.pings[0].lat, data.pings[0].lng);
                                    const last = project(data.pings[data.pings.length - 1].lat, data.pings[data.pings.length - 1].lng);
                                    return (
                                        <>
                                            <circle cx={first.x} cy={first.y} r="6" fill="#1e293b" stroke="white" strokeWidth="2" />
                                            <circle cx={last.x} cy={last.y} r="6" fill="#dc2626" stroke="white" strokeWidth="2" />
                                        </>
                                    );
                                })()}
                            </svg>
                        )}
                        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-800" />Start of day</span>
                            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-600" />End of day</span>
                            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Jobs</span>
                            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-blue-500" />Route</span>
                        </div>
                    </div>

                    <div className="surface-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/60 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 text-left w-10">#</th>
                                    <th className="px-4 py-3 text-left">Job</th>
                                    <th className="px-4 py-3 text-left">Scheduled</th>
                                    <th className="px-4 py-3 text-left">Actual</th>
                                    <th className="px-4 py-3 text-left">On-site</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {data.jobs.map((j, i) => (
                                    <tr key={j.id} className="hover:bg-slate-50/70">
                                        <td className="px-4 py-3 text-sm">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-sm">{j.title}</p>
                                            <p className="text-xs text-muted-foreground">{j.customer} · {j.address}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            {j.scheduledStart ? new Date(j.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            {' → '}
                                            {j.scheduledEnd ? new Date(j.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            {j.actualStart ? new Date(j.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            {' → '}
                                            {j.actualEnd ? new Date(j.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm tabular-nums">
                                            {j.onSiteMinutes != null ? `${j.onSiteMinutes} min` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs">{j.status}</td>
                                    </tr>
                                ))}
                                {data.jobs.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No jobs assigned this day</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
