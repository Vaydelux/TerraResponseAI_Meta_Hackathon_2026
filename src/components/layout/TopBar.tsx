// src/components/layout/TopBar.tsx
//
// The sticky top navigation. Renders the wordmark + the primary nav
// (Overview / Incident Map / Submit Report / Reports / Incident Threads /
// Review Queue / Activity & Audit) + spacer + "+ New Report" CTA +
// theme toggle + user menu on desktop, and a clean collapsible drawer on
// tablet/mobile viewports.

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, PlusCircle } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { isNavHrefActive } from "@/lib/upload/upload-ux-helpers";
import type { AuthContext } from "@/lib/auth/profile";

export interface TopBarProps {
  ctx: AuthContext;
  /** Number of reports in the pending review queue (the count badge). */
  pendingReviewCount?: number;
  showIncidentNotifications?: boolean;
  showRoleManagement?: boolean;
  className?: string;
}

interface NavLink {
  href: string;
  label: string;
  showCount?: boolean;
  triageOnly?: boolean;
  roles?: string[];
}

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/map", label: "Incident Map" },
  { href: "/reports/new", label: "Upload Photo" },
  { href: "/reports", label: "Reports" },
  { href: "/incidents", label: "Incident threads", triageOnly: true },
  { href: "/review", label: "Review Queue", showCount: true, roles: ["reviewer", "admin"] },
  { href: "/audit", label: "Activity & Audit", roles: ["reviewer", "admin"] },
];

export function TopBar({
  ctx,
  pendingReviewCount = 0,
  showIncidentNotifications = false,
  showRoleManagement = false,
  className,
}: TopBarProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = NAV_LINKS.filter(
    (l) =>
      (!l.roles || l.roles.includes(ctx.user.role)) &&
      (!l.triageOnly || showIncidentNotifications),
  );
  const utilityLinks: NavLink[] = [
    ...(showIncidentNotifications ? [{ href: "/notifications", label: "Notifications" }] : []),
    ...(showRoleManagement && ctx.user.role === "admin"
      ? [{ href: "/admin/users", label: "User Roles" }]
      : []),
  ];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40 }}>
      <header className={`topbar${className ? ` ${className}` : ""}`}>
        <Wordmark href="/dashboard" />
        <nav className="nav" aria-label="Primary">
          {links.map((l) => {
            const active = isNavHrefActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="nav__link"
                aria-current={active ? "page" : undefined}
                style={{ whiteSpace: "nowrap" }}
              >
                {l.label}
                {l.showCount && pendingReviewCount > 0 && (
                  <span className="nav__count" aria-label={`${pendingReviewCount} pending`}>
                    {pendingReviewCount}
                  </span>
                )}
              </Link>
            );
          })}
          {utilityLinks.map((l) => {
            const active = isNavHrefActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="nav__link"
                aria-current={active ? "page" : undefined}
                style={{ whiteSpace: "nowrap" }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar__spacer" />

        <div className="topbar__desktop-only">
          <Link
            href="/reports/new"
            className="btn btn--primary btn--sm"
            style={{ minHeight: 36, paddingInline: 14, fontWeight: 700 }}
          >
            <PlusCircle size={15} aria-hidden="true" />
            <span>+ New Report</span>
          </Link>
          <ThemeToggle />
        </div>

        <UserMenu user={ctx.user} />

        <button
          type="button"
          className="topbar__mobile-toggle"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="mobile-nav-drawer" role="region" aria-label="Mobile navigation">
          <nav className="mobile-nav-drawer__links" aria-label="Mobile primary">
            {[...links, ...utilityLinks].map((l) => {
              const active = isNavHrefActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="mobile-nav-drawer__link"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{l.label}</span>
                  {l.showCount && pendingReviewCount > 0 && (
                    <span className="nav__count" aria-label={`${pendingReviewCount} pending`}>
                      {pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mobile-nav-drawer__controls">
            <Link
              href="/reports/new"
              className="btn btn--primary btn--sm"
              onClick={() => setMobileOpen(false)}
            >
              <PlusCircle size={15} aria-hidden="true" />
              <span>+ New Report</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
