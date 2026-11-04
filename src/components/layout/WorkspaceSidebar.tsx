"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Bell, ChevronLeft, ChevronRight, ClipboardList,
  FilePlus2, LayoutDashboard, MapPinned, Network, ShieldCheck,
  UsersRound, type LucideIcon,
} from "lucide-react";
import type { AuthContext } from "@/lib/auth/profile";
import { isNavHrefActive } from "@/lib/upload/upload-ux-helpers";
import { NavPendingIndicator } from "./NavPendingIndicator";
import { cn } from "@/lib/utils";

type AppRole = AuthContext["user"]["role"];

interface SidebarLink {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: readonly AppRole[];
  requiresTriage?: boolean;
  requiresRoleManagement?: boolean;
  pendingReviewBadge?: boolean;
}
interface SidebarSection {
  heading: string;
  links: SidebarLink[];
}

const SECTION_DEFINITIONS: SidebarSection[] = [
  {
    heading: "Workspace",
    links: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/map", label: "Incident map", icon: MapPinned },
      { href: "/reports/new", label: "Upload photo", icon: FilePlus2 },
      { href: "/reports", label: "My reports", icon: ClipboardList },
    ],
  },
  {
    heading: "Response",
    links: [
      { href: "/incidents", label: "Incident threads", icon: Network, requiresTriage: true },
      { href: "/review", label: "Review queue", icon: ShieldCheck, roles: ["reviewer", "admin"], pendingReviewBadge: true },
      { href: "/notifications", label: "Notifications", icon: Bell, requiresTriage: true },
    ],
  },
  {
    heading: "Governance",
    links: [
      { href: "/audit", label: "Activity & audit", icon: Activity, roles: ["reviewer", "admin"] },
      { href: "/admin/users", label: "Manage roles", icon: UsersRound, roles: ["admin"], requiresRoleManagement: true },
    ],
  },
];

/** Presentation visibility only. Server routes and Supabase RLS enforce permissions independently. */
export function getWorkspaceNavSections(options: {
  role: AppRole;
  showIncidentNotifications: boolean;
  showRoleManagement: boolean;
}): SidebarSection[] {
  return SECTION_DEFINITIONS.map((section) => ({
    heading: section.heading,
    links: section.links.filter((link) =>
      (!link.roles || link.roles.includes(options.role)) &&
      (!link.requiresTriage || options.showIncidentNotifications) &&
      (!link.requiresRoleManagement || options.showRoleManagement),
    ),
  })).filter((section) => section.links.length > 0);
}

export interface WorkspaceSidebarProps {
  ctx: AuthContext;
  collapsed?: boolean;
  isMobile?: boolean;
  pendingReviewCount?: number;
  showIncidentNotifications?: boolean;
  showRoleManagement?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

const NAV_CLASSES = "group relative flex min-h-11 min-w-0 items-center rounded-ctl border border-transparent text-sm font-semibold transition-colors duration-200 hover:border-rule hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none";

export function WorkspaceSidebar({
  ctx,
  collapsed = false,
  isMobile = false,
  pendingReviewCount = 0,
  showIncidentNotifications = false,
  showRoleManagement = false,
  onToggleCollapse,
  onNavigate,
}: WorkspaceSidebarProps) {
  const pathname = usePathname() ?? "";
  const compact = collapsed && !isMobile;
  const sections = getWorkspaceNavSections({
    role: ctx.user.role,
    showIncidentNotifications,
    showRoleManagement,
  });

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-sheet text-ink" data-testid="workspace-sidebar">
      <div className={cn("flex min-h-16 items-center gap-2 border-b border-rule px-3", compact ? "justify-center" : "justify-between px-4")}>
        {!compact && (
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-tide">Field operations</p>
            <p className="m-0 truncate text-sm font-semibold">Navigation</p>
          </div>
        )}
        {!isMobile && (
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-ctl border border-rule text-[var(--ink-2)] transition-colors hover:bg-[var(--tide-wash)] hover:text-tide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!compact}
            onClick={onToggleCollapse}
          >
            {compact ? <ChevronRight size={19} aria-hidden="true" /> : <ChevronLeft size={19} aria-hidden="true" />}
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain p-3" aria-label="Workspace navigation">
        {sections.map((section) => (
          <div key={section.heading} className="grid gap-1">
            <p className={cn("m-0 px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-3)]", compact && "sr-only")}>
              {section.heading}
            </p>
            {section.links.map((item) => {
              const active = isNavHrefActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  title={compact ? item.label : undefined}
                  aria-label={compact ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    NAV_CLASSES,
                    compact ? "justify-center px-2" : "gap-3 px-3 py-2",
                    active && "border-[color:var(--tide)] bg-[var(--tide-wash)] text-tide",
                  )}
                >
                  <Icon className="size-[19px] shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
                  <span className={cn("min-w-0 flex-1 break-words", compact && "sr-only")}>{item.label}</span>
                  <NavPendingIndicator />
                  {item.pendingReviewBadge && pendingReviewCount > 0 && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full bg-tide px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--on-tide)]",
                        compact && "absolute right-0 top-0 size-4 p-0 text-center text-[9px] leading-4",
                      )}
                      aria-label={`${pendingReviewCount} pending reports`}
                    >
                      {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-rule p-3", compact ? "grid place-items-center" : "space-y-2 p-4")}>
        <div className={cn("flex items-center text-[var(--ink-2)]", compact ? "justify-center" : "gap-2")}>
          <ShieldCheck className="size-4 shrink-0 text-tide" aria-hidden="true" />
          <span className={cn("text-xs font-semibold", compact && "sr-only")}>Human-verified workflow</span>
        </div>
        {!compact && (
          <p className="m-0 text-xs leading-relaxed text-[var(--ink-3)]">
            Evidence-informed decision support. No automatic emergency dispatch.
          </p>
        )}
      </div>
    </div>
  );
}
