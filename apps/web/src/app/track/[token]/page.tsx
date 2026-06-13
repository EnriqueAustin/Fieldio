"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapPin, User, Truck, Clock } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function TrackerPage() {
    const { token } = useParams<{ token: string }>();
    const [data, setData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        let mounted = true;
        const load = () => fetch(`${API}/public/track/${token}`)
            .then((r) => r.json())
            .then((j) => mounted && setData(j.data))
            .catch((e) => mounted && setErr(String(e)));
        load();
        const i = setInterval(load, 15000);
        return () => { mounted = false; clearInterval(i); };
    }, [token]);

    if (err) return <div className="p-6 text-rose-600">Failed to load tracker.</div>;
    if (!data) return <div className="p-6">Loading…</div>;

    const { job, customer, property, company, techLocation } = data;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-md mx-auto p-4 space-y-4">
                <div className="bg-white rounded-xl p-5 shadow-sm">
                    <div className="text-xs uppercase text-slate-500 tracking-wide">{company?.name}</div>
                    <div className="text-lg font-semibold mt-1">{job.title}</div>
                    <div className="text-sm text-slate-600 mt-0.5">Hi {customer?.name}, here's your live update.</div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
                    <Row icon={<Clock className="h-4 w-4" />} label="Status" value={job.status.replace(/_/g, " ")} />
                    <Row icon={<User className="h-4 w-4" />} label="Technician" value={job.techName || "Assigning…"} />
                    {job.scheduledStart && (
                        <Row icon={<Clock className="h-4 w-4" />} label="Scheduled" value={new Date(job.scheduledStart).toLocaleString()} />
                    )}
                    <Row icon={<MapPin className="h-4 w-4" />} label="Address" value={`${property?.addressLine1}, ${property?.city}`} />
                </div>

                {techLocation ? (
                    <div className="bg-white rounded-xl p-5 shadow-sm">
                        <div className="text-xs uppercase text-slate-500 tracking-wide mb-2">Tech location</div>
                        <div className="text-sm">
                            Last seen {new Date(techLocation.createdAt).toLocaleTimeString()}
                        </div>
                        <a
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.google.com/maps/dir/${techLocation.lat},${techLocation.lng}/${property?.geoLat ?? property?.addressLine1},${property?.geoLng ?? property?.city}`}
                            className="text-blue-600 text-sm hover:underline mt-2 inline-block"
                        >
                            Open in Google Maps
                        </a>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl p-5 shadow-sm text-sm text-slate-500">
                        Live location updates will appear here once the technician is en route.
                    </div>
                )}

                <div className="text-center text-xs text-slate-400">
                    Powered by Fieldio
                </div>
            </div>
        </div>
    );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <div className="text-slate-400 mt-0.5">{icon}</div>
            <div className="flex-1">
                <div className="text-xs uppercase text-slate-400">{label}</div>
                <div className="text-sm font-medium">{value}</div>
            </div>
        </div>
    );
}
