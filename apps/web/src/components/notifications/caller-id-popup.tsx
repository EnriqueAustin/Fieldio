"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { Phone, X, User, Briefcase } from "lucide-react";
import { useAuthStore } from "../../store/auth";

interface IncomingCall {
    fromNumber: string;
    customer?: { id: string; name: string; phone: string | null } | null;
    at: string;
}

export function CallerIdPopup() {
    const { accessToken } = useAuthStore();
    const [call, setCall] = useState<IncomingCall | null>(null);

    useEffect(() => {
        if (!accessToken) return;
        const socketUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const socket: Socket = io(socketUrl, {
            auth: { token: accessToken },
            path: "/socket.io",
            withCredentials: true,
        });
        socket.on("call:incoming", (data: IncomingCall) => {
            setCall(data);
        });
        return () => { socket.disconnect(); };
    }, [accessToken]);

    if (!call) return null;

    return (
        <div className="fixed top-4 right-4 z-50 w-80 bg-white rounded-xl shadow-xl border border-emerald-300 overflow-hidden animate-in slide-in-from-top">
            <div className="bg-emerald-500 text-white px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 animate-pulse" />
                    <span className="text-sm font-semibold">Incoming call</span>
                </div>
                <button onClick={() => setCall(null)} className="text-white hover:text-emerald-100">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {call.customer ? (
                            <>
                                <div className="font-semibold truncate">{call.customer.name}</div>
                                <div className="text-xs text-muted-foreground">{call.fromNumber}</div>
                            </>
                        ) : (
                            <>
                                <div className="font-semibold">Unknown caller</div>
                                <div className="text-xs text-muted-foreground">{call.fromNumber}</div>
                            </>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {call.customer ? (
                        <Link
                            href={`/customers/${call.customer.id}`}
                            onClick={() => setCall(null)}
                            className="text-xs bg-slate-900 text-white rounded-lg py-2 px-3 text-center hover:bg-slate-800 inline-flex items-center justify-center gap-1"
                        >
                            <User className="h-3 w-3" /> Open customer
                        </Link>
                    ) : (
                        <Link
                            href={`/customers/new?phone=${encodeURIComponent(call.fromNumber)}`}
                            onClick={() => setCall(null)}
                            className="text-xs bg-slate-900 text-white rounded-lg py-2 px-3 text-center hover:bg-slate-800 inline-flex items-center justify-center gap-1"
                        >
                            <User className="h-3 w-3" /> New customer
                        </Link>
                    )}
                    <Link
                        href={`/jobs/quick?customerId=${call.customer?.id ?? ""}&phone=${encodeURIComponent(call.fromNumber)}`}
                        onClick={() => setCall(null)}
                        className="text-xs bg-emerald-600 text-white rounded-lg py-2 px-3 text-center hover:bg-emerald-700 inline-flex items-center justify-center gap-1"
                    >
                        <Briefcase className="h-3 w-3" /> Quick job
                    </Link>
                </div>
            </div>
        </div>
    );
}
