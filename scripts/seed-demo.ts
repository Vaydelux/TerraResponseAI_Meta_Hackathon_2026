// scripts/seed-demo.ts
//
// Phase 14 — Demo Mode seed script.
//
// Creates 5 rights-cleared demo reports (with precomputed mock AI
// outputs) + 2 demo events + the demo admin user. The demo banner
// (`DEMO_MODE=1`) + the "DEMO" badge on each report card make it
// visually clear that the seeded data is demonstration data, NOT
// real disaster reports (the brief: "Any simulation must be visibly
// identified as demonstration data, not a live disaster report").
//
// The precomputed mock outputs are NEVER labeled as live Meta
// inference. The `report_analyses.model_id` is `demo-mock-v1`
// (NOT `muse-spark-1.3`), and the `structured_observation` has
// `_demo: true` + `_demo_note: "Precomputed mock output; not a
// live Meta inference."` so the report-detail UI shows "Demo mock"
// and the demo note.
//
// The script is IDEMPOTENT: running it multiple times updates the
// demo reports to the canonical state without duplicating rows.
// All inserts use `on conflict do update` / `upsert` semantics.
//
// Per the brief's gate: "the demo can complete when live API
// temporarily fails." The 4 reports with `needs_review` status
// have their `report_analyses` row precomputed (no live model
// call needed). The 1 report with `retryable_error` shows the
// Resilience Panel's "Re-analyze" button which returns 503
// NOT_CONFIGURED when `MODEL_API_KEY` is unset (the UI surfaces
// the error inline; "Force manual review" is the no-model-call
// alternative).
//
// Run:
//   bun run scripts/seed-demo.ts
//
// Required env vars:
//   NEXT_PUBLIC_SUPABASE_URL          — the Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY         — bypasses RLS (server-only)
//
// Required (no defaults — operator MUST set):
//   DEMO_SEED_ADMIN_EMAIL             — defaults to admin@terra.ai
//   DEMO_SEED_ADMIN_PASSWORD          — MUST be set; no default is
//                                       shipped (length >= 12).
//   DEMO_SEED_REVIEWER_EMAIL          — defaults to reviewer@terra.ai
//   DEMO_SEED_REVIEWER_PASSWORD       — MUST be set; no default.
//
// Environment guard (scripts/_seed-guard.ts):
//   * Refuses to run against a non-local Supabase URL unless
//     ALLOW_DEMO_SEED_ON_PRODUCTION=1 is set.
//   * Refuses to use any default / short password — the operator
//     must generate a strong one (e.g. `openssl rand -base64 24`).
//
// Per the brief: "Remove insecure seeded administrator credentials and
// document secure administrator bootstrapping." The previous version
// shipped `admin123` as the default admin password — that is no longer
// the case. For production first-admin setup, use
// scripts/bootstrap-admin.ts <email> AFTER the user signs up at /login
// (the handle_new_user trigger creates their profile with
// role='reporter'; the bootstrap action promotes them to admin only
// when no admin exists yet).

import { createClient } from "@supabase/supabase-js";
import {
  assertSeedEnvironmentAllowed,
  requireSeedPassword,
} from "./_seed-guard";

// --- Config ---

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.DEMO_SEED_ADMIN_EMAIL ?? "admin@terra.ai";
const ADMIN_PASSWORD = requireSeedPassword("DEMO_SEED_ADMIN_PASSWORD");
const REVIEWER_EMAIL = process.env.DEMO_SEED_REVIEWER_EMAIL ?? "reviewer@terra.ai";
const REVIEWER_PASSWORD = requireSeedPassword("DEMO_SEED_REVIEWER_PASSWORD");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "[seed-demo] Missing required env vars. Set NEXT_PUBLIC_SUPABASE_URL " +
    "and SUPABASE_SERVICE_ROLE_KEY (see .env.example + docs/DEPLOYMENT.md).",
  );
  process.exit(1);
}

// Refuse to seed against a production Supabase project unless the
// operator explicitly opted in.
assertSeedEnvironmentAllowed();

// --- Service-role client (bypasses RLS; server-only) ---

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- The 5 demo reports ---
//
// The reports cover the brief's required mix:
//   1. Known-location GPS (Asheville, NC; Hurricane Helene event)
//   2. Known-location manual pin (Pacific Palisades, CA; LA Wildfires event)
//   3. Unknown location (no GPS, no manual pin — appears in Unlocated list only)
//   4. Reviewed + confirmed (the reviewer confirmed the AI observation)
//   5. Intentionally failed analysis (retryable_error; the demo of the
//      Resilience Panel's "Re-analyze" → 503 + "Force manual review" path)
//
// IDs are fixed UUIDs so the script is idempotent + the docs can
// reference them.

const EVENT_HELENE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_WILDFIRES = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const REPORT_GPS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REPORT_MANUAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REPORT_UNKNOWN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REPORT_REVIEWED = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REPORT_FAILED = "11111111-2222-4333-8333-333333333333";

const DEMO_ADMIN_ID = "33333333-3333-4333-8333-333333333333"; // matches supabase/seed.sql
const DEMO_REVIEWER_ID = "22222222-2222-4222-8222-222222222222"; // matches supabase/seed.sql

// SHA-256 of a small empty-content placeholder. The reports don't
// have real image bytes (the seed script doesn't upload to storage);
// the storage keys point to non-existent objects. The report-detail
// UI's signed-URL fetch will return 404 — the UI surfaces this as
// "evidence not available" (no silent failure). For a demo with real
// images, run the upload flow manually (see docs/DEMO_MODE.md).
const DEMO_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";

// The precomputed mock observation. This is NOT a live Meta inference.
// The model_id is "demo-mock-v1" (NOT "muse-spark-1.3"). The
// _demo + _demo_note fields make this explicit.
const mockObservation = (incidentType: string, severity: number, summary: string) => ({
  _demo: true,
  _demo_note: "Precomputed mock output; not a live Meta inference.",
  incident_type: incidentType,
  visible_evidence: [
    "DEMO: this is a precomputed mock observation, not a live AI inference.",
    "DEMO: the visible_evidence field is part of the seeded demo data.",
  ],
  preliminary_severity: severity,
  uncertainties: [
    "DEMO: the model_id is demo-mock-v1 (not muse-spark-1.3).",
  ],
  summary_en: `DEMO: ${summary}`,
  summary_tl: `DEMO: ${summary} (Tagalog translation placeholder)`,
  needs_review: true,
  segmentation_target: null,
});

// --- Main ---

async function main() {
  console.log(`[seed-demo] starting (admin email: ${ADMIN_EMAIL})`);

  // 1. Create the demo admin user via the Supabase Auth admin API.
  //    The on_auth_user_created trigger inserts a profiles row;
  //    we then update the role to 'admin'.
  console.log("[seed-demo] step 1: create the demo admin user");
  const { data: existingAdmin } = await supabase.auth.admin.listUsers();
  const adminExists = (existingAdmin?.users ?? []).some(
    (u) => u.email === ADMIN_EMAIL,
  );
  let adminUserId: string;
  if (adminExists) {
    console.log(`[seed-demo]   admin user ${ADMIN_EMAIL} already exists`);
    adminUserId =
      (existingAdmin?.users ?? []).find((u) => u.email === ADMIN_EMAIL)?.id ??
      DEMO_ADMIN_ID;
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Demo Admin" },
    });
    if (error) {
      console.error(`[seed-demo]   failed to create admin user: ${error.message}`);
      process.exit(1);
    }
    adminUserId = created.user.id;
    console.log(`[seed-demo]   created admin user ${ADMIN_EMAIL} (id: ${adminUserId})`);
  }

  // Update the profile row (the trigger created it; set role + name).
  const { error: profileUpdErr } = await supabase
    .from("profiles")
    .upsert({
      id: adminUserId,
      email: ADMIN_EMAIL,
      name: "Demo Admin",
      role: "admin",
    }, { onConflict: "id" });
  if (profileUpdErr) {
    console.error(`[seed-demo]   failed to upsert admin profile: ${profileUpdErr.message}`);
    process.exit(1);
  }

  // 2. Create the demo reviewer user (for the reviewed report's
  //    review_actions row).
  console.log("[seed-demo] step 2: create the demo reviewer user");
  const reviewerExists = (existingAdmin?.users ?? []).some(
    (u) => u.email === REVIEWER_EMAIL,
  );
  let reviewerUserId: string;
  if (reviewerExists) {
    console.log(`[seed-demo]   reviewer user ${REVIEWER_EMAIL} already exists`);
    reviewerUserId =
      (existingAdmin?.users ?? []).find((u) => u.email === REVIEWER_EMAIL)?.id ??
      DEMO_REVIEWER_ID;
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: REVIEWER_EMAIL,
      password: REVIEWER_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Demo Reviewer" },
    });
    if (error) {
      console.error(`[seed-demo]   failed to create reviewer user: ${error.message}`);
      process.exit(1);
    }
    reviewerUserId = created.user.id;
    console.log(`[seed-demo]   created reviewer user ${REVIEWER_EMAIL}`);
  }
  const { error: reviewerProfileErr } = await supabase
    .from("profiles")
    .upsert({
      id: reviewerUserId,
      email: REVIEWER_EMAIL,
      name: "Demo Reviewer",
      role: "reviewer",
    }, { onConflict: "id" });
  if (reviewerProfileErr) {
    console.error(`[seed-demo]   failed to upsert reviewer profile: ${reviewerProfileErr.message}`);
    process.exit(1);
  }

  // 3. Create the two demo events.
  console.log("[seed-demo] step 3: create the demo events");
  const { error: eventHeleneErr } = await supabase.from("events").upsert({
    id: EVENT_HELENE,
    slug: "demo-helene-asheville-2024",
    name: "Demo Hurricane Helene — Asheville",
    description:
      "DEMO EVENT: seeded by scripts/seed-demo.ts. Demonstration data, not a live disaster.",
    status: "active",
    location_label: "Asheville, NC",
    bbox_min_lat: 35.5, bbox_min_lon: -82.7, bbox_max_lat: 35.7, bbox_max_lon: -82.4,
    created_by: adminUserId,
  }, { onConflict: "id" });
  if (eventHeleneErr) {
    console.error(`[seed-demo]   failed to upsert Helene event: ${eventHeleneErr.message}`);
    process.exit(1);
  }
  const { error: eventWildfiresErr } = await supabase.from("events").upsert({
    id: EVENT_WILDFIRES,
    slug: "demo-la-wildfires-pacific-palisades-2025",
    name: "Demo LA Wildfires — Pacific Palisades",
    description:
      "DEMO EVENT: seeded by scripts/seed-demo.ts. Demonstration data, not a live disaster.",
    status: "active",
    location_label: "Pacific Palisades, CA",
    bbox_min_lat: 34.0, bbox_min_lon: -118.6, bbox_max_lat: 34.1, bbox_max_lon: -118.5,
    created_by: adminUserId,
  }, { onConflict: "id" });
  if (eventWildfiresErr) {
    console.error(`[seed-demo]   failed to upsert Wildfires event: ${eventWildfiresErr.message}`);
    process.exit(1);
  }

  // 4. Create the demo admin's + reviewer's event memberships.
  console.log("[seed-demo] step 4: create event memberships");
  for (const [eventId, userId, role] of [
    [EVENT_HELENE, adminUserId, "coordinator"],
    [EVENT_HELENE, reviewerUserId, "reviewer"],
    [EVENT_WILDFIRES, adminUserId, "coordinator"],
    [EVENT_WILDFIRES, reviewerUserId, "reviewer"],
  ] as const) {
    const { error } = await supabase.from("event_members").upsert({
      event_id: eventId, user_id: userId, role,
    }, { onConflict: "event_id,user_id" });
    if (error) {
      console.error(`[seed-demo]   failed to upsert membership: ${error.message}`);
      process.exit(1);
    }
  }

  // 5. Create the 5 demo reports.
  console.log("[seed-demo] step 5: create the 5 demo reports");
  const reports = [
    {
      id: REPORT_GPS, event_id: EVENT_HELENE, creator_id: adminUserId,
      status: "needs_review", review_outcome: null,
      title: "DEMO: Flooded road near downtown Asheville",
      description: "DEMO REPORT: seeded by scripts/seed-demo.ts. Demonstration data, not a live disaster report.",
      latitude: 35.5951, longitude: -82.5515,
      location_source: "gps", location_label: "Asheville, NC",
      priority_score: 62,
      sha256: DEMO_SHA256,
      mock: mockObservation("flooding", 3, "A road is flooded with water covering both lanes."),
    },
    {
      id: REPORT_MANUAL, event_id: EVENT_WILDFIRES, creator_id: adminUserId,
      status: "needs_review", review_outcome: null,
      title: "DEMO: Smoke visible from Pacific Coast Highway",
      description: "DEMO REPORT: seeded by scripts/seed-demo.ts. Demonstration data, not a live disaster report.",
      latitude: 34.0359, longitude: -118.5186,
      location_source: "manual", location_label: "Pacific Palisades, CA",
      priority_score: 71,
      sha256: DEMO_SHA256,
      mock: mockObservation("other", 4, "Smoke visible on the horizon from Pacific Coast Highway."),
    },
    {
      // Unknown location: no GPS, no manual pin. The DB CHECK
      // constraint requires location_source='unknown' ⇔ coords
      // null. The dashboard's "Unlocated" stat counts this; the map
      // NEVER pins it.
      id: REPORT_UNKNOWN, event_id: EVENT_HELENE, creator_id: adminUserId,
      status: "needs_review", review_outcome: null,
      title: "DEMO: Debris on a road (location unknown)",
      description: "DEMO REPORT: seeded by scripts/seed-demo.ts. The contributor chose 'I don't know the location' — no GPS, no manual pin. This report appears in the Unlocated list only; it NEVER appears on the map.",
      latitude: null, longitude: null,
      location_source: "unknown", location_label: null,
      priority_score: 28,
      sha256: DEMO_SHA256,
      mock: mockObservation("debris", 2, "Debris scattered on a road; location not provided."),
    },
    {
      // Reviewed + confirmed: the reviewer confirmed the AI
      // observation. status='reviewed', review_outcome='confirmed'.
      // Appears on the map with a green circle.
      id: REPORT_REVIEWED, event_id: EVENT_HELENE, creator_id: adminUserId,
      status: "reviewed", review_outcome: "confirmed",
      title: "DEMO: Structural damage to a building (reviewed + confirmed)",
      description: "DEMO REPORT: seeded by scripts/seed-demo.ts. The reviewer confirmed the AI observation. Appears on the map with a green circle.",
      latitude: 35.5950, longitude: -82.5510,
      location_source: "gps", location_label: "Asheville, NC",
      priority_score: 84,
      sha256: DEMO_SHA256,
      mock: mockObservation("visible_structural_damage", 4, "Structural damage visible on a building facade."),
    },
    {
      // Intentionally failed analysis: status='retryable_error'.
      // The Resilience Panel's "Re-analyze" button returns 503
      // NOT_CONFIGURED when MODEL_API_KEY is unset (the gate: the
      // demo can complete when live API temporarily fails).
      id: REPORT_FAILED, event_id: EVENT_WILDFIRES, creator_id: adminUserId,
      status: "retryable_error", review_outcome: null,
      title: "DEMO: Wildfire damage (analysis failed — retryable_error)",
      description: "DEMO REPORT: seeded by scripts/seed-demo.ts. The analysis is in retryable_error state. The Resilience Panel's Re-analyze button returns 503 NOT_CONFIGURED when MODEL_API_KEY is unset (the gate: the demo can complete when live API temporarily fails).",
      latitude: 34.0361, longitude: -118.5187,
      location_source: "gps", location_label: "Pacific Palisades, CA",
      priority_score: 0,
      retry_count: 3,
      last_error: "DEMO: simulated transient failure for demo purposes. The model call would be retried with backoff; past the cap (5), the report is parked in needs_manual_review.",
      sha256: DEMO_SHA256,
      mock: null, // no precomputed analysis for the failed report
    },
  ];

  for (const r of reports) {
    const { error } = await supabase.from("reports").upsert({
      id: r.id, event_id: r.event_id, creator_id: r.creator_id,
      status: r.status, review_outcome: r.review_outcome,
      title: r.title, description: r.description,
      latitude: r.latitude, longitude: r.longitude,
      location_source: r.location_source, location_label: r.location_label,
      original_storage_key: `evidence-originals/${r.event_id}/${r.id}.jpg`,
      derivative_storage_key: `evidence-derivatives/${r.event_id}/${r.id}.jpg`,
      thumbnail_storage_key: `evidence-thumbnails/${r.event_id}/${r.id}.jpg`,
      sha256: r.sha256,
      image_mime_type: "image/jpeg",
      image_bytes: 0, image_width: 800, image_height: 600,
      captured_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      uploaded_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      priority_score: r.priority_score,
      retry_count: (r as { retry_count?: number }).retry_count ?? 0,
      last_error: (r as { last_error?: string }).last_error ?? null,
    }, { onConflict: "id" });
    if (error) {
      console.error(`[seed-demo]   failed to upsert report ${r.id}: ${error.message}`);
      process.exit(1);
    }
    console.log(`[seed-demo]   upserted report ${r.id} (status=${r.status})`);
  }

  // 6. Insert the precomputed mock analyses for the 4 needs_review
  //    reports (NOT for the failed report — it has no analysis).
  console.log("[seed-demo] step 6: insert precomputed mock analyses");
  for (const r of reports) {
    if (!r.mock) continue; // skip the failed-analysis report
    const { error } = await supabase.from("report_analyses").upsert({
      report_id: r.id,
      // model_id is "demo-mock-v1" (NOT "muse-spark-1.3") so the
      // report-detail UI shows "Demo mock" + the demo banner.
      // Per the brief: "Precomputed mock outputs must never be
      // falsely labeled as live Meta inference."
      model_id: "demo-mock-v1",
      prompt_version: "demo-v1",
      schema_version: "demo-v1",
      structured_observation: r.mock,
      severity_score: r.mock.preliminary_severity * 20,
      severity_uncertainty: 0.3,
      raw_usage_metadata: { _demo: true, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      processing_status: "succeeded",
      completed_at: new Date().toISOString(),
    }, { onConflict: "report_id" });
    if (error) {
      console.error(`[seed-demo]   failed to upsert analysis for ${r.id}: ${error.message}`);
      process.exit(1);
    }
  }

  // 7. Insert a review_action for the reviewed report (so the
  //    ReviewHistory component shows the audit trail). Use a fixed
  //    id so the seed is idempotent (re-running doesn't create
  //    duplicate rows).
  console.log("[seed-demo] step 7: insert the review_action for the reviewed report");
  const REVIEW_ACTION_ID = "99999999-9999-4999-8999-999999999999";
  const { error: reviewActionErr } = await supabase.from("review_actions").upsert({
    id: REVIEW_ACTION_ID,
    report_id: REPORT_REVIEWED,
    reviewer_id: reviewerUserId,
    action: "confirm",
    comment: "DEMO: reviewer confirmed the (mock) AI observation. Seeded by scripts/seed-demo.ts.",
    previous_status: "needs_review",
    new_status: "reviewed",
    previous_observation: null,
    new_observation: null,
    previous_severity: 80,
    new_severity: 80,
  }, { onConflict: "id" });
  if (reviewActionErr) {
    console.error(`[seed-demo]   failed to upsert review_action: ${reviewActionErr.message}`);
    process.exit(1);
  }

  // 8. Insert a report_retention row for each report (the Phase 12
  //    retention workflow requires it; without it, getRetentionState
  //    returns "active" by default — which is what we want for the
  //    demo).
  console.log("[seed-demo] step 8: insert report_retention rows (active state)");
  for (const r of reports) {
    const { error } = await supabase.from("report_retention").upsert({
      report_id: r.id,
      retention_state: "active",
    }, { onConflict: "report_id" });
    if (error) {
      console.error(`[seed-demo]   failed to upsert retention for ${r.id}: ${error.message}`);
      // not fatal — the retention row is optional for the demo
    }
  }

  console.log("[seed-demo] done. Summary:");
  console.log("  - 2 demo events (Helene + Wildfires)");
  console.log("  - 2 demo users (admin + reviewer)");
  console.log("  - 5 demo reports (1 GPS, 1 manual, 1 unknown, 1 reviewed, 1 failed)");
  console.log("  - 4 precomputed mock analyses (model_id = demo-mock-v1)");
  console.log("  - 1 review_action (for the reviewed report)");
  console.log("");
  console.log("  Set DEMO_MODE=1 on Vercel to show the demo banner.");
  console.log(`  Sign in as ${ADMIN_EMAIL} / <password from DEMO_SEED_ADMIN_PASSWORD>`);
  console.log(`  Reviewer: ${REVIEWER_EMAIL} / <password from DEMO_SEED_REVIEWER_PASSWORD>`);
  console.log("  (Passwords are NOT echoed by the seed script — find them in your .env.)");
}

main()
  .catch((e) => {
    console.error("[seed-demo] unexpected error:", e);
    process.exit(1);
  });
