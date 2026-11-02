// src/app/(app)/layout.tsx
//
// Authenticated shell layout for the route group (app). Server-side
// identity verification via supabase.auth.getUser() — not cookie
// presence alone. Unauthenticated visitors are redirected to
// /login.
//
// Wraps children in <AppShell> (the new design-system shell with
// TopBar + DemoBanner + content area).

import { redirect } from "next/navigation";
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { AppShell } from "@/components/layout/AppShell";
import { SetupRedirect } from "@/components/terra/setup-redirect";
import { isTriageEnabled } from "@/lib/triage/processing";
import { isRoleManagementEnabled } from "@/lib/admin/role-management";
import { ensureCommunityIntakeMembership } from "@/lib/community/intake";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupRedirect />;
  }

  const user = await getServerUser();
  if (!user) {
    redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
  }

  // Provision the fixed workspace at login so dashboards, report lists,
  // reviewer queues and direct navigation all share one report-first context.
  // Failure is non-fatal for navigation; /reports/new surfaces the outage.
  try {
    await ensureCommunityIntakeMembership(user.id);
  } catch {
    console.error("[intake] Shared reporting workspace unavailable.");
  }
  const ctx = await getAuthContext(user);
  if (!ctx) {
    // Authenticated but missing/inaccessible profile is NOT a login
    // failure. Directing back to /login creates a 307 bounce loop.
    redirect("/account-unavailable");
  }

  // The pending review count for the TopBar badge. This is a single
  // count query — for the (app) layout's first paint, we keep it
  // simple. The review page itself fetches the full list.
  let pendingReviewCount = 0;
  if (ctx.events.length > 0) {
    try {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await createSupabaseServerClient();
      const eventIds = ctx.events.map((e) => e.event_id);
      const { count } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("event_id", eventIds)
        .in("status", ["needs_review", "needs_manual_review"]);
      pendingReviewCount = count ?? 0;
    } catch {
      // count failure is non-fatal — the badge shows 0
    }
  }

  return (
    <AppShell ctx={ctx} pendingReviewCount={pendingReviewCount} showIncidentNotifications={isTriageEnabled()} showRoleManagement={isRoleManagementEnabled()}>
      {children}
    </AppShell>
  );
}
