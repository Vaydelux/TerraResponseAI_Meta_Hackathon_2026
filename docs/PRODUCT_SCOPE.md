# TerraResponse AI — Product Scope

> Status: **Planning gate.** This document fixes the safety boundaries and the
> must-have scope before any feature code is written. Implementation phases
> are defined in `BUILD_PLAN.md`; architectural and security detail live in
> `ARCHITECTURE.md` and `SECURITY.md`; rationale for non-obvious choices is
> recorded in `DECISIONS.md`.

## 1. Purpose & Vision

TerraResponse AI is a disaster-photo intelligence and human-review platform
built for the Meta Global AI Developer Hackathon. Its job is to turn a flood
of unstructured on-the-ground photos submitted by responders and the public
into a small, verified, prioritized list of incidents that an emergency
response team can actually act on. The platform deliberately keeps a human
in the loop on every report: artificial intelligence proposes, humans
dispose. Nothing the AI says is ever shown to anyone outside the reviewer
role as a verified finding, and the platform never dispatches emergency
services on its own.

The MVP demonstrated at the hackathon will be a single Next.js application
that an authenticated contributor can sign in to, pick an active incident
event (e.g., "Hurricane Helene — Asheville"), upload a disaster photo, and
confirm or correct the photo's location. The server then runs the Meta Muse
Spark vision model against the image, validates the model's structured
output against a Zod schema, and stores a **private** evidence record. A
reviewer (or admin) sees the AI's preliminary result, confirms or corrects
it, and the report is published to the incident map and dashboard with a
provisional severity score. The Optional SAM 3.1 segmentation mask is a
graceful extension that reviewers can request on a per-report basis when
the AI's coarse description is not enough.

This scope document exists so that the implementation phases that follow
have a single, agreed-upon definition of "done." Everything in the must-have
list is required for the hackathon demo to be considered a working MVP;
everything in the optional list can be cut without breaking the end-to-end
path.

## 2. Actors

### 2.1 Authenticated Contributor (MVP)

The contributor is the person on the ground or in the operations center who
has a photo to submit. In the MVP a contributor can:

- Sign in with email and password.
- See the list of active incident events and pick one to submit against.
- Upload a single JPEG or PNG photo (max 10 MB) for that event.
- Confirm, correct, or mark the photo's location as unknown via EXIF GPS,
  a manual map pin, or an explicit "unknown" choice.
- Track the status of their own submissions in their profile view.
- Edit or delete only their own submissions that have not yet entered the
  human-review pipeline (i.e., status `uploaded` or `analyzing`).

Contributors **cannot** see other contributors' submissions, the review
queue, the audit log, or the AI's raw output for any report they do not
own. They see only the validated summary that has been published for their
own report.

### 2.2 Reviewer / Admin (MVP)

The reviewer is the human-in-the-loop. In the MVP we ship two global roles
above contributor — `REVIEWER` and `ADMIN` — and they share the same
permissions except where explicitly noted. A reviewer/admin can:

- Do everything a contributor can do (upload, etc.).
- See the Review Queue: every report in `needs_review` or
  `needs_manual_review` status, across all events.
- Open a report, see the photo, the AI's preliminary structured result,
  the location, and any prior review actions.
- Confirm, flag, reject, or resolve the report. Each action is recorded
  as a `ReviewAction` row and an `AuditLog` entry.
- Override the AI's severity or category if it is wrong.
- View the Incident Map and the Dashboard with all confirmed incidents.
- Read the Audit Log.

`ADMIN` additionally can create, close, and archive incident events, and
adjust per-event cost controls. `REVIEWER` cannot. For the hackathon demo
we ship one admin and one reviewer account; both share the same UI but the
admin sees an extra "Events" management affordance in later phases.

### 2.3 Extensible Event-Membership Role Model (Post-MVP)

The MVP enforces roles **globally**: every reporter can upload to every
active event, every reviewer can review every report. This is intentionally
simple and is good enough for the hackathon. The schema, however, is
designed to extend cleanly to **per-event membership**:

- A new `EventMember` table links a `User` to an `Event` with an
  event-scoped role: `contributor` | `reviewer` | `coordinator`.
- The application-layer authorization helpers
  (`requireUser`, `requireRole`, `reportReadWhere`) gain an optional
  `eventId` parameter that consults `EventMember` first and falls back to
  the global role.
- A coordinator can manage their event's membership, set per-event cost
  budgets, and close the event when the response is winding down.

This extension is **not built in the MVP** but the database design in
`ARCHITECTURE.md` reserves the table and the authz layer reserves the
extension point so it can be added in a later phase without a schema
migration that breaks existing rows.

## 3. End-to-End User Journey

The fixed path the MVP must support end-to-end, in order. Each step is
implemented by a specific phase listed in `BUILD_PLAN.md`. No step may be
skipped; that is what "must-have" means.

1. **Sign in.** The contributor signs in with email + password. (Phase 1,
   complete.) The session is a signed JWT valid for 8 hours. Failed login
   attempts are recorded in the audit log.
2. **Select incident event.** The contributor picks one active event from
   a dropdown on the upload form. (Phase 2.) Events are admin-created
   ahead of time. If no active events exist the upload form shows an empty
   state and the contributor is told to contact an admin.
3. **Upload image.** The contributor selects a JPEG or PNG file. (Phase 2.)
   The client validates MIME and size before upload. The server re-validates
   and stores the file under `/home/z/my-project/uploads/<eventId>/<reportId>`
   with a generated filename. The original filename is **never** preserved
   (it can leak PII). EXIF metadata is read server-side for GPS and capture
   timestamp, then **stripped** from any later-served copy.
4. **Confirm EXIF GPS or place manual pin or retain unknown location.**
   (Phase 2.) Three branches:
   - **EXIF GPS present**: the map shows the pin and the contributor can
     drag it to correct or click "Confirm".
   - **EXIF GPS absent**: the map prompts the contributor to drop a pin
     manually. They may also choose "Location unknown" and the report is
     still accepted with `locationSource: unknown`.
   - **Contributor declines to share location**: same as unknown.
   The chosen location (or absence) is recorded as `locationSource:
   exif | manual | unknown` on the Report row. `unknown` reports are still
   analyzed but are not shown on the public map.
5. **Create private evidence record.** (Phase 2.) On submit, the server
   creates a `Report` row with status `uploaded`, the image path, the
   chosen location, the event id, and an `UPLOAD` audit log entry. The
   report is private: only the contributor and reviewers/admins can see
   it. No row is created if image storage fails.
6. **Invoke Muse Spark server-side.** (Phase 3.) The server transitions
   the report to `analyzing`, calls the configured vision model
   (Meta Muse Spark in production; the sandbox-equivalent
   `z-ai-web-dev-sdk` VLM in development) with the image and a fixed
   system prompt, and writes an `Analysis` row containing the raw
   output (server-side only), a parsed caption, detected categories,
   hazards, severity, confidence, and a `peopleVisible` boolean. The
   full structured-summary fields the client eventually sees are
   `caption`, `detectedCategories`, `hazards`, `severityScore`,
   `confidence`, `peopleVisible`, and `schemaVersion` — matching the
   Zod schema in `SECURITY.md` §6.3. The call is server-side only —
   the browser never sees the model, the API key, or the raw output.
7. **Validate preliminary structured result.** (Phase 3.) The model's
   raw output is parsed with a Zod schema. Three outcomes:
   - **Schema valid**: the report transitions to `needs_review`.
   - **Schema invalid** (model returned malformed JSON, missing fields,
     out-of-range values, or hallucinated categories outside the allowed
     enum): the report transitions to `needs_manual_review` with the
     validation error stored in `lastError`. A reviewer must do the
     analysis by hand.
   - **Transient failure** (timeout, network, 5xx from the model
     provider): the report transitions to `retryable_error` and is
     scheduled for an exponential-backoff retry (see `BUILD_PLAN.md`).
8. **Reviewer confirms / corrects.** (Phase 4.) A reviewer opens the
   report from the Review Queue, sees the photo, the AI's structured
   result, the location, and any prior history. They pick one of:
   **Confirm** (the AI was right), **Flag** (unclear, needs follow-up),
   **Reject** (not a disaster photo, duplicate, or unsafe), or
   **Resolve** (the incident is closed). They may also override the
   severity score or category. Each action creates a `ReviewAction` row
   with `previousStatus` and `newStatus`, and an `AuditLog` entry with
   action `REVIEW`. On confirm or resolve the report transitions to
   `reviewed` with a `reviewOutcome` of `confirmed | flagged | rejected
   | resolved`.
9. **Map / list with provisional score.** (Phase 5.) Reports with status
   `reviewed` and `reviewOutcome` in `confirmed | flagged | resolved`
   appear on the Incident Map (MapLibre GL JS) and in the Dashboard list.
   The provisional score is computed from `severityScore`, `confidence`,
   recency, and location accuracy, and is shown next to the pin. The
   map supports clustering at low zoom and a side panel with the
   report's summary on pin click. **AI observations are never shown on
   the map as verified** — only the reviewer-confirmed summary is.

## 4. Must-Have Features (MVP)

These are required for the hackathon demo to be considered a working MVP.
Each is mapped to a phase in `BUILD_PLAN.md`.

| # | Feature | Phase |
|---|---|---|
| M1 | Email + password sign-in with role-gated navigation | 1 ✅ |
| M2 | Audit log for all security-relevant actions | 1 ✅ |
| M3 | Application-layer authorization (RLS-equivalent) | 1 ✅ |
| M4 | Admin-managed incident events (create, close, archive) | 2 |
| M5 | Contributor selects an active event before upload | 2 |
| M6 | Image upload with client + server validation (JPEG/PNG, ≤10 MB) | 2 |
| M7 | EXIF GPS extraction + manual pin + unknown-location choice | 2 |
| M8 | Private evidence record (Report row, status `uploaded`) on submit | 2 |
| M9 | Server-side Muse Spark / VLM invocation against the stored image | 3 |
| M10 | Zod-schema validation of AI output | 3 |
| M11 | Report lifecycle: `uploaded` → `analyzing` → `needs_review` / `needs_manual_review` / `retryable_error` → `reviewed` | 3 |
| M12 | Reviewer queue with confirm / flag / reject / resolve actions | 4 |
| M13 | Per-action audit trail (`ReviewAction` + `AuditLog`) | 4 |
| M14 | Provisional severity score (severity × confidence × recency × location) | 4 |
| M15 | Incident map (MapLibre) with clustered pins, severity colors, side panel | 5 |
| M16 | Dashboard with total / pending-review / confirmed counts and average severity | 5 |
| M17 | Profile view listing the contributor's own submissions and their status | 5 |
| M18 | Loading, empty, error, and recovery states on every data-driven view | 1 ✅ |
| M19 | Vitest unit tests for authorization rules, lifecycle transitions, and Zod schemas | 1 ✅ + ongoing |
| M20 | Three-minute demo script (see `BUILD_PLAN.md` §8) | 6 |

## 5. Optional / Cuttable Features

These are valuable but not on the critical path. They can be cut at any
phase to protect the demo date. Cut decisions are made explicitly and
recorded in `DECISIONS.md`.

| # | Feature | Cut consequence | Phase |
|---|---|---|---|
| O1 | **SAM 3.1 segmentation masks** (graceful optional extension) | Reviewer loses a "show me the masked region" affordance; AI's coarse description is still usable. Invoked only when the reviewer explicitly requests it. | 5.5 |
| O2 | **Per-event membership roles** (EventMember enforcement) | All authenticated users can access all active events. Fine for the demo. | post-MVP |
| O3 | **Cost dashboard for admin** (per-event AI call count, token spend) | Admin cannot see spend in real time; cost caps still enforced server-side. | 6 (stretch) |
| O4 | **Self-signup / password reset** | Demo accounts are seeded; new users added by re-running the seed script. | post-MVP |
| O5 | **Multi-image per report** | One image per report. Contributors submit multiple reports if needed. | post-MVP |
| O6 | **Video upload** | Photos only. | post-MVP |
| O7 | **Real-time WebSocket updates** (review queue pushes) | Reviewers reload the queue manually. | 6 (stretch) |
| O8 | **Internationalization (i18n)** | English only. | post-MVP |
| O9 | **Playwright end-to-end tests** | Vitest unit + integration tests cover the critical path; manual browser verification fills the gap. | 6 (stretch) |
| O10 | **Production deployment hardening** (Vercel + Postgres + S3) | App runs in the sandbox. | 6 (stretch) |
| O11 | **AI response caching** (skip re-analysis of identical images) | Re-uploads of the same image are re-analyzed. Cost cap still bounds total spend. | 6 (stretch) |
| O12 | **Audit log UI filtering / search** | Admin sees the most recent N entries in a table. | 6 (stretch) |
| O13 | **Per-event AI cost caps adjustable in UI** | Caps are set via env vars. | post-MVP |
| O14 | **Email notifications on review outcome** | Contributor polls the profile page. | post-MVP |

## 6. Out of Scope (Hackathon)

These will not be built for the hackathon. Listing them here so they are
not silently re-introduced by an over-eager phase.

- Integration with real emergency-services dispatch (911, CAD systems).
- Automated escalation to public-safety answering points.
- Predictive modeling (where the disaster will move next).
- Mobile-native apps (iOS / Android). The web app is mobile-responsive.
- Multi-tenant organization support (multiple response agencies).
- Federated / SSO login (SAML, OIDC, Google, Microsoft).
- A separate public-reporting portal (anonymous submission). All
  submissions require an authenticated account in the MVP.
- Live video streaming from drones or body cameras.
- Long-term archival and retention policies beyond the demo.

## 7. Non-Goals — Fixed Safety Boundaries

These are non-negotiable and apply to every phase. They are also called
out in `SECURITY.md` and enforced by tests where feasible.

1. **Never automatically dispatch emergency services.** The platform is a
   decision-support tool, not a 911 replacement. No API integrations with
   dispatch systems, no auto-call, no auto-text. Reviewers and admins
   decide what to do with the information; the platform does not act on
   their behalf.

2. **Never present AI observations as verified findings.** AI output is
   always labeled "AI preliminary result — pending human review" until a
   reviewer explicitly confirms it. The Incident Map only shows reports
   with status `reviewed` and `reviewOutcome: confirmed | flagged |
   resolved`. Anything still in `needs_review` or `needs_manual_review`
   is visible only to reviewers/admins in the Review Queue, never on the
   public map.

3. **Never expose AI raw output to the client.** The browser only sees
   the validated, structured summary (caption, categories, severity,
   confidence, hazards) and only for reports the user is authorized to
   see. The raw model response (`Analysis.rawOutput`) is server-side only.

4. **Never store or transmit API keys client-side.** The Muse Spark
   (or `z-ai-web-dev-sdk`) key lives in a server-only environment
   variable. No client component imports the SDK or references the key.

5. **Never preserve uploaded image filenames.** Original filenames are
   discarded server-side; files are stored with a generated id. This
   prevents leaking contributor PII (e.g., `john_smith_house.jpg`).

6. **Never serve an image with embedded EXIF GPS to anyone other than
   the original contributor.** Reviewers and admins see the chosen
   location (which the contributor confirmed or corrected); the public
   map shows only the chosen location pin, never the raw EXIF.

7. **Never delete an audit log row when a user is deleted.** The
   `AuditLog.actorId` relation is `onDelete: SetNull`, so the trail
   survives. (See `ARCHITECTURE.md` and `SECURITY.md`.)

8. **Never silently swallow an authorization denial.** Every
   `requireRole` failure is recorded in the audit log with the actor,
   the required roles, and the actual role, so abuse is traceable.

9. **Never accept an unauthenticated request to a mutating endpoint.**
   Every `POST`/`PATCH`/`DELETE` route handler calls `requireUser` or
   `requireRole` before doing anything else.

10. **Never run the AI model on a report a second time automatically.**
    A `retryable_error` retries with backoff (see `BUILD_PLAN.md`), but a
    successful analysis is never re-invoked unless a reviewer explicitly
    requests a re-analysis. This bounds cost.

## 8. Acceptance Summary (High-Level)

The detailed acceptance checklist is in `BUILD_PLAN.md` §9. At the
gate level, the MVP is acceptable when:

- The end-to-end path in §3 works for at least one contributor and one
  reviewer account, in a single browser session, in under three minutes.
- All must-have features (M1–M20) are implemented and tested.
- All fixed safety boundaries in §7 are enforced, with at least one
  unit or integration test per boundary where feasible.
- `bun run lint`, `bun run typecheck`, `bun run test`, and
  `bun run build` all succeed with no errors.
- The application loads cleanly in the sandbox preview with no console
  errors and no unhandled promise rejections.
