"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, BookOpen, Bell, Clock } from "lucide-react";
import { cn } from "../../../lib/utils";

const tabs = [
    { href: "/settings/company", label: "Company", icon: Building2 },
    { href: "/settings/users", label: "Team", icon: Users },
    { href: "/settings/price-book", label: "Price Book", icon: BookOpen },
    { href: "/settings/notifications", label: "Notifications", icon: Bell },
    { href: "/settings/business-hours", label: "Business Hours", icon: Clock },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your workspace and preferences.</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-border/70 -mx-1 overflow-x-auto scrollbar-thin">
                <nav className="flex gap-1 px-1 min-w-max">
                    {tabs.map((tab) => {
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
