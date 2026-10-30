// src/app/(app)/reports/page.tsx
//
// The reports list. Uses the new ReportList component (which fetches
// /api/reports with the active event id from the cookie). Server-
// side identity verification; the ReportList handles the client-
// side rendering.

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportList } from "@/components/report/ReportList";
import { Button } from "@/components/ui-tr";
import { EmptyState } from "@/components/ui-tr";
import { cookies } from "next/headers";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/reports"));

  // Read the active event from the cookie (set by EventSwitcher).
  const cookieStore = await cookies();
  const activeId = cookieStore.get("tr-active-event")?.value ?? ctx.events[0]?.event_id ?? null;

  if (ctx.events.length === 0 || !activeId) {
    return (
      <div className="tr-page">
        <PageHeader title="Reports" subtitle="All disaster-photo submissions you are authorized to view." />
        <EmptyState
          title="No event selected"
          description="You are not a member of any incident event yet. An admin must add you to one."
        />
      </div>
    );
  }

  // Resolve the active event name + count for the header.
  const supabase = await createSupabaseServerClient();
  const activeEvent = ctx.events.find((e) => e.event_id === activeId);
  const { count } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("event_id", activeId);

  return (
    <div className="tr-page">
      <PageHeader
        title="Reports"
        subtitle={`All reports in ${activeEvent?.event_name ?? "the active event"} — ${count ?? 0} total.`}
        actions={<Button variant="primary" href="/reports/new">Upload a photo</Button>}
      />
      <ReportList eventId={activeId} limit={100} />
    </div>
  );
}
