// src/components/admin/AuditLogFilters.tsx
//
// The filter row above the AuditLogTable — filters by actor, action,
// event. Drives URL search params so filters are shareable. The
// filter row is a client component (the page is server-rendered;
// only the filter row is interactive).
//
// Reuses `useFilterParam` from the layout module.

"use client";

import { useRouter, usePathname } from "next/navigation";
import { useFilterParam } from "@/components/layout/FilterRail";
import { Field, Select, Input } from "@/components/ui-tr";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "login", label: "Sign in" },
  { value: "logout", label: "Sign out" },
  { value: "auth_failed", label: "Auth failed" },
  { value: "upload", label: "Upload" },
  { value: "analyze", label: "Analyze" },
  { value: "review", label: "Review" },
  { value: "delete", label: "Delete" },
  { value: "status_change", label: "Status change" },
  { value: "permission_denied", label: "Permission denied" },
  { value: "register", label: "Register" },
];

export function AuditLogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const [action, setAction] = useFilterParam("action");
  const [actor, setActor] = useFilterParam("actor");
  const [q, setQ] = useFilterParam("q");
  const hasFilters = Boolean(action || actor || q);

  return (
    <div
      className="panel"
      data-testid="audit-log-filters"
      style={{
        display: "grid",
        gap: "var(--s-3)",
        marginBottom: "var(--s-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span className="t-label">Filter Audit Trail</span>
        {hasFilters && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => router.replace(pathname)}
            style={{ minHeight: 26, paddingInline: 8, fontSize: "0.72rem" }}
          >
            Reset filters
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--s-3)",
          alignItems: "end",
        }}
      >
        <Field label="Action" htmlFor="filter-action">
          <Select id="filter-action" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Actor (email or name)" htmlFor="filter-actor">
          <Input
            id="filter-actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filter by operator email or name…"
          />
        </Field>

        <Field label="Target or Details" htmlFor="filter-audit-q">
          <Input
            id="filter-audit-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search report ID, target, or details…"
          />
        </Field>
      </div>
    </div>
  );
}
