import Link from "next/link";
import { CheckCircle2, MapPin, ArrowUpRight } from "lucide-react";
import type { IncidentMapReport } from "./IncidentMap";

/** A text fallback anchored to the same authorized, located snapshot as the map. */
export function reviewedLocatedReports(reports: readonly IncidentMapReport[]): IncidentMapReport[] {
  return reports.filter((report) =>
    report.status === "reviewed" &&
    (report.review_outcome === "confirmed" || report.review_outcome === "resolved") &&
    Number.isFinite(report.latitude) && Number.isFinite(report.longitude) &&
    Math.abs(report.latitude) <= 90 && Math.abs(report.longitude) <= 180,
  );
}

export function ReviewedMapIndex({ reports }: { reports: readonly IncidentMapReport[] }) {
  const reviewed = reviewedLocatedReports(reports);
  return (
    <section
      className="grid min-w-0 gap-3 rounded-panel border border-rule bg-sheet p-4 sm:p-5"
      aria-labelledby="reviewed-map-index-heading"
      data-testid="reviewed-map-index"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <h2 id="reviewed-map-index-heading" className="m-0 flex min-w-0 items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="size-5 shrink-0 text-[var(--green-ink)]" aria-hidden="true" />
            Human-confirmed located reports
          </h2>
          <p className="m-0 max-w-[75ch] break-words text-xs leading-relaxed text-[var(--ink-2)]">
            This accessible index uses the same authorized report snapshot as the map and stays readable if map tiles fail.
            A human review decision does not authenticate the photo or independently establish the incident.
          </p>
        </div>
        <span className="rounded-full border border-rule bg-[var(--green-wash)] px-3 py-1 text-xs font-bold tabular-nums text-[var(--green-ink)]" aria-label={`${reviewed.length} human-confirmed located reports`}>
          {reviewed.length} confirmed
        </span>
      </div>
      {reviewed.length ? (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {reviewed.slice(0, 9).map((report) => (
            <li key={report.id} className="min-w-0" data-testid={`reviewed-map-report-${report.id}`}>
              <Link
                href={`/reports/${report.id}`}
                className="flex min-h-11 min-w-0 items-center gap-3 rounded-ctl border border-rule bg-[var(--sheet-sunk)] px-3 py-3 text-left transition-colors hover:border-[var(--tide)] hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)] motion-reduce:transition-none"
                aria-label={`Open human-confirmed report ${report.title || report.id.slice(0, 8)}`}
              >
                <MapPin className="size-4 shrink-0 text-[var(--green-ink)]" aria-hidden="true" />
                <span className="grid min-w-0 flex-1 gap-1">
                  <strong className="truncate text-sm">{report.title?.trim() || `Report #${report.id.slice(0, 8)}`}</strong>
                  <span className="break-words text-xs text-[var(--ink-2)] [overflow-wrap:anywhere]">
                    Human confirmed · {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-ctl border border-dashed border-rule p-3 text-sm text-[var(--ink-2)]">
          No located report has been confirmed by an authorized human reviewer in this loaded snapshot.
          Pending AI observations are not counted as confirmed.
          <Link href="/#incident-map-preview" className="mt-2 inline-flex min-h-11 items-center rounded-ctl px-2 font-semibold text-tide underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--tide-wash)]">Open a clearly labeled fictional map preview</Link>
        </p>
      )}
      {reviewed.length > 9 && (
        <p className="m-0 text-xs text-[var(--ink-3)]">
          Showing 9 of {reviewed.length} human-confirmed located reports. Use the map and report queue for the remaining entries.
        </p>
      )}
    </section>
  );
}
