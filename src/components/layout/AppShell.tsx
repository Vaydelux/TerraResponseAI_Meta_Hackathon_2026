import type { ReactNode } from "react";
import Link from "next/link";
import { TopBar } from "./TopBar";
import { DemoBanner } from "./DemoBanner";
import type { AuthContext } from "@/lib/auth/profile";

export interface AppShellProps {
  ctx: AuthContext;
  pendingReviewCount?: number;
  showIncidentNotifications?: boolean;
  showRoleManagement?: boolean;
  children: ReactNode;
}

const FOOTER_LINK = "inline-flex min-h-11 items-center rounded-ctl px-2 text-[var(--ink-2)] underline-offset-4 transition-colors hover:text-tide hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none";

export function AppShell({
  ctx,
  pendingReviewCount,
  showIncidentNotifications,
  showRoleManagement,
  children,
}: AppShellProps) {
  return (
    <div className="isolate grid min-h-dvh min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-paper">
      <TopBar ctx={ctx} pendingReviewCount={pendingReviewCount}
        showIncidentNotifications={showIncidentNotifications} showRoleManagement={showRoleManagement} />
      <DemoBanner />
      <main id="main-content" tabIndex={-1} className="relative z-0 min-w-0">
        {children}
      </main>
      <footer className="flex min-w-0 flex-col gap-3 border-t border-rule bg-sheet px-3 py-4 text-xs sm:px-6 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
        <div className="grid min-w-0 gap-1">
          <span className="break-words font-semibold text-ink">TerraResponse AI · Decision-support prototype</span>
          <span className="break-words text-[var(--ink-3)]">Human review required. No automatic dispatch.</span>
        </div>
        <nav aria-label="Footer" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/dashboard" className={FOOTER_LINK}>Workspace</Link>
          <Link href="/map" className={FOOTER_LINK}>Incident map</Link>
          <Link href="/profile" className={FOOTER_LINK}>Profile</Link>
        </nav>
      </footer>
    </div>
  );
}