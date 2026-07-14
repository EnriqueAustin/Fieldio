"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { LogOut, Search, ChevronsUpDown, Zap, Briefcase, FileText, User as UserIcon, Loader2 } from "lucide-react";
import { useAuthStore } from "../../store/auth";
import api from "../../lib/api";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "../notifications/notification-bell";
import { CallerIdPopup } from "../notifications/caller-id-popup";
import { getNavGroupsForRole } from "../../lib/nav-config";
import { OfflineBanner } from "../offline/offline-banner";

interface SearchResults {
    customers: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
    jobs: Array<{ id: string; title: string; status: string; customer: { name: string } | null }>;
    invoices: Array<{ id: string; invoiceNumber: string | null; status: string; total: string }>;
}

const EMPTY_RESULTS: SearchResults = { customers: [], jobs: [], invoices: [] };

/** Debounced global quick-search wired to GET /search. Replaces the old
 *  decorative topbar input — keyboard-and-click navigable to records. */
function GlobalSearch() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults(EMPTY_RESULTS);
            setLoading(false);
            return;
        }
        setLoading(true);
        const handle = setTimeout(() => {
            api.get(`/search?q=${encodeURIComponent(term)}`)
                .then((res) => setResults(res.data?.data ?? EMPTY_RESULTS))
                .catch(() => setResults(EMPTY_RESULTS))
                .finally(() => setLoading(false));
        }, 250);
        return () => clearTimeout(handle);
    }, [query]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const go = (href: string) => {
        setOpen(false);
        setQuery("");
        router.push(href);
    };

    const total = results.customers.length + results.jobs.length + results.invoices.length;
    const showPanel = open && query.trim().length >= 2;

    return (
        <div ref={containerRef} className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Search jobs, customers, invoices…"
                className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            {showPanel && (
                <div className="absolute left-0 right-0 top-full mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-white shadow-lg z-50">
                    {loading && total === 0 ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                        </div>
                    ) : total === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No matches for “{query.trim()}”</div>
                    ) : (
                        <div className="py-2">
                            {results.customers.length > 0 && (
                                <div>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customers</div>
                                    {results.customers.map((c) => (
                                        <button key={c.id} onClick={() => go(`/customers/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                                            <UserIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">{c.name}</div>
                                                <div className="text-xs text-muted-foreground truncate">{c.email || c.phone || ""}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {results.jobs.length > 0 && (
                                <div>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jobs</div>
                                    {results.jobs.map((j) => (
                                        <button key={j.id} onClick={() => go(`/jobs/${j.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                                            <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">{j.title}</div>
                                                <div className="text-xs text-muted-foreground truncate">{j.customer?.name ?? ""} · {j.status.replace("_", " ")}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {results.invoices.length > 0 && (
                                <div>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</div>
                                    {results.invoices.map((inv) => (
                                        <button key={inv.id} onClick={() => go(`/invoices`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">{inv.invoiceNumber || inv.id.slice(0, 8)}</div>
                                                <div className="text-xs text-muted-foreground truncate">R {Number(inv.total).toFixed(2)} · {inv.status}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, logout } = useAuthStore();

    const handleLogout = async () => {
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } finally {
            logout();
            window.location.href = "/login";
        }
    };

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

    return (
        <div className="min-h-screen bg-[hsl(var(--background))]">
            {/* Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[hsl(var(--sidebar))] sm:flex">
                {/* Brand */}
                <div className="flex h-16 shrink-0 items-center gap-2 px-5 border-b border-white/5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                        <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-white font-semibold tracking-tight">Fieldio</span>
                        <span className="text-[11px] text-slate-400">Field Service OS</span>
                    </div>
                </div>

                {/* Nav */}
                <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
                    {getNavGroupsForRole(user?.role).map((group, gi) => (
                        <div key={gi} className={gi > 0 ? "mt-6" : ""}>
                            {group.label && (
                                <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    {group.label}
                                </div>
                            )}
                            <nav className="grid gap-0.5">
                                {group.items.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "nav-link group",
                                                active ? "nav-link-active" : "nav-link-idle"
                                            )}
                                        >
                                            <item.icon
                                                className={cn(
                                                    "h-4 w-4 transition-colors",
                                                    active ? "text-white" : "text-slate-400 group-hover:text-white"
                                                )}
                                            />
                                            <span>{item.label}</span>
                                            {active && (
                                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    ))}
                </div>

                {/* User */}
                <div className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition cursor-default">
                        <Avatar className="h-9 w-9 ring-2 ring-white/10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-medium">
                                {user?.email?.[0]?.toUpperCase() ?? "U"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user?.companyName}</p>
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                        <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                    </div>
                    <button
                        onClick={handleLogout}
                        className="mt-2 w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition"
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <div className="sm:pl-64 pb-16 sm:pb-0">
                {/* Topbar */}
                <header className="sticky top-0 z-20 border-b border-border/60 bg-white/80 backdrop-blur-md">
                    <div className="flex h-16 items-center gap-4 px-6 lg:px-8">
                        <div className="flex flex-1 items-center gap-3 max-w-md">
                            <GlobalSearch />
                        </div>
                        <div className="flex items-center gap-2">
                            <NotificationBell />
                            <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-border">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-medium">
                                        {user?.email?.[0]?.toUpperCase() ?? "U"}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col leading-tight">
                                    <span className="text-xs font-medium">{user?.name || user?.email?.split("@")[0]}</span>
                                    <span className="text-[10px] text-muted-foreground capitalize">
                                        {user?.role?.toLowerCase()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {user?.role === "TECHNICIAN" && <OfflineBanner />}

                <main className="page-shell">{children}</main>
            </div>

            <MobileNav />
            <CallerIdPopup />
        </div>
    );
}
