# TerraResponse AI — Reviewer workbench + SAM integrity hardening (2026-11-05)

## Verified defects and fixes

- The review screen previously exposed segmentation based on `SAM_API_KEY` alone, whereas its server rejected `needs_manual_review` with HTTP 409. The unchanged Retry button repeated that permanent state conflict. Now **authorized independent reviewers** can explicitly enter a concrete target for optional SAM assistance on a saved failed-Muse report, without claiming Muse succeeded, automatically retrying Muse, or marking the report verified.
- The old SAM success path only detected string fragments, passed special-token output as raw `rle`, invented confidence 1.0 and zero geometry, while the photo viewer drew a fixed 60%-sized rectangle. Both are removed. Official Meta SAM 3.1 stream and base85 mask parsing are vendored under `src/lib/vendor/meta-sam/` with their license; only validated decoded pixel masks can be displayed, aspect-fitted and moved with the zoomable image. Invalid, missing and no-match masks show no invented highlight.
- Failed Muse reports previously fell back to a false Severity 1 / Minimal and inherited other unvalidated model text. The review panel now shows “Not assessed” and no model observations. Human-only corrections are clearly attributed to the reviewer, not Meta.
- Review Confirm, Correct, Flag, Reject now use event-scoped permission checks in addition to the existing server-side atomic database function. The UI disables repeated submissions after confirmed success, avoids blind retries on 403/409, and applies a committed review state before navigation. Self-review is forbidden for reviewers and permitted for global administrators per existing database policy.
- Priority Submit override was shown to regular reviewers even though the API and RLS permit only event coordinators and global administrators. The form is now shown only when authorized. Previous insert-then-update could leave an audit record without an updated score on failure; new `submit_priority_override_atomic` SQL function locks the report, enforces permission and writes history/score in one transaction with an idempotency key. Transient retries reuse the same key; 403/409 do not repeat automatically.
- Reporter, unrelated-event member or retained/purged report cannot trigger reviewer actions or paid segmentation. Server authorization/RLS remains the final boundary; UI guards are not relied upon to secure data.

## Role-capability matrix

| Role or event membership | View owned report | Review decisions | Manual SAM assistance | Priority override |
|---|---:|---:|---:|---:|
| Reporter, self | Yes | No | No | No |
| Reporter, unrelated report | No unless separately authorized | No | No | No |
| Global reviewer + assigned event reviewer | Authorized | Yes, but not own | Optional explicit request, cost-limited | No |
| Global reviewer + event coordinator | Authorized | Yes, but not own | Optional explicit request, cost-limited | Yes |
| Global reviewer without event membership | Restricted | No | No | No |
| Global admin | Authorized | Yes including own, logged | Optional explicit request | Yes |

An event coordinator must still have the global reviewer/admin role to open the reviewer workbench, matching the existing authentication model. The priority API recognizes the event coordinator role independently.

## Technical validation and dependencies

- Automated: exact-commit lint, TypeScript, Vitest, production build, Playwright public responsive browser smoke at 320 / 768 / 1440px. Unit tests cover local role decisions, UI actions, fake-mask rejection, official Meta captured wire fixture, manually triggered SAM, failed-AI provenance, no retry for permanent state and SQL atomicity.
- Applied **only to staging**: `supabase/migrations/20261105001000_atomic_priority_override.sql`. Read-only verification confirms authenticated may execute the new function; anon may not. No existing reports, role assignments or review histories were changed by the migration.
- **Production Supabase migration applied and verified**, after a zero-report preflight. Both staging and production expose the same atomic RPC: authenticated EXECUTE is allowed, anonymous EXECUTE is denied. The schema migration created no report, review or priority-override records. A real authorized production override transaction has not been executed.
- Meta SAM inference and signed-in reviewer action buttons have **not** been executed live in staging as part of this pass; unit fixture passing does not establish live model quality, source-pixel alignment for every phone photo, actual cost, or two consecutive complete demos.
- The Vercel production daily deployment quota previously returned HTTP 402 and may still block deployment. Merging a PR does not itself mean the production domain serves these changes.
- Optional SAM is never evidence authenticity or a substitute for human confirmation. Reviewer decisions are recorded with attribution, but neither human review nor SAM proves a historic image was captured at the reported coordinates.

## Safe demonstration fallback

“Meta's first analysis can be unavailable. TerraResponse AI retains the private photo and sends it to an independent reviewer; it never invents severity or a successful schema validation. The reviewer can still confirm, correct, flag or reject it with an audit trail. Optionally, if a SAM API key and a specific target are available, the reviewer can request a real model mask—clearly labeled AI-generated and not verified. The report and reviewer decision remain usable when SAM is unavailable.”

**Final acceptance to be performed:** deploy staging with migration, use separate authenticated reporter and reviewer identities, test all four review buttons and the priority override under an assigned coordinator, inspect actual review_actions and priority_overrides persistence, request one optional paid SAM mask, and verify a real photo-aligned overlay. Run the 2–3-minute demo twice with no failures before calling it hackathon-ready.
