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

  const ctx = await getAuthContext(user);
  if (!ctx) {
    redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
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
    <AppShell ctx={ctx} pendingReviewCount={pendingReviewCount}>
      {children}
    </AppShell>
  );
}
