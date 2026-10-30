// src/components/layout/AppShell.tsx
//
// Wraps the authenticated routes in the `tr-shell` grid (topbar + body).
// Renders the TopBar (which includes the demo banner slot when demo
// mode is on) + the children in the content area. The shell is a
// grid: nav-h / auto / 1fr — the topbar is the first row, the demo
// banner (if any) is the second row, the content fills the rest.
//
// Server-component friendly — but TopBar is a client component
// (it uses hooks), so the shell itself doesn't need 'use client'.

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
    <div className="tr-shell">
      <TopBar ctx={ctx} pendingReviewCount={pendingReviewCount} />
      <DemoBanner />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
