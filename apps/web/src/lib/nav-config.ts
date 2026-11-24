import {
    LayoutDashboard,
    Calendar,
    Users,
    Briefcase,
    Building2,
    Package,
    BookOpen,
    Clock,
    UserCog,
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
    MessageSquare,
    Phone,
    Filter,
    TrendingUp,
    FileText,
    AlertTriangle,
    FilePlus,
    Receipt,
    Repeat,
    type LucideIcon,
} from "lucide-react";
import type { CompanyModules, ModuleKey } from "./company-settings";

// `module` tags an item as belonging to an optional module. Untagged items are
// core (Dashboard, Schedule, Jobs, Customers, Quotes, Invoices, Vans, Reports,
// Labour hours, Forms, Settings, Team) and always show. A tagged item shows only
// when the company has that module switched on.
export type NavItem = { label: string; href: string; icon: LucideIcon; module?: ModuleKey };
export type NavGroup = { label?: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Recurring plans", href: "/recurring", icon: Repeat },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Projects", href: "/projects", icon: FolderKanban, module: "projects" },
            { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter, module: "leads" },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
            { label: "Calls", href: "/calls", icon: Phone, module: "calls" },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText, module: "statements" },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText, module: "creditNotes" },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle, module: "dunning" },
            { label: "Memberships", href: "/memberships", icon: Crown, module: "memberships" },
            { label: "Financing", href: "/financing", icon: CreditCard, module: "financing" },
            { label: "Campaigns", href: "/campaigns", icon: Megaphone, module: "campaigns" },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Vans / Teams", href: "/vans", icon: Truck },
            { label: "Labour Hours", href: "/time-tracking", icon: Clock },
            { label: "Inventory", href: "/inventory", icon: Package, module: "inventory" },
            { label: "Suppliers", href: "/suppliers", icon: Truck, module: "suppliers" },
            { label: "Subcontractors", href: "/subcontractors", icon: HardHat, module: "subcontractors" },
            { label: "Permits", href: "/permits", icon: ClipboardCheck, module: "permits" },
            { label: "Warranties", href: "/warranty-claims", icon: Shield, module: "warrantyClaims" },
            { label: "Certifications", href: "/certifications", icon: Award, module: "certifications" },
            { label: "Job Templates", href: "/job-templates", icon: FilePlus },
            { label: "Digital Forms", href: "/forms", icon: FileSignature },
            { label: "Flat Rate", href: "/flat-rate", icon: Wrench, module: "flatRate" },
            { label: "Price Book", href: "/settings/price-book", icon: BookOpen },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "KPI Dashboard", href: "/kpi", icon: TrendingUp, module: "kpi" },
            { label: "Tech Scoreboard", href: "/scoreboard", icon: Award, module: "scoreboard" },
            { label: "Reports", href: "/reports", icon: BarChart3 },
        ],
    },
    {
        label: "Workspace",
        items: [
            { label: "Team", href: "/settings/users", icon: UserCog },
            { label: "My Account", href: "/settings/account", icon: UserCog },
            { label: "Company", href: "/settings/company", icon: Building2 },
        ],
    },
];

const dispatcherGroups: NavGroup[] = [
    {
        items: [
            { label: "Dispatch", href: "/", icon: LayoutDashboard },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Recurring plans", href: "/recurring", icon: Repeat },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
            { label: "Calls", href: "/calls", icon: Phone, module: "calls" },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Vans / Teams", href: "/vans", icon: Truck },
            { label: "Subcontractors", href: "/subcontractors", icon: HardHat, module: "subcontractors" },
            { label: "Job Templates", href: "/job-templates", icon: FilePlus },
            { label: "Permits", href: "/permits", icon: ClipboardCheck, module: "permits" },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

const officeGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Recurring plans", href: "/recurring", icon: Repeat },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter, module: "leads" },
            { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
            { label: "Calls", href: "/calls", icon: Phone, module: "calls" },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText, module: "statements" },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText, module: "creditNotes" },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle, module: "dunning" },
            { label: "Memberships", href: "/memberships", icon: Crown, module: "memberships" },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "Reports", href: "/reports", icon: BarChart3 },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

const csrGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
            { label: "Calls", href: "/calls", icon: Phone, module: "calls" },
            { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter, module: "leads" },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

const salesGroups: NavGroup[] = [
    {
        items: [
            { label: "Pipeline", href: "/leads", icon: Filter, module: "leads" },
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
        ],
    },
    {
        label: "Growth",
        items: [
            { label: "Campaigns", href: "/campaigns", icon: Megaphone, module: "campaigns" },
            { label: "Memberships", href: "/memberships", icon: Crown, module: "memberships" },
            { label: "Financing", href: "/financing", icon: CreditCard, module: "financing" },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

const accountantGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText, module: "statements" },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText, module: "creditNotes" },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle, module: "dunning" },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "KPI Dashboard", href: "/kpi", icon: TrendingUp, module: "kpi" },
            { label: "Tech Scoreboard", href: "/scoreboard", icon: Award, module: "scoreboard" },
            { label: "Reports", href: "/reports", icon: BarChart3 },
            { label: "Labour Hours", href: "/time-tracking", icon: Clock },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

const technicianGroups: NavGroup[] = [
    {
        items: [
            { label: "My Jobs", href: "/", icon: Briefcase },
            { label: "My Schedule", href: "/my-schedule", icon: Calendar },
            { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
        ],
    },
    {
        label: "My Van",
        items: [
            { label: "Van Stock", href: "/my-van/stock", icon: Package },
            { label: "My Hours", href: "/time-tracking", icon: Clock },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "My Account", href: "/settings/account", icon: UserCog },
        ],
    },
];

export function getNavGroupsForRole(role?: string | null): NavGroup[] {
    switch (role) {
        case "TECHNICIAN":
            return technicianGroups;
        case "DISPATCHER":
            return dispatcherGroups;
        case "OFFICE":
            return officeGroups;
        case "CSR":
            return csrGroups;
        case "SALES":
            return salesGroups;
        case "ACCOUNTANT":
            return accountantGroups;
        case "ADMIN":
        default:
            return adminGroups;
    }
}

export type MobileNavItem = { label: string; href: string; icon: LucideIcon; module?: ModuleKey };

// The clock is a technician's most-used control after the job list itself, so it
// earns a tab. It previously lived only in the sidebar, which is hidden on the
// phone that is the only device most technicians use.
const technicianMobile: MobileNavItem[] = [
    { label: "Jobs", href: "/", icon: Briefcase },
    { label: "Schedule", href: "/my-schedule", icon: Calendar },
    { label: "Hours", href: "/time-tracking", icon: Clock },
    { label: "Van", href: "/my-van/stock", icon: Package },
    { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
];

const dispatcherMobile: MobileNavItem[] = [
    { label: "Dispatch", href: "/schedule", icon: Calendar },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Bookings", href: "/bookings", icon: Inbox, module: "bookings" },
    { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
];

const officeMobile: MobileNavItem[] = [
    { label: "Home", href: "/", icon: LayoutDashboard },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Inbox", href: "/inbox", icon: MessageSquare, module: "inbox" },
];

const adminMobile: MobileNavItem[] = [
    { label: "Home", href: "/", icon: LayoutDashboard },
    { label: "Schedule", href: "/schedule", icon: Calendar },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Customers", href: "/customers", icon: Users },
];

export function getMobileNavForRole(role?: string | null): MobileNavItem[] {
    switch (role) {
        case "TECHNICIAN":
            return technicianMobile;
        case "DISPATCHER":
            return dispatcherMobile;
        case "OFFICE":
        case "CSR":
        case "SALES":
        case "ACCOUNTANT":
            return officeMobile;
        case "ADMIN":
        default:
            return adminMobile;
    }
}

// A tagged item shows only when its module is on. An untagged (core) item always
// shows. Until the company's modules have loaded, `modules` is undefined and only
// core items render — so the extras never flash in and then disappear.
const moduleVisible = (module: ModuleKey | undefined, modules?: CompanyModules): boolean =>
    !module || (modules ? modules[module] === true : false);

export function filterNavGroups(groups: NavGroup[], modules?: CompanyModules): NavGroup[] {
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => moduleVisible(item.module, modules)),
        }))
        .filter((group) => group.items.length > 0);
}

export function filterMobileNav(items: MobileNavItem[], modules?: CompanyModules): MobileNavItem[] {
    return items.filter((item) => moduleVisible(item.module, modules));
}
