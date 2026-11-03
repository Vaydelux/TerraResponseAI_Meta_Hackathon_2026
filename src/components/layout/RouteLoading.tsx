// Static, server-rendered shell: eligible for partial prefetch on dynamic routes.
// Never fetch authentication, report rows or maps from a loading boundary.
import { Skeleton, SkeletonRow } from "@/components/ui-tr";

export function RouteLoading({ label = "Loading page" }: { label?: string }) {
  return (
    <section className="tr-page" aria-label={label} aria-busy="true" role="status">
      <div style={{ display: "grid", gap: "var(--s-3)", marginBottom: "var(--s-5)" }}>
        <Skeleton width="min(45%, 290px)" height="25px" />
        <Skeleton width="min(80%, 440px)" height="13px" />
      </div>
      <div className="kpi-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel" style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4)" }}>
            <Skeleton width="54%" height="12px" />
            <Skeleton width="34%" height="28px" />
          </div>
        ))}
      </div>
      <div className="panel tr-stack" style={{ marginTop: "var(--s-4)", padding: "var(--s-4)" }} aria-hidden="true">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <span className="t-meta" style={{ marginTop: "var(--s-3)", display: "block" }}>{label}…</span>
    </section>
  );
}
