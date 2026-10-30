// src/app/(app)/review/page.tsx
//
// `/review` — the reviewer queue. Role-gated: only reviewer/admin.
// Uses the new ReviewQueueTable with the left-edge state stripe,
// thumbnail, incident type (with the amber dashed seal), severity
// segments, priority number, age. J/K moves selection, Enter
// opens the workbench.

import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReviewQueueTable } from "@/components/review/ReviewQueueTable";
import { EmptyState } from "@/components/ui-tr";

export default async function ReviewPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/review"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/review"));
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tr-active-event")?.value;
  const activeEventId =
    cookieId && ctx.events.some((e) => e.event_id === cookieId)
      ? cookieId
      : ctx.events[0]?.event_id ?? null;

  if (!activeEventId) {
    return (
      <div className="tr-page">
        <PageHeader
          title="Review queue"
          subtitle="Confirm, correct, flag, or reject AI observations."
        />
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet."
        />
      </div>
    );
  }

  return (
    <div className="tr-page">
      <PageHeader
        title="Review queue"
        subtitle="AI observations, waiting for a human decision. The Seal resolves when you act."
      />
      <ReviewQueueTable eventId={activeEventId} />
    </div>
  );
}
