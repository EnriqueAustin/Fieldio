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
        <div className="fixed bottom-0 left-0 z-50 w-full border-t bg-background p-2 md:hidden">
            <nav className="flex justify-around items-center">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
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
