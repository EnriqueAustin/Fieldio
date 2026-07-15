import {
    LayoutDashboard,
    Calendar,
    Users,
    Briefcase,
    Building2,
    Package,
    BookOpen,
    Bell,
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
    type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label?: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Projects", href: "/projects", icon: FolderKanban },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
            { label: "Calls", href: "/calls", icon: Phone },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle },
            { label: "Memberships", href: "/memberships", icon: Crown },
            { label: "Financing", href: "/financing", icon: CreditCard },
            { label: "Campaigns", href: "/campaigns", icon: Megaphone },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Vans / Teams", href: "/vans", icon: Truck },
            { label: "Time Tracking", href: "/time-tracking", icon: Clock },
            { label: "Inventory", href: "/inventory", icon: Package },
            { label: "Suppliers", href: "/suppliers", icon: Truck },
            { label: "Subcontractors", href: "/subcontractors", icon: HardHat },
            { label: "Permits", href: "/permits", icon: ClipboardCheck },
            { label: "Warranties", href: "/warranty-claims", icon: Shield },
            { label: "Certifications", href: "/certifications", icon: Award },
            { label: "Job Templates", href: "/job-templates", icon: FilePlus },
            { label: "Digital Forms", href: "/forms", icon: FileSignature },
            { label: "Flat Rate", href: "/flat-rate", icon: Wrench },
            { label: "Price Book", href: "/settings/price-book", icon: BookOpen },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "KPI Dashboard", href: "/kpi", icon: TrendingUp },
            { label: "Tech Scoreboard", href: "/scoreboard", icon: Award },
            { label: "Reports", href: "/reports", icon: BarChart3 },
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

const dispatcherGroups: NavGroup[] = [
    {
        items: [
            { label: "Dispatch", href: "/", icon: LayoutDashboard },
            { label: "Schedule", href: "/schedule", icon: Calendar },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
            { label: "Calls", href: "/calls", icon: Phone },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Vans / Teams", href: "/vans", icon: Truck },
            { label: "Subcontractors", href: "/subcontractors", icon: HardHat },
            { label: "Job Templates", href: "/job-templates", icon: FilePlus },
            { label: "Permits", href: "/permits", icon: ClipboardCheck },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

const officeGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
            { label: "Calls", href: "/calls", icon: Phone },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle },
            { label: "Memberships", href: "/memberships", icon: Crown },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

const csrGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
            { label: "Calls", href: "/calls", icon: Phone },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Leads", href: "/leads", icon: Filter },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

const salesGroups: NavGroup[] = [
    {
        items: [
            { label: "Pipeline", href: "/leads", icon: Filter },
            { label: "Quotes", href: "/estimates", icon: FileSignature },
            { label: "Customers", href: "/customers", icon: Users },
            { label: "Bookings", href: "/bookings", icon: Inbox },
            { label: "Jobs", href: "/jobs", icon: Briefcase },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
        ],
    },
    {
        label: "Growth",
        items: [
            { label: "Campaigns", href: "/campaigns", icon: Megaphone },
            { label: "Memberships", href: "/memberships", icon: Crown },
            { label: "Financing", href: "/financing", icon: CreditCard },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

const accountantGroups: NavGroup[] = [
    {
        items: [
            { label: "Dashboard", href: "/", icon: LayoutDashboard },
            { label: "Invoices", href: "/invoices", icon: Receipt },
            { label: "Statements", href: "/statements", icon: FileText },
            { label: "Credit Notes", href: "/credit-notes", icon: FileText },
            { label: "Dunning", href: "/dunning", icon: AlertTriangle },
        ],
    },
    {
        label: "Insights",
        items: [
            { label: "KPI Dashboard", href: "/kpi", icon: TrendingUp },
            { label: "Tech Scoreboard", href: "/scoreboard", icon: Award },
            { label: "Reports", href: "/reports", icon: BarChart3 },
            { label: "Time Tracking", href: "/time-tracking", icon: Clock },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
        ],
    },
];

const technicianGroups: NavGroup[] = [
    {
        items: [
            { label: "My Jobs", href: "/", icon: Briefcase },
            { label: "My Schedule", href: "/my-schedule", icon: Calendar },
            { label: "Inbox", href: "/inbox", icon: MessageSquare },
        ],
    },
    {
        label: "My Van",
        items: [
            { label: "Van Stock", href: "/my-van/stock", icon: Package },
            { label: "Time Tracking", href: "/time-tracking", icon: Clock },
        ],
    },
    {
        label: "Settings",
        items: [
            { label: "Notifications", href: "/settings/notifications", icon: Bell },
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

export type MobileNavItem = { label: string; href: string; icon: LucideIcon };

const technicianMobile: MobileNavItem[] = [
    { label: "Jobs", href: "/", icon: Briefcase },
    { label: "Schedule", href: "/my-schedule", icon: Calendar },
    { label: "Van", href: "/my-van/stock", icon: Package },
    { label: "Inbox", href: "/inbox", icon: MessageSquare },
];

const dispatcherMobile: MobileNavItem[] = [
    { label: "Dispatch", href: "/schedule", icon: Calendar },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Bookings", href: "/bookings", icon: Inbox },
    { label: "Inbox", href: "/inbox", icon: MessageSquare },
];

const officeMobile: MobileNavItem[] = [
    { label: "Home", href: "/", icon: LayoutDashboard },
    { label: "Jobs", href: "/jobs", icon: Briefcase },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Inbox", href: "/inbox", icon: MessageSquare },
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
