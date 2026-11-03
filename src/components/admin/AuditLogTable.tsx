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

"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui-tr/Table";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { formatRelativeTime, formatAbsoluteTime } from "@/lib/design/format";
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
  const searchParams = useSearchParams();
  const filterAction = searchParams?.get("action") ?? "";
  const filterActor = searchParams?.get("actor") ?? "";
  const filterQuery = searchParams?.get("q") ?? "";

  const kpis = useMemo(() => {
    const total = events.length;
    const reviews = events.filter((e) => e.action === "review" || e.action === "status_change").length;
    const uploadsAndAi = events.filter((e) => e.action === "upload" || e.action === "analyze").length;
    const security = events.filter(
      (e) =>
        e.action === "login" ||
        e.action === "logout" ||
        e.action === "auth_failed" ||
        e.action === "permission_denied",
    ).length;
    return { total, reviews, uploadsAndAi, security };
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      if (filterActor.trim()) {
        const actorStr = `${e.actor_name ?? ""} ${e.actor_email ?? ""}`.toLowerCase();
        if (!actorStr.includes(filterActor.trim().toLowerCase())) return false;
      }
      if (filterQuery.trim()) {
        const q = filterQuery.trim().toLowerCase();
        const hay = `${e.target ?? ""} ${e.details ?? ""} ${e.event_name ?? ""} ${e.action}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filterAction, filterActor, filterQuery]);

  return (
    <div className={cn(className)} style={{ display: "grid", gap: "var(--s-4)" }}>
      {/* Command Hub Audit KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Recorded Audit Events</span>
          </div>
          <div className="kpi-card__value num">{kpis.total}</div>
          <div className="kpi-card__sub">Append-only tamper-evident ledger</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Moderator Decisions</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--tide)" }}>
            {kpis.reviews}
          </div>
          <div className="kpi-card__sub">Human verification &amp; status transitions</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Uploads &amp; AI Runs</span>
          </div>
          <div className="kpi-card__value num" style={{ color: "var(--amber-ink)" }}>
            {kpis.uploadsAndAi}
          </div>
          <div className="kpi-card__sub">Evidence intake &amp; Meta AI Vision calls</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-card__label">Auth &amp; Access Checks</span>
          </div>
          <div className="kpi-card__value num">{kpis.security}</div>
          <div className="kpi-card__sub">Session sign-ins &amp; permission gates</div>
        </div>
      </div>

      {filters}

      {filteredEvents.length === 0 ? (
        <EmptyState
          title={events.length > 0 ? "No matching audit events" : "No audit events"}
          description={
            events.length > 0
              ? "No audit records match your active action, actor, or keyword filters."
              : "Sign-ins, uploads, AI analyses, and reviewer decisions will all appear here once activity begins."
          }
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
            {filteredEvents.map((e) => {
              const isAlert = e.action === "auth_failed" || e.action === "permission_denied" || e.action === "delete";
              const isReview = e.action === "review" || e.action === "status_change";
              return (
                <TR key={e.id}>
                  <TD className="num">
                    <div>{formatRelativeTime(e.created_at)}</div>
                    <div className="t-meta">{formatAbsoluteTime(e.created_at)}</div>
                  </TD>
                  <TD>
                    <div style={{ fontWeight: 600 }}>{e.actor_name || e.actor_email || "—"}</div>
                    {e.actor_name && e.actor_email && (
                      <div className="t-meta">{e.actor_email}</div>
                    )}
                  </TD>
                  <TD>
                    <span
                      className="t-meta num"
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        background: isAlert
                          ? "var(--brick-wash)"
                          : isReview
                          ? "var(--tide-wash)"
                          : "var(--sheet-sunk)",
                        color: isAlert
                          ? "var(--brick-ink)"
                          : isReview
                          ? "var(--tide)"
                          : "var(--ink)",
                      }}
                    >
                      {ACTION_LABEL[e.action] ?? e.action}
                    </span>
                  </TD>
                  <TD>{e.event_name || "—"}</TD>
                  <TD className="num">{e.target || "—"}</TD>
                  <TD className="t-meta">{e.details || "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
