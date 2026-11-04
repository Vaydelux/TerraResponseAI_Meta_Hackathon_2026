"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { NavPendingIndicator } from "./NavPendingIndicator";
import { isNavHrefActive } from "@/lib/upload/upload-ux-helpers";
import { cn } from "@/lib/utils";
import type { AuthContext } from "@/lib/auth/profile";

export interface TopBarProps {
  ctx: AuthContext;
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

const LINK_STATES = "rounded-ctl text-ink transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] aria-[current=page]:bg-[var(--tide-wash)] aria-[current=page]:text-tide motion-reduce:transition-none";

export function TopBar({
  ctx,
  pendingReviewCount = 0,
  showIncidentNotifications = false,
  showRoleManagement = false,
  className,
}: TopBarProps) {
  const pathname = usePathname() ?? "";
  const [navigation, setNavigation] = useState({ pathname, open: false });
  // Close synchronously on navigation, including browser back/forward.
  if (navigation.pathname !== pathname) setNavigation({ pathname, open: false });
  const mobileOpen = navigation.pathname === pathname && navigation.open;
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      setNavigation((previous) => ({ ...previous, open: false }));
      mobileToggleRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 1440px)");
    if (!desktop) return;
    let focusFrame: number | null = null;
    function closeAtDesktop(event: MediaQueryListEvent) {
      if (!event.matches) return;
      const focusInsideDrawer = mobileDrawerRef.current?.contains(document.activeElement);
      setNavigation((previous) => previous.open ? { ...previous, open: false } : previous);
      if (focusInsideDrawer) {
        focusFrame = window.requestAnimationFrame(() => {
          const nav = desktopNavRef.current;
          (nav?.querySelector<HTMLAnchorElement>('[aria-current="page"]') ??
            nav?.querySelector<HTMLAnchorElement>("a"))?.focus();
        });
      }
    }
    desktop.addEventListener?.("change", closeAtDesktop);
    return () => {
      desktop.removeEventListener?.("change", closeAtDesktop);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  const links = NAV_LINKS.filter((link) =>
    (!link.roles || link.roles.includes(ctx.user.role)) &&
    (!link.triageOnly || showIncidentNotifications),
  );
  const utilityLinks: NavLink[] = [
    ...(showIncidentNotifications ? [{ href: "/notifications", label: "Notifications" }] : []),
    ...(showRoleManagement && ctx.user.role === "admin"
      ? [{ href: "/admin/users", label: "User Roles" }] : []),
  ];
  const visibleLinks = [...links, ...utilityLinks];

  return (
    <div className={cn("sticky top-0 z-40 grid min-w-0 self-start border-b border-rule bg-sheet", className)}>
      <header className="flex min-h-14 min-w-0 items-center gap-2 px-3 py-1.5 sm:px-6 min-[1440px]:gap-4">
        <Wordmark href="/dashboard" className="min-h-11 min-w-0 gap-2 rounded-ctl transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none [&_.wordmark__name]:text-sm max-[379px]:[&_.wordmark__name]:text-[13px] max-[379px]:[&_.wordmark__mark]:size-6" />
        <nav ref={desktopNavRef} className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 min-[1440px]:flex" aria-label="Primary">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href}
              aria-current={isNavHrefActive(pathname, link.href) ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-2 text-[13px] font-semibold", LINK_STATES)}>
              {link.label}<NavPendingIndicator />
              {link.showCount && pendingReviewCount > 0 && <span className="rounded-full bg-tide px-1.5 py-0.5 text-xs tabular-nums text-[var(--on-tide)]" aria-label={`${pendingReviewCount} pending`}>
                {pendingReviewCount > 999 ? "999+" : pendingReviewCount}
              </span>}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden min-[1440px]:block"><ThemeToggle /></div>
          <UserMenu key={`${ctx.user.id}:${pathname}`} user={ctx.user} />
          <button ref={mobileToggleRef} type="button"
            className={cn("inline-flex size-11 shrink-0 items-center justify-center border border-rule min-[1440px]:hidden", LINK_STATES)}
            aria-expanded={mobileOpen} aria-controls="mobile-navigation"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setNavigation({ pathname, open: !mobileOpen })}>
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div ref={mobileDrawerRef} id="mobile-navigation" role="region" aria-label="Mobile navigation"
          className="grid max-h-[calc(100dvh-72px)] min-w-0 gap-3 overflow-y-auto overscroll-contain border-t border-rule p-3 sm:px-6 min-[1440px]:hidden">
          <nav className="grid min-w-0 gap-1 sm:grid-cols-2" aria-label="Mobile primary">
            {visibleLinks.map((link) => (
              <Link key={link.href} href={link.href}
                aria-current={isNavHrefActive(pathname, link.href) ? "page" : undefined}
                className={cn("flex min-h-11 min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm font-semibold", LINK_STATES)}
                onClick={() => setNavigation({ pathname, open: false })}>
                <span className="min-w-0 break-words">{link.label}<NavPendingIndicator /></span>
                {link.showCount && pendingReviewCount > 0 && <span className="shrink-0 rounded-full bg-tide px-2 py-0.5 text-xs tabular-nums text-[var(--on-tide)]" aria-label={`${pendingReviewCount} pending`}>
                  {pendingReviewCount > 999 ? "999+" : pendingReviewCount}
                </span>}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-3 pt-3">
            <span className="text-xs font-semibold text-[var(--ink-2)]">Appearance</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
