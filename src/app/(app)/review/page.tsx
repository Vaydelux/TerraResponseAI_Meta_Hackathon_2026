// Reviewers and administrators can moderate their RLS-authorized reports
// across workspaces without choosing an event in the navigation bar.
import { Suspense } from "react";
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterRail } from "@/components/layout/FilterRail";
import { ReviewQueueTable } from "@/components/review/ReviewQueueTable";
import { Button, SkeletonRow } from "@/components/ui-tr";

const QUEUE_STATUS_OPTIONS = [
  { value: "", label: "All queue statuses" },
  { value: "needs_review", label: "Awaiting review (AI ready)" },
  { value: "needs_manual_review", label: "Manual triage required" },
];

export default async function ReviewPageRoute({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; severity?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/review"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    redirect("/dashboard");
  }
  const sp = searchParams ? await searchParams : {};
  return (
    <div className="tr-page" style={{ display: "grid", gap: "var(--s-4)" }}>
      <PageHeader
        title="Review Queue & Moderation Hub"
        subtitle="Review only the evidence your role is authorized to moderate. AI findings remain provisional until verified by a human operator."
        actions={
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <Button variant="default" href="/incidents">
              Incident Threads
            </Button>
            <Button variant="primary" href="/map">
              Open Incident Map
            </Button>
          </div>
        }
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
        <FilterRail showMine={false} statusOptions={QUEUE_STATUS_OPTIONS} />
        <ReviewQueueTable
          statusFilter={sp.status ?? ""}
          severityFilter={sp.severity ?? ""}
        />
      </Suspense>
    </div>
  );
}
