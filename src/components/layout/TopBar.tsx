// src/components/layout/TopBar.tsx
//
// The sticky top navigation. Renders the wordmark + the primary nav
// (Overview / Reports / Incident Map / Review queue / Audit) + spacer +
// the event switcher + theme toggle + user menu on desktop, and a
// clean collapsible drawer on tablet/mobile viewports (<960px).

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { EventSwitcher } from "./EventSwitcher";
import { UserMenu } from "./UserMenu";
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
  { href: "/reports", label: "Reports" },
  { href: "/incidents", label: "Incident threads", triageOnly: true },
  { href: "/map", label: "Incident Map" },
  { href: "/review", label: "Review Queue", showCount: true, roles: ["reviewer", "admin"] },
  { href: "/audit", label: "Audit & Spend", roles: ["reviewer", "admin"] },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopBar({ ctx, pendingReviewCount = 0, showIncidentNotifications = false, showRoleManagement = false, className }: TopBarProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = NAV_LINKS.filter((l) => (!l.roles || l.roles.includes(ctx.user.role)) && (!l.triageOnly || showIncidentNotifications));
  const utilityLinks: NavLink[] = [...(showIncidentNotifications ? [{ href: "/notifications", label: "Notifications" }] : []), ...(showRoleManagement && ctx.user.role === "admin" ? [{ href: "/admin/users", label: "User roles" }] : [])];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40 }}>
      <header className={`topbar${className ? ` ${className}` : ""}`}>
        <Wordmark />
        <nav className="nav" aria-label="Primary">
          {links.map((l) => {
            const active = isActive(pathname, l.href);
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
        </nav>
        {utilityLinks.map(l => <Link key={l.href} href={l.href} className="nav__link" aria-current={isActive(pathname,l.href) ? "page" : undefined}>{l.label}</Link>)}
        <div className="topbar__spacer" />
        <div className="topbar__desktop-only">
          <EventSwitcher events={ctx.events} />
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
              const active = isActive(pathname, l.href);
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
            <EventSwitcher events={ctx.events} />
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
