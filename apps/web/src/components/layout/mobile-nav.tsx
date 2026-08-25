"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/auth";
import { getMobileNavForRole } from "../../lib/nav-config";

export function MobileNav() {
    const pathname = usePathname();
    const { user } = useAuthStore();
    const navItems = getMobileNavForRole(user?.role);

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

    return (
        <div className="mobile-nav-bar">
            <nav className="flex h-full items-stretch justify-around">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors",
                                active ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <item.icon className={cn("h-6 w-6", active && "fill-current")} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
