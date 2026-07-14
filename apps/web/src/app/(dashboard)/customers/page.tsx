"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "../../../lib/api";
import { Plus, Search, Users, Mail, Phone, Building, ArrowUpRight, Upload } from "lucide-react";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { cn } from "../../../lib/utils";

interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    _count: { properties: number; jobs: number };
}

export default function CustomersPage() {
    const [search, setSearch] = useState("");
    const [submittedSearch, setSubmittedSearch] = useState("");

    const { data, isLoading: loading } = useQuery({
        queryKey: ["customers", submittedSearch],
        queryFn: () =>
            api.get(`/customers?search=${encodeURIComponent(submittedSearch)}`).then((res) => res.data.data.items ?? []),
    });
    const customers: Customer[] = data ?? [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Customers</h1>
                    <p className="page-subtitle">View and manage your client base.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/customers/import"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
                    >
                        <Upload className="h-4 w-4" />
                        Import
                    </Link>
                    <Link
                        href="/customers/new"
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
                    >
                        <Plus className="h-4 w-4" />
                        New customer
                    </Link>
                </div>
            </div>

            <div className="surface-card p-3">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setSubmittedSearch(search);
                    }}
                    className="relative"
                >
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, email, or phone…"
                        className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                </form>
            </div>

            {loading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="surface-card p-5 h-28 animate-pulse" />
                    ))}
                </div>
            ) : customers.length === 0 ? (
                <div className="surface-card flex flex-col items-center text-center py-16 px-6">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Users className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium">No customers yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Add your first customer to get started.
                    </p>
                    <Link
                        href="/customers/new"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                        <Plus className="h-4 w-4" /> New customer
                    </Link>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {customers.map((c) => (
                        <Link
                            key={c.id}
                            href={`/customers/${c.id}`}
                            className="surface-card p-5 group hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition-all"
                        >
                            <div className="flex items-start gap-3">
                                <Avatar className="h-11 w-11">
                                    <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 text-sm font-medium">
                                        {c.name.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-medium truncate">{c.name}</p>
                                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                        {c.email && (
                                            <div className="flex items-center gap-1.5 truncate">
                                                <Mail className="h-3 w-3" />
                                                {c.email}
                                            </div>
                                        )}
                                        {c.phone && (
                                            <div className="flex items-center gap-1.5">
                                                <Phone className="h-3 w-3" />
                                                {c.phone}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-4 text-xs">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <Building className="h-3 w-3" />
                                    {c._count.properties} properties
                                </span>
                                <span
                                    className={cn(
                                        "stat-chip",
                                        c._count.jobs > 0
                                            ? "bg-blue-50 text-blue-700"
                                            : "bg-slate-100 text-slate-600"
                                    )}
                                >
                                    {c._count.jobs} jobs
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
