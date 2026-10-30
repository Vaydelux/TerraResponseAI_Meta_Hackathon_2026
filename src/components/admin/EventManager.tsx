// src/components/admin/EventManager.tsx
//
// A table of events with create/edit. For the hackathon build, the
// event CRUD is read-only — the admin can see the events + their
// status, but creating new events is done via the seed script
// (scripts/seed-demo.ts). The create/edit UI is a small admin form
// that POSTs to a new admin events endpoint (not yet implemented in
// the API; we leave a TODO here so the route layer can wire it).
//
// Server-component friendly — the table reads the events prop.

import { Table, THead, TBody, TR, TH, TD } from "@/components/ui-tr/Table";
import { EmptyState } from "@/components/ui-tr/EmptyState";
import { formatRelativeTime } from "@/lib/design/format";
import { cn } from "@/lib/utils";

export interface AdminEvent {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  member_count?: number;
  report_count?: number;
}

export interface EventManagerProps {
  events: AdminEvent[];
  className?: string;
}

export function EventManager({ events, className }: EventManagerProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        description="Events are created via the seed script in this demo build. Production event CRUD is on the roadmap."
      />
    );
  }
  return (
    <Table className={className}>
      <THead>
        <TR>
          <TH>Event</TH>
          <TH>Slug</TH>
          <TH>Status</TH>
          <TH>Members</TH>
          <TH>Reports</TH>
          <TH>Created</TH>
        </TR>
      </THead>
      <TBody>
        {events.map((e) => (
          <TR key={e.id}>
            <TD>{e.name}</TD>
            <TD className="num">{e.slug}</TD>
            <TD className="t-meta">{e.status.replace(/_/g, " ")}</TD>
            <TD className="num">{e.member_count ?? "—"}</TD>
            <TD className="num">{e.report_count ?? "—"}</TD>
            <TD className="t-meta">{formatRelativeTime(e.created_at)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
