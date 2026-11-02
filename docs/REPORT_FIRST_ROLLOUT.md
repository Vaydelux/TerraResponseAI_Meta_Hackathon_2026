# Report-first redesign — Phase 1 staging rollout

> Feature-flagged **prototype**, NOT a verified operational emergency dispatch system. No automatically verified disasters and no emergency dispatch.

## Architecture

- **Event:** Broad situation/workspace; `community-intake` is created once under an existing app administrator by migration 20261103120000. Individual reporters do NOT select or create this shared event.
- **Report:** Immutable individual evidence identity and ownership. Existing image sanitation, private Storage, event RLS, deduplication and review behavior remain.
- **AI triage:** A separate `report_triage` record carries severity, routing class, policy version, provisional verification and private publication. AI never sets `reviewed`, `confirmed`, or `public_verified`.
- **Incident thread:** `incident_threads` groups potential same-type, recent, nearby reports, while `incident_report_links.confirmed_match=false` distinguishes machine suggestions from reviewer-verified merges. Every original report remains independent.
- **Notifications:** A durable database inbox with recipients filtered through RLS. New submissions notify admins, and AI triage notifies admins and applicable reviewers. No untrusted user text is copied into a notification.
- **Geo:** Matching candidates use a PostGIS indexed geospatial query, limited to a 48-hour window, 5 km default or 10 km for flooding. **Distance and incident category alone do not prove two reports describe the same incident.** Reviewer merge/split tooling is a later phase.

## Feature flags and environment

Both flags default to **off**:
- `REPORT_FIRST_INTAKE_ENABLED=true` permits signed-in users to upload to the server-selected, fixed `community-intake` event; the server uses a service-role key only for idempotent contributor enrollment. Client-supplied private event IDs still require preexisting membership.
- `REPORT_FIRST_TRIAGE_ENABLED=true` queues AI triage, incident suggestions, and notifications after a real validated Muse model response is saved.

Only enable these on isolated **Vercel Preview** after the new migration is applied to isolated Supabase staging `ytfaetqvtbsbmcsdlkvk`, the intake event exists, real reporter JWT tests pass and staging service-role key is configured. **Production stays unchanged.**

## Important deliberate limitations

- **No automatic public publication yet.** A high-severity photo becomes an urgent *private, provisional* triage notification. The next phase needs a safe public read model with verified location, image privacy and false-positive controls.
- **No auto-confirmation.** Human reviewers must still verify incident facts.
- **No automatic duplicate merging based solely on 5–10 km radius.** Geospatial matches are *suggestions*, require corroborating evidence and may need reviewer split decisions.
- **Role promotion/demotion**, admin search UI, moderator queue personalization and realtime push are subsequent steps, not concealed features.
- **No background job durability** yet. The client requests inference after upload. If the client navigates away before the request finishes, triage can stall; a separate durable queue/worker is required.
- **Migration history:** isolated staging already has timestamped records; never run `db push` from the repository root. Use guarded staging workflows.
- **No live Meta inference is claimed** without a real staging key and recorded response. When no key is configured, uploads remain saved but analysis fails honestly.
- **No private source image or exact GPS coordinates** should be placed in public notifications.

## Validation

1. CI: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`.
2. Apply migration only to isolated staging and verify RLS policies, grants and no anon privileges.
3. Verify community-intake exists and is active; it must be created by a real admin profile.
4. Sign in as fresh reporter with no event memberships, submit a rights-cleared synthetic photo without selecting an event, verify only contributor enrollment in `community-intake`.
5. Prove a reporter cannot supply another event's ID or elevate role; admin/reviewer existing memberships are not overwritten.
6. With explicitly approved paid Meta model API key, submit images at levels 1–5 and unknown; verify correct triage classes and all remaining in `awaiting_human` / `private`.
7. Verify 5–10 km PostGIS candidates create suggestions, retain separate reports, reject unrelated hazards and exclude location-unknown reports from geo matching.
8. Verify admin notifications and event-scoped reviewer inbox RLS, retry idempotence, image privacy, login redirect behavior and moderation.
9. Do not promote to production or mark hackathon demo working without real browser E2E and rollback plan.

## Next implementation sequence

1. Durable server queue and authorized triage state transitions / controlled provisional publication.
2. Admin user search, role changes with audit and last-admin protection.
3. Review-verified thread merge/split UI, user contributions, moderation decisions and map display.
4. Realtime notifications using private role-scoped broadcast channels and an audit-backed outbox.
5. Complete end-to-end test of the representative critical disaster report and reviewer journey.
