// Report-first: a user's authorized reports are not restricted to a
// selected event. Supabase RLS still governs record visibility.
import { Suspense } from "react";
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportList } from "@/components/report/ReportList";
import { Button, SkeletonRow } from "@/components/ui-tr";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  return (
    <div className="tr-page">
      <PageHeader
        title="Field Reports & Evidence"
        subtitle="Inspect submitted disaster photos, AI pre-triage telemetry, and human verification seals."
        actions={<Button variant="primary" href="/reports/new">Upload a photo</Button>}
      />
      <Suspense
        fallback={
          <div className="tr-stack">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        }
      >
        <ReportList
          limit={100}
          currentUserId={user.id}
          emptyTitle="No photos submitted yet"
          emptyDescription="You can report a possible hazard now, even before an event has been declared."
        />
      </Suspense>
    </div>
  );
}
