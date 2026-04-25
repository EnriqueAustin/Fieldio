"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";
import { LayoutDashboard, Calendar, Briefcase, Menu } from "lucide-react";

export function MobileNav() {
    const pathname = usePathname();

    const navItems = [
        { label: "Home", href: "/dashboard", icon: LayoutDashboard },
        { label: "Schedule", href: "/schedule", icon: Calendar },
        { label: "My Jobs", href: "/jobs", icon: Briefcase },
        { label: "Menu", href: "/settings/company", icon: Menu }, // Temporary "More" link
    ];

    return (
        <div className="fixed bottom-0 left-0 z-50 w-full border-t bg-background p-2 md:hidden">
            <nav className="flex justify-around items-center">
                {navItems.map((item, index) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={index}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <item.icon className={cn("h-6 w-6", isActive && "fill-current")} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
