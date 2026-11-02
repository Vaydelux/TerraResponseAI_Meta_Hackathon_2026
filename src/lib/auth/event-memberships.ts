// Supabase/PostgREST embeds the "many-to-one" event relationship as
// an object, not an array. Accept the legacy array shape only for
// compatibility with older mocks; never manufacture an event membership.
export interface UserEventMembership {
  event_id: string;
  event_name: string;
  event_slug: string;
  event_status: string;
  role: "contributor" | "reviewer" | "coordinator";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function normalizeEventMemberships(input: unknown): UserEventMembership[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item): UserEventMembership[] => {
    if (!isRecord(item) || typeof item.event_id !== "string") return [];
    const role = item.role;
    if (role !== "contributor" && role !== "reviewer" && role !== "coordinator") return [];
    const embedded = Array.isArray(item.events) ? item.events[0] : item.events;
    if (!isRecord(embedded) ||
        typeof embedded.id !== "string" ||
        embedded.id !== item.event_id ||
        typeof embedded.name !== "string" ||
        typeof embedded.slug !== "string" ||
        typeof embedded.status !== "string") return [];
    return [{
      event_id: item.event_id,
      event_name: embedded.name,
      event_slug: embedded.slug,
      event_status: embedded.status,
      role,
    }];
  });
}
