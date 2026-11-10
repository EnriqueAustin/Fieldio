"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, BookOpen, KeyRound } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useAuthStore } from "../../../store/auth";

// Workspace settings only an owner can change. Everyone else would just get a
// 403 on arrival, so the tab is not offered to them.
const ADMIN_ONLY = [
    "/settings/company",
    "/settings/users",
    "/settings/price-book",
];

// Business Hours and Notifications are intentionally absent: those pages are not
// wired up yet (they carry a "coming soon" notice), so we don't route to them
// from the settings nav. The routes still exist for direct access.
const tabs = [
    { href: "/settings/company", label: "Company", icon: Building2 },
    { href: "/settings/users", label: "Team", icon: Users },
    { href: "/settings/price-book", label: "Price Book", icon: BookOpen },
    { href: "/settings/account", label: "My Account", icon: KeyRound },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const role = useAuthStore((s) => s.user?.role);
    const visibleTabs = tabs.filter((t) => role === "ADMIN" || !ADMIN_ONLY.includes(t.href));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your workspace and preferences.</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-border/70 -mx-1 overflow-x-auto scrollbar-thin">
                <nav className="flex gap-1 px-1 min-w-max">
                    {visibleTabs.map((tab) => {
                        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                                    active
                                        ? "border-slate-900 text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div>{children}</div>
        </div>
    );
}
