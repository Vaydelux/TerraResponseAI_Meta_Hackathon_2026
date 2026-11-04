"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { AuthContext } from "@/lib/auth/profile";
import { TopBar } from "./TopBar";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export interface WorkspaceFrameProps {
  ctx: AuthContext;
  pendingReviewCount?: number;
  showIncidentNotifications?: boolean;
  showRoleManagement?: boolean;
  children: ReactNode;
}

/**
 * Holds UI-only navigation state. Auth, incident data and feature flags
 * remain server-authoritative; this component never changes permissions.
 */
export function WorkspaceFrame({
  ctx,
  pendingReviewCount = 0,
  showIncidentNotifications = false,
  showRoleManagement = false,
  children,
}: WorkspaceFrameProps) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState({ pathname, open: false });
  const mobileOpen = drawer.open && drawer.pathname === pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeDrawer = () => setDrawer({ pathname, open: false });

  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawer({ pathname, open: false });
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore keyboard focus to the opener when the modal drawer closes.
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [mobileOpen, pathname]);

  const sidebarOptions = {
    ctx,
    pendingReviewCount,
    showIncidentNotifications,
    showRoleManagement,
  };

  return (
    <div className="isolate grid min-h-dvh min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-paper">
      <TopBar
        ctx={ctx}
        mobileOpen={mobileOpen}
        menuToggleRef={triggerRef}
        onToggleNavigation={() => setDrawer({ pathname, open: !mobileOpen })}
      />

      <div
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[var(--workspace-sidebar-width)_minmax(0,1fr)]"
        style={{ "--workspace-sidebar-width": collapsed ? "76px" : "264px" } as CSSProperties}
        data-sidebar-collapsed={collapsed}
      >
        <aside
          className="hidden min-w-0 border-r border-rule bg-sheet lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-4rem)]"
          aria-label="Desktop navigation"
          data-testid="desktop-workspace-sidebar"
        >
          <WorkspaceSidebar
            {...sidebarOptions}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((previous) => !previous)}
          />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col" data-testid="workspace-page-content">
          {children}
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" data-testid="workspace-mobile-drawer">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/65"
            aria-label="Close navigation overlay"
            onClick={closeDrawer}
          />
          <aside
            ref={dialogRef}
            id="workspace-mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[min(20rem,90vw)] min-w-0 flex-col border-r border-rule bg-sheet shadow-2xl outline-none motion-safe:animate-in motion-safe:slide-in-from-left-4"
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-rule px-3">
              <Wordmark href="/dashboard" className="[&_.wordmark__name]:text-sm" />
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-ctl border border-rule text-ink hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)]"
                aria-label="Close navigation menu"
                onClick={closeDrawer}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <WorkspaceSidebar {...sidebarOptions} isMobile onNavigate={closeDrawer} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-rule bg-sheet px-4 py-2 sm:hidden">
              <span className="text-xs font-semibold text-[var(--ink-2)]">Appearance</span>
              <ThemeToggle />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
