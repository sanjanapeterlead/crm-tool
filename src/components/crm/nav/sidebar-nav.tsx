"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Kanban,
  ListChecks,
  CalendarClock,
  UserCog,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/lib/domain/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  roles?: OrgRole[];
}

/**
 * Navigation is a UX affordance, not a security boundary — every page and
 * action enforces the role itself. The home link reads "Today" for a
 * salesperson (their work queue) and "Dashboard" for owners and managers.
 */
function navItemsFor(role: OrgRole): NavItem[] {
  const isLead = role === "admin" || role === "manager";
  const items: NavItem[] = [
    { href: "/", label: isLead ? "Dashboard" : "Today", icon: LayoutDashboard },
    { href: "/today", label: "My Today", icon: CalendarDays, roles: ["admin", "manager"] },
    { href: "/leads", label: "Leads", icon: Users },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/followups", label: "Follow-ups", icon: ListChecks },
    { href: "/meetings", label: "Meetings", icon: CalendarClock },
    { href: "/team", label: "Team", icon: UserCog, roles: ["admin", "manager"] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
  ];
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

export function SidebarNav({ role }: { role: OrgRole }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {navItemsFor(role).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            {active && (
              <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-sidebar-primary" />
            )}
            <Icon className={cn("size-4 transition-transform group-hover:scale-110", active && "text-sidebar-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
