// src/components/admin/AuditLogFilters.tsx
//
// The filter row above the AuditLogTable — filters by actor, action,
// event. Drives URL search params so filters are shareable. The
// filter row is a client component (the page is server-rendered;
// only the filter row is interactive).
//
// Reuses `useFilterParam` from the layout module.

"use client";

import { useFilterParam } from "@/components/layout/FilterRail";
import { Field, Select } from "@/components/ui-tr";

const ACTOR_OPTIONS = [
  { value: "", label: "All actors" },
];

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
];

export function AuditLogFilters() {
  const [action, setAction] = useFilterParam("action");
  return (
    <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", marginBottom: "var(--s-4)" }}>
      <Field label="Action" htmlFor="filter-action">
        <Select id="filter-action" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value || "any"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
