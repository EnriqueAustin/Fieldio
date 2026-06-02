"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";
import {
    LayoutDashboard,
    Calendar,
    Users,
    Briefcase,
    Settings,
    LogOut,
    Building2,
    Package,
    BookOpen,
    Bell,
    Clock,
    UserCog,
    Search,
    ChevronsUpDown,
    Zap,
    Inbox,
    Truck,
    BarChart3,
    FolderKanban,
    FileSignature,
    Crown,
    Megaphone,
    ClipboardCheck,
    HardHat,
    CreditCard,
    Wrench,
    Shield,
    Award,
} from "lucide-react";
import { useAuthStore } from "../../store/auth";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "../notifications/notification-bell";

type NavItem = { label: string; href: string; icon: any };
type NavGroup = { label?: string; items: NavItem[] };

const navGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Projects", href: "/projects", icon: FolderKanban },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Customers", href: "/customers", icon: Users },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Memberships", href: "/memberships", icon: Crown },
            { label: "Financing", href: "/financing", icon: CreditCard },
            { label: "Campaigns", href: "/campaigns", icon: Megaphone },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Digital Forms", href: "/forms", icon: FileSignature },
            { label: "Time Tracking", href: "/time-tracking", icon: Clock },
            { label: "Inventory", href: "/inventory", icon: Package },
            { label: "Suppliers", href: "/suppliers", icon: Truck },
            { label: "Subcontractors", href: "/subcontractors", icon: HardHat },
            { label: "Permits", href: "/permits", icon: ClipboardCheck },
            { label: "Flat Rate", href: "/flat-rate", icon: Wrench },
            { label: "Price Book", href: "/settings/price-book", icon: BookOpen },
            { label: "Warranties", href: "/warranty-claims", icon: Shield },
            { label: "Certifications", href: "/certifications", icon: Award },
            { label: "Reports", href: "/reports", icon: BarChart3 },
            { label: "Hours", href: "/settings/business-hours", icon: Clock },
        ],
    },
    {
        label: "Workspace",
        items: [
            { label: "Team", href: "/settings/users", icon: UserCog },
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
            { label: "Company", href: "/settings/company", icon: Building2 },
        ],
    },
];

const techNavGroups: NavGroup[] = [
    {
        items: [
            { label: "My Jobs", href: "/", icon: Briefcase },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

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
                    {(user?.role === "TECHNICIAN" ? techNavGroups : navGroups).map((group, gi) => (
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
                            <div className="relative w-full">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="search"
                                    placeholder="Search jobs, customers, invoices…"
                                    className="w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                                />
                            </div>
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

                <main className="page-shell">{children}</main>
            </div>

            <MobileNav />
        </div>
    );
}
