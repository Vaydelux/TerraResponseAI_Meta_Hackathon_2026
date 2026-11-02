import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const list = readFileSync("src/app/(app)/incidents/page.tsx", "utf8");
const detail = readFileSync("src/app/(app)/incidents/[id]/page.tsx", "utf8");
const inbox = readFileSync("src/app/(app)/notifications/page.tsx", "utf8");
const actions = readFileSync("src/app/(app)/notifications/actions.ts", "utf8");
const nav = readFileSync("src/components/layout/TopBar.tsx", "utf8");

describe("community incident threads and private notification inbox", () => {
  it("only uses verified sessions and RLS-scoped reads", () => {
    for (const page of [list, detail]) {
      expect(page).toContain("getServerUser()");
      expect(page).toContain("getAuthContext(user)");
      expect(page).toContain("createSupabaseServerClient()");
      expect(page).toContain("isTriageEnabled()");
      expect(page).not.toContain("serviceRoleKey");
      expect(page).not.toContain("adminRoleDatabase");
    }
    expect(list).toContain('.in("event_id", ids)');
    expect(list).toContain('.limit(100)');
    expect(list).toContain('.from("incident_report_links")');
    expect(detail).toContain('ctx.events.some(e => e.event_id === incident.event_id)');
    expect(detail).toContain(".maybeSingle()");
    expect(detail).toContain('if (!UUID_RE.test(id)) notFound()');
  });

  it("never treats AI thread suggestions as verified disaster evidence", () => {
    expect(list).toContain("suggested match is not independent disaster confirmation");
    expect(detail).toContain("Grouping does not verify the incident");
    expect(detail).toContain("link.confirmed_match");
    expect(detail).toContain('link.assignment_method === "suggested"');
    expect(detail).toContain('Private evidence is not shared publicly');
    expect(detail).not.toContain("original_storage_key");
    expect(detail).not.toContain("getPublicUrl");
  });

  it("allows only the owner to acknowledge alerts through RLS", () => {
    expect(actions).toContain('"use server"');
    expect(actions).toContain("requireServerUser()");
    expect(actions).toContain("isTriageEnabled()");
    expect(actions).toContain('notificationId.safeParse(form.get("notificationId"))');
    expect(actions).toContain('.eq("recipient_id", user.id)');
    expect(actions).toContain('.is("read_at", null)');
    expect(actions).toContain('revalidatePath("/notifications")');
    expect(actions).not.toContain("serviceRoleKey");
    expect(inbox).toContain("markAllNotificationsRead");
    expect(inbox).toContain("markNotificationRead");
    expect(inbox).toContain("Mark all as read");
    expect(inbox).toContain("Mark as read");
  });

  it("only adds the incident navigation when triage is enabled", () => {
    expect(nav).toContain('{ href: "/incidents", label: "Incident threads", triageOnly: true }');
    expect(nav).toContain("!l.triageOnly || showIncidentNotifications");
  });
});
