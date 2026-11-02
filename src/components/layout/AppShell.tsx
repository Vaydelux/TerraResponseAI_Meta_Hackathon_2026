// src/components/layout/AppShell.tsx
//
// Wraps the authenticated routes in the `tr-shell` grid (topbar + body + footer).
// Renders the TopBar + DemoBanner + main content area + operational status footer.

import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { DemoBanner } from "./DemoBanner";
import type { AuthContext } from "@/lib/auth/profile";

export interface AppShellProps {
  ctx: AuthContext;
  pendingReviewCount?: number;
  children: ReactNode;
}

export function AppShell({ ctx, pendingReviewCount, children }: AppShellProps) {
  return (
    <div className="tr-shell" style={{ gridTemplateRows: "var(--nav-h) auto 1fr auto" }}>
      <TopBar ctx={ctx} pendingReviewCount={pendingReviewCount} />
      <DemoBanner />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="tr-status-footer">
        <span>TerraResponse AI · Geospatial Emergency Verification Platform</span>
        <span>Human-Supervised Verification Architecture · RLS-Enforced</span>
      </footer>
    </div>
  );
}
