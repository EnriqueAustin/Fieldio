"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LogOut, X } from "lucide-react";
import { cn, displayName } from "../../lib/utils";
import { useAuthStore } from "../../store/auth";
import { getNavGroupsForRole, getMobileNavForRole } from "../../lib/nav-config";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface AccountSheetProps {
    open: boolean;
    onClose: () => void;
    onLogout: () => void;
}

/**
 * Mobile account drawer.
 *
 * The sidebar — which holds the only "Log out" control and every nav item that
 * doesn't fit the bottom bar — is hidden below `md`. Without this sheet a
 * technician on a phone (their only device) cannot sign out, open their
 * account, or reach Time Tracking at all.
 *
 * Deliberately not a Radix dialog: this must stay reliable offline and needs no
 * portal/animation machinery.
 */
export function AccountSheet({ open, onClose, onLogout }: AccountSheetProps) {
    const pathname = usePathname();
    const { user } = useAuthStore();

    // Anything already one tap away in the bottom bar is left out of the sheet.
    const bottomBarHrefs = new Set(getMobileNavForRole(user?.role).map((item) => item.href));
    const groups = getNavGroupsForRole(user?.role)
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => !bottomBarHrefs.has(item.href)),
        }))
        .filter((group) => group.items.length > 0);

    // Close on route change and on Escape.
    useEffect(() => {
        if (open) onClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        // Stop the page behind the sheet from scrolling under the finger.
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Account">
            <button
                type="button"
                aria-label="Close account menu"
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/50"
            />

            <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-background shadow-xl">
                <div className="flex items-center gap-3 border-b border-border px-4 py-4">
                    <Avatar className="h-11 w-11">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-medium text-white">
                            {displayName(user, user?.email ?? "U")[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-tight">
                            {displayName(user, user?.email ?? "Signed in")}
                        </p>
                        <p className="truncate text-xs capitalize text-muted-foreground">
                            {user?.role?.toLowerCase()} · {user?.companyName}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:scale-95"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3">
                    {groups.map((group, gi) => (
                        <div key={gi} className={gi > 0 ? "mt-5" : ""}>
                            {group.label && (
                                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {group.label}
                                </div>
                            )}
                            <nav className="grid gap-0.5">
                                {group.items.map((item) => {
                                    const active =
                                        item.href === "/"
                                            ? pathname === "/"
                                            : pathname === item.href || pathname.startsWith(item.href + "/");
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onClose}
                                            className={cn(
                                                "flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition active:scale-[0.99]",
                                                active
                                                    ? "bg-slate-900 text-white"
                                                    : "text-foreground hover:bg-slate-50"
                                            )}
                                        >
                                            <item.icon
                                                className={cn(
                                                    "h-5 w-5 shrink-0",
                                                    active ? "text-white" : "text-slate-400"
                                                )}
                                            />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    ))}
                </div>

                <div
                    className="border-t border-border p-3"
                    style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
                >
                    <button
                        type="button"
                        onClick={onLogout}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-[15px] font-semibold text-rose-700 active:scale-[0.99]"
                    >
                        <LogOut className="h-5 w-5" />
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
