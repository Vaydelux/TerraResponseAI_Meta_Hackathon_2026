import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { loadIncidentWorkspaceSnapshot } from "@/lib/workspace/load-snapshot";
import { hasMapLocation } from "@/lib/workspace/incidents";
import { workspaceAction } from "@/lib/workspace/presentation";
import { cn } from "@/lib/utils";
import { DashboardCommandWorkspace } from "@/components/report/DashboardCommandWorkspace";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/dashboard"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  const snapshot = await loadIncidentWorkspaceSnapshot(ctx);
  const canReview = ctx.user.role === "reviewer" || ctx.user.role === "admin";
  const dataAvailable = snapshot.state !== "unavailable";
  const confirmed = snapshot.reports.filter((report) =>
    report.status === "reviewed" &&
    (report.review_outcome === "confirmed" || report.review_outcome === "resolved"),
  ).length;
  const awaitingReview = snapshot.reports.filter((report) =>
    report.status === "needs_review" || report.status === "needs_manual_review",
  ).length;
  const unlocated = snapshot.reports.filter((report) => !hasMapLocation(report)).length;
  const metrics = [
    { label: "Loaded reports", value: snapshot.reports.length,
      note: snapshot.totalCount === null ? "Total unavailable" : `of ${snapshot.totalCount} in this event` },
    { label: "Awaiting review", value: awaitingReview, note: "Within loaded reports" },
    { label: "Human confirmed", value: confirmed, note: "Confirmed or resolved by a reviewer" },
    { label: "Unlocated", value: unlocated, note: "In queue; never placed on the map" },
  ];

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[var(--content-max)] gap-6 px-3 py-5 min-[481px]:px-4 min-[1025px]:px-8 min-[1440px]:px-10 min-[1440px]:py-8">
      <header className="flex min-w-0 flex-col gap-4 border-b border-rule pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 gap-2">
          <p className="m-0 text-sm font-semibold text-tide [overflow-wrap:anywhere]">{snapshot.eventName}</p>
          <h1 className="m-0 text-[length:var(--step-3)] leading-tight">Incident command workspace</h1>
          <p className="m-0 max-w-[64ch] text-sm text-[var(--ink-2)]">
            Submitted evidence, preliminary AI observations, and human review in one place.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row">
          {canReview && <Link href="/review" className={cn(workspaceAction, "w-full sm:w-auto")}>
            Review queue <ArrowUpRight size={16} aria-hidden="true" />
          </Link>}
          <Link href="/reports/new" className={cn(workspaceAction, "w-full border-transparent bg-tide text-[var(--on-tide)] hover:border-transparent hover:bg-[var(--tide-hover)] active:bg-[var(--tide-press)] sm:w-auto")}>
            <Plus size={16} aria-hidden="true" /> Upload evidence
          </Link>
        </div>
      </header>

      <section aria-label="Loaded workspace metrics" className="grid min-w-0 grid-cols-2 gap-3 min-[1025px]:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="grid min-w-0 content-start gap-2 rounded-panel border border-rule bg-sheet p-4">
            <p className="m-0 break-words text-xs font-semibold text-[var(--ink-2)]">{metric.label}</p>
            <p className="m-0 text-[length:var(--step-3)] font-semibold tabular-nums" aria-label={dataAvailable ? undefined : `${metric.label} unavailable`}>
              {dataAvailable ? metric.value : "—"}
            </p>
            <p className="m-0 break-words text-xs leading-relaxed text-[var(--ink-3)]">
              {dataAvailable ? metric.note : "Data unavailable"}
            </p>
          </div>
        ))}
      </section>

      <DashboardCommandWorkspace key={snapshot.eventId} snapshot={snapshot} canReview={canReview} />
    </div>
  );
}
