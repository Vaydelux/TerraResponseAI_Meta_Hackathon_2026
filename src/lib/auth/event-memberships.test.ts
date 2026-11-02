import { describe, expect, it } from "vitest";
import { normalizeEventMemberships } from "./event-memberships";

const eventId = "11111111-1111-4111-8111-111111111111";
const event = { id: eventId, name: "Community Reports", slug: "community-intake", status: "active" };

describe("PostgREST event membership projection", () => {
  it("keeps the real many-to-one object from Supabase, including admin coordinator role", () => {
    expect(normalizeEventMemberships([{
      event_id: eventId, role: "coordinator", events: event,
    }])).toEqual([{
      event_id: eventId, role: "coordinator", event_name: "Community Reports",
      event_slug: "community-intake", event_status: "active",
    }]);
  });
  it("also tolerates the legacy embedded array shape", () => {
    expect(normalizeEventMemberships([{
      event_id: eventId, role: "contributor", events: [event],
    }])).toHaveLength(1);
  });
  it("retains a reviewer's real membership", () => {
    expect(normalizeEventMemberships([{
      event_id: eventId, role: "reviewer", events: event,
    }])[0]?.role).toBe("reviewer");
  });
  it("fails closed for missing or mismatched join data and unknown roles", () => {
    expect(normalizeEventMemberships(null)).toEqual([]);
    expect(normalizeEventMemberships([{ event_id: eventId, role: "admin", events: event }])).toEqual([]);
    expect(normalizeEventMemberships([{ event_id: eventId, role: "coordinator", events: null }])).toEqual([]);
    expect(normalizeEventMemberships([{ event_id: "different", role: "coordinator", events: event }])).toEqual([]);
  });
  it("does not create an extra event or promote reporter membership", () => {
    expect(normalizeEventMemberships([
      { event_id: eventId, role: "contributor", events: event },
      { event_id: "another", role: "coordinator", events: null },
    ])).toMatchObject([{ role: "contributor" }]);
  });
});
