"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { MessageSquare, Send, Phone, Clock } from "lucide-react";

interface Thread {
    id: string;
    phone: string;
    channel: "SMS" | "WHATSAPP";
    status: string;
    unreadCount: number;
    lastMessageAt: string;
    customer?: { id: string; name: string; phone: string | null } | null;
    lastMessage?: { body: string; direction: string; createdAt: string } | null;
}

interface Message {
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    body: string;
    createdAt: string;
    status: string;
}

export default function InboxPage() {
    const qc = useQueryClient();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");

    const { data: threads = [], isLoading } = useQuery({
        queryKey: ["msg-threads"],
        queryFn: () => api.get("/messaging/threads").then((r) => r.data.data.threads as Thread[]),
        refetchInterval: 15_000,
    });

    const { data: thread } = useQuery({
        queryKey: ["msg-thread", selectedId],
        queryFn: () => api.get(`/messaging/threads/${selectedId}`).then((r) => r.data.data.thread),
        enabled: !!selectedId,
        refetchInterval: 10_000,
    });

    const sendMutation = useMutation({
        mutationFn: (vars: { phone: string; body: string; channel: string; customerId?: string }) =>
            api.post("/messaging/send", vars),
        onSuccess: () => {
            setDraft("");
            qc.invalidateQueries({ queryKey: ["msg-thread", selectedId] });
            qc.invalidateQueries({ queryKey: ["msg-threads"] });
        },
    });

    useEffect(() => {
        if (!selectedId && threads.length > 0) setSelectedId(threads[0].id);
    }, [threads, selectedId]);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="page-title flex items-center gap-2"><MessageSquare className="h-6 w-6" /> Inbox</h1>
                <p className="page-subtitle">Two-way SMS &amp; WhatsApp threads with your customers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)]">
                {/* thread list */}
                <div className="surface-card p-2 overflow-y-auto">
                    {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
                    {!isLoading && threads.length === 0 && (
                        <div className="p-6 text-center text-sm text-slate-500">No threads yet.</div>
                    )}
                    {threads.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setSelectedId(t.id)}
                            className={`w-full text-left rounded-lg p-3 mb-1 transition ${
                                selectedId === t.id ? "bg-slate-100" : "hover:bg-slate-50"
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="font-medium text-sm">
                                    {t.customer?.name || t.phone}
                                </div>
                                {t.unreadCount > 0 && (
                                    <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                                        {t.unreadCount}
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <span className="uppercase font-mono">{t.channel}</span>
                                <span>·</span>
                                <span>{t.phone}</span>
                            </div>
                            {t.lastMessage && (
                                <div className="text-xs text-slate-600 mt-1 line-clamp-1">
                                    {t.lastMessage.direction === "OUTBOUND" ? "You: " : ""}{t.lastMessage.body}
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                {/* conversation */}
                <div className="surface-card flex flex-col">
                    {!thread && (
                        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                            Select a conversation.
                        </div>
                    )}
                    {thread && (
                        <>
                            <div className="border-b px-4 py-3 flex items-center justify-between">
                                <div>
                                    <div className="font-semibold">{thread.customer?.name || thread.phone}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                        <Phone className="h-3 w-3" /> {thread.phone}
                                        <span className="ml-2 uppercase font-mono">{thread.channel}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {thread.messages?.map((m: Message) => (
                                    <div
                                        key={m.id}
                                        className={`max-w-[70%] rounded-lg p-2.5 text-sm ${
                                            m.direction === "OUTBOUND"
                                                ? "ml-auto bg-blue-600 text-white"
                                                : "bg-slate-100 text-slate-900"
                                        }`}
                                    >
                                        <div>{m.body}</div>
                                        <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.direction === "OUTBOUND" ? "text-blue-200" : "text-slate-500"}`}>
                                            <Clock className="h-2.5 w-2.5" />
                                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!draft.trim()) return;
                                    sendMutation.mutate({
                                        phone: thread.phone,
                                        body: draft,
                                        channel: thread.channel,
                                        customerId: thread.customerId,
                                    });
                                }}
                                className="border-t p-3 flex gap-2"
                            >
                                <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Type a message…"
                                    className="flex-1 rounded-lg border px-3 py-2 text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={sendMutation.isPending}
                                    className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1 hover:bg-slate-800 transition"
                                >
                                    <Send className="h-4 w-4" /> Send
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
