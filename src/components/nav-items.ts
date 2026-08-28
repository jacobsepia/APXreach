import {
  BarChart3,
  Building2,
  CheckSquare,
  Inbox,
  LayoutGrid,
  Megaphone,
  Settings,
  Target,
  Ticket,
  Users,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
};

export const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/deals", label: "Deals", icon: Target },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export const bottomNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
