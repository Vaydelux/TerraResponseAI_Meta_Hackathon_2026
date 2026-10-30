// src/app/(app)/review/[id]/page.tsx
//
// The review workbench. The reviewer's hero screen — the photo on
// the left, the AI observation on the right with the hatched Seal,
// and the action bar at the bottom. Resolves the next item in the
// queue so the reviewer can chain through the queue without
// reloading.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReviewWorkbench } from "@/components/review/ReviewWorkbench";
import { EmptyState } from "@/components/ui-tr";

export default async function ReviewWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    redirect("/dashboard");
  }
  const { id } = await params;

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tr-active-event")?.value;
  const activeEventId =
    cookieId && ctx.events.some((e) => e.event_id === cookieId)
      ? cookieId
      : ctx.events[0]?.event_id ?? null;

  // Resolve the queue position + the next report id (sorted by
  // priority desc). This lets the ReviewActionBar toast "Next
  // report: n of total" + navigate to the next item after a
  // resolve.
  let nextReportId: string | null = null;
  let queuePosition: { current: number; total: number } | undefined;
  if (activeEventId) {
    try {
      const supabase = await createSupabaseServerClient();
      const [{ data: pending }, { data: manual }] = await Promise.all([
        supabase
          .from("reports")
          .select("id, priority_score")
          .eq("event_id", activeEventId)
          .eq("status", "needs_review")
          .order("priority_score", { ascending: false, nullsFirst: false }),
        supabase
          .from("reports")
          .select("id, priority_score")
          .eq("event_id", activeEventId)
          .eq("status", "needs_manual_review")
          .order("priority_score", { ascending: false, nullsFirst: false }),
      ]);
      const all = [...(pending ?? []), ...(manual ?? [])];
      all.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
      const idx = all.findIndex((r) => r.id === id);
      if (idx >= 0) {
        queuePosition = { current: idx + 1, total: all.length };
        nextReportId = idx + 1 < all.length ? (all[idx + 1]?.id ?? null) : null;
      }
    } catch {
      // ignore — the ReviewWorkbench handles a null nextReportId
    }
  }

  return (
    <ReviewWorkbench
      reportId={id}
      currentUserId={user.id}
      currentUserDisplayName={ctx.user.name}
      currentUserRole={ctx.user.role}
      nextReportId={nextReportId}
      queuePosition={queuePosition}
    />
  );
}
