// src/app/(app)/audit/page.tsx
//
// The admin audit log page. Tabs between the audit log table, the
// event manager, and the AI spend ceilings. The page is a client
// component for the tabs; the tables are server-rendered from the
// fetched rows.
//
// The audit log fetches the audit_events table directly via the SSR
// client (RLS-enforced; admin-only per the route gate). The events
// table is read-only in this build. The spend ceilings read from
// /api/admin/ai-usage (the existing route).

import { getServerUser, isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { AuditLogTable, type AuditEvent } from "@/components/admin/AuditLogTable";
import { EventManager, type AdminEvent } from "@/components/admin/EventManager";
import { SpendCeilings } from "@/components/admin/SpendCeilings";
import { EmptyState } from "@/components/ui-tr";
import { AdminTabs } from "./AdminTabs";

export default async function AuditPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/audit"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/audit"));
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    redirect("/dashboard");
  }

  // Fetch audit events (RLS-enforced; admins see all).
  const supabase = await createSupabaseServerClient();
  const { data: auditRows } = await supabase
    .from("audit_events")
    .select("id, created_at, actor_email, actor_name, action, target, details")
    .order("created_at", { ascending: false })
    .range(0, 99);

  // The audit_events table doesn't have an event_name column; we
  // join to events via the event_id field if it exists. For now,
  // we leave event_name null (the audit log's event column shows "—").
  const auditEvents: AuditEvent[] = (auditRows ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      created_at: string;
      actor_email: string | null;
      actor_name: string | null;
      action: string;
      target: string | null;
      details: string | null;
    };
    return {
      id: row.id,
      created_at: row.created_at,
      actor_email: row.actor_email,
      actor_name: row.actor_name,
      action: row.action,
      target: row.target,
      details: row.details,
    };
  });

  // Fetch events for the EventManager (admin-only).
  let adminEvents: AdminEvent[] = [];
  if (ctx.user.role === "admin") {
    const { data: eventRows } = await supabase
      .from("events")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false });
    adminEvents = (eventRows ?? []).map((r) => {
      const row = r as unknown as { id: string; name: string; slug: string; status: string; created_at: string };
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        created_at: row.created_at,
      };
    });
  }

  const isReviewerOrAdmin = ctx.user.role === "reviewer" || ctx.user.role === "admin";
  if (!isReviewerOrAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="tr-page">
      <PageHeader
        title="Audit"
        subtitle="Append-only record of authentication, uploads, AI analyses, and reviewer decisions."
      />
      <AdminTabs
        audit={<AuditLogTable events={auditEvents} />}
        events={ctx.user.role === "admin" ? <EventManager events={adminEvents} /> : <EmptyState title="Admin only" description="Event management is restricted to admins." />}
        spend={<SpendCeilings />}
      />
    </div>
  );
}
