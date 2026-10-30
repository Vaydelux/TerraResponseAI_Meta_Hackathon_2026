// src/components/layout/FilterRail.tsx
//
// The left filter rail for the workbench shell. Filters drive URL
// search params so they're shareable (per the brief: "shareable
// filters"). The rail is hidden on mobile (collapses into a sheet
// triggered by a button on the page header — that's wired at the
// route level, not here).
//
// Client component — the form writes to the URL via router.replace
// on change.

"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Field, Select, Segmented } from "@/components/ui-tr";
import { cn } from "@/lib/utils";

export interface FilterRailProps {
  /** Extra controls (e.g. event-specific filters). */
  children?: ReactNode;
  className?: string;
  /** Labels for the status select. Override the defaults if needed. */
  statusOptions?: Array<{ value: string; label: string }>;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "needs_review", label: "Awaiting review" },
  { value: "needs_manual_review", label: "Low-information" },
  { value: "reviewed", label: "Reviewed" },
  { value: "retryable_error", label: "Analysis failed" },
];

const DEFAULT_SEVERITY_OPTIONS = [
  { value: "", label: "Any severity" },
  { value: "5", label: "Critical" },
  { value: "4", label: "High" },
  { value: "3", label: "Moderate" },
  { value: "2", label: "Low" },
  { value: "1", label: "Minimal" },
];

/**
 * Reads the current search params + writes a single key. Used by
 * the rail's controls. We export it so custom filters (passed as
 * children) can use the same hook.
 */
export function useFilterParam(key: string): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(key) ?? "";
  function setParam(next: string) {
    const nextParams = new URLSearchParams(params.toString());
    if (!next) nextParams.delete(key);
    else nextParams.set(key, next);
    const qs = nextParams.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }
  return [current, setParam];
}

export function FilterRail({ children, className, statusOptions }: FilterRailProps) {
  const [status, setStatus] = useFilterParam("status");
  const [severity, setSeverity] = useFilterParam("severity");
  const [mine, setMine] = useFilterParam("mine");
  const statusOpts = statusOptions ?? DEFAULT_STATUS_OPTIONS;

  return (
    <aside className={cn("filter-rail panel", className)} aria-label="Filters">
      <div className="panel__head">
        <h2 className="t-label" style={{ fontSize: "var(--step-0)" }}>Filters</h2>
      </div>
      <Field label="Status" htmlFor="filter-status">
        <Select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusOpts.map((o) => (
            <option key={o.value || "any"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Severity" htmlFor="filter-severity">
        <Select id="filter-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {DEFAULT_SEVERITY_OPTIONS.map((o) => (
            <option key={o.value || "any"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Only mine to review" htmlFor="filter-mine">
        <Segmented<string>
          aria-label="Only mine to review"
          block
          options={[
            { value: "", label: "Anyone's" },
            { value: "1", label: "Mine only" },
          ]}
          value={mine}
          onChange={setMine}
        />
      </Field>
      {children}
    </aside>
  );
}
