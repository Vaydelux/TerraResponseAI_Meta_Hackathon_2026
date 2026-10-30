// src/components/admin/AuditLogTable.tsx
//
// The admin audit log table. Read-only `.table` of audit events.
// Filterable by actor, action, event. Shows relative + absolute
// timestamps (formatRelativeTime + formatAbsoluteTime).
//
// Fetches audit events from Supabase via the SSR client. Admin-only
// (the route gate is at the page layer). The table is server-rendered
// from the fetched rows; the filter row is a client component (the
// audit_view in views/audit-view.tsx is being replaced by this).
//
// Server-component friendly — the table reads the events prop.

import { Table, THead, TBody, TR, TH, TD } from "@/components/ui-tr/Table";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { formatRelativeTime, formatAbsoluteTime } from "@/lib/design/format";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AuditEvent {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  event_name?: string | null;
  target?: string | null;
  details?: string | null;
}

export interface AuditLogTableProps {
  events: AuditEvent[];
  className?: string;
  /** Optional filter row rendered above the table (a client
   *  component). */
  filters?: ReactNode;
}

const ACTION_LABEL: Record<string, string> = {
  login: "Sign in",
  logout: "Sign out",
  auth_failed: "Auth failed",
  upload: "Upload",
  analyze: "Analyze",
  review: "Review",
  delete: "Delete",
  status_change: "Status change",
  permission_denied: "Permission denied",
  register: "Register",
};

export function AuditLogTable({ events, className, filters }: AuditLogTableProps) {
  return (
    <div className={cn(className)}>
      {filters}
      {events.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="Sign-ins, uploads, AI analyses, and reviewer decisions will all appear here once activity begins."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Event</TH>
              <TH>Target</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="num">
                  <div>{formatRelativeTime(e.created_at)}</div>
                  <div className="t-meta">{formatAbsoluteTime(e.created_at)}</div>
                </TD>
                <TD>{e.actor_name || e.actor_email || "—"}</TD>
                <TD>{ACTION_LABEL[e.action] ?? e.action}</TD>
                <TD>{e.event_name || "—"}</TD>
                <TD>{e.target || "—"}</TD>
                <TD className="t-meta">{e.details || "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
