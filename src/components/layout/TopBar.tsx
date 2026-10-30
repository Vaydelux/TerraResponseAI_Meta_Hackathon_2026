// src/components/layout/TopBar.tsx
//
// The sticky top navigation. Renders the wordmark + the primary nav
// (Dashboard / Reports / Map / Review queue) + spacer + the event
// switcher + theme toggle + user menu. The Review link includes a
// `<span class="nav__count">` showing the pending count (passed as a
// prop). The active link carries `aria-current="page"`.
//
// Client component — needs the usePathname() hook for the active
// link state, the ThemeToggle for theme persistence, the
// EventSwitcher for the cookie, and the UserMenu for the popover.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { EventSwitcher } from "./EventSwitcher";
import { UserMenu } from "./UserMenu";
import type { AuthContext } from "@/lib/auth/profile";

export interface TopBarProps {
  ctx: AuthContext;
  /** Number of reports in the pending review queue (the count badge). */
  pendingReviewCount?: number;
  className?: string;
}

interface NavLink {
  href: string;
  label: string;
  showCount?: boolean;
  roles?: string[];
}

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/map", label: "Map" },
  { href: "/review", label: "Review queue", showCount: true, roles: ["reviewer", "admin"] },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopBar({ ctx, pendingReviewCount = 0, className }: TopBarProps) {
  const pathname = usePathname() ?? "";
  const links = NAV_LINKS.filter((l) => !l.roles || l.roles.includes(ctx.user.role));
  return (
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
      <div className="topbar__spacer" />
      <EventSwitcher events={ctx.events} />
      <ThemeToggle />
      <UserMenu user={ctx.user} />
    </header>
  );
}
