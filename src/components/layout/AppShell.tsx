// src/components/layout/AppShell.tsx
//
// Wraps the authenticated routes in the `tr-shell` grid (topbar + body + footer).
// Renders the TopBar + DemoBanner + main content area + operational status footer.

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

export function AppShell({
  ctx,
  pendingReviewCount,
  showIncidentNotifications,
  showRoleManagement,
  children,
}: AppShellProps) {
  return (
    <div className="tr-shell command-shell" style={{ gridTemplateRows: "var(--nav-h) auto 1fr auto" }}>
      <TopBar
        ctx={ctx}
        pendingReviewCount={pendingReviewCount}
        showIncidentNotifications={showIncidentNotifications}
        showRoleManagement={showRoleManagement}
      />
      <DemoBanner />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="tr-status-footer">
        <span>
          TerraResponse AI · Civic Tech Disaster Coordination &amp; Humanitarian Logistics
        </span>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--s-4)",
          }}
        >
          <span>Encrypted EOC Node · Human-Supervised Verification · RLS-Enforced</span>
          <Link href="/dashboard" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            Protocols &amp; SOP
          </Link>
          <Link href="/map" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            Sector Map
          </Link>
          <Link href="/profile" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            Privacy Framework
          </Link>
        </div>
      </footer>
    </div>
  );
}
