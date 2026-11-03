# TerraResponse AI — Critical hackathon readiness audit

**Audit date:** 2026-11-03 (Philippines)  
**Base reviewed:** GitHub `main` at `d5460b0`  
**Project:** Meta Global AI Developer Hackathon 2026, *Build for Your World*  
**Submission deadline:** Nov 4, 9:00 PM ET / Nov 5, 10:00 AM PHT (verify against organizer before submitting).

> **Status:** A competitive prototype idea, not yet a demonstrated, end-to-end working disaster-response platform. This is a code, CI, database-policy and deployment-state inspection. It is not a substitute for testing a signed-in browser with a real Meta API response. The application does not dispatch emergency responders and must not be marketed as doing so.

## Executive assessment

**Strengths:** Specific human problem, immediately understandable photo input, Meta vision model with strict observation validation, evidence provenance, separate human verification, PostGIS neighborhood matching, private evidence storage and explicit uncertainty/verification status. These make a convincing *Build for Your World* demonstration if the chain works live.

**Most significant risk:** CI passing is not a test of the actual judge experience. A public page may render while the authenticated user never finishes an upload, paid inference, review or map transition. With no rows in either production or staging `reports` when queried on Nov 3, there is no stored test report in those connected environments demonstrating the full path.

## Critical release blockers (must verify before claiming production readiness)

| Priority | Finding | Evidence and impact | Acceptance gate |
|---|---|---|---|
| P0 | Production deployment behind GitHub `main` | Latest READY production deployment returned by Vercel was `715f9af`; reviewed `main` was `d5460b0`. Branding and subsequent fixes are not automatically proven live | Production deployment commit == reviewed `main`; authenticated smoke test |
| P0 | No confirmed real reporter-to-reviewer path | Both Supabase projects returned `reports=0` at audit time; this does not establish a successful photo save, Meta response or review transaction | Two different signed-in accounts; saved private image; real Meta inference; authorized review; visible reviewed map point |
| P0 | Production cannot demonstrate admin-only review actions | Production `profiles.role='admin'` count was zero, staging count one | Explicitly bootstrap the intended production admin through the reviewed secure script; do not auto-promote a random user |
| P0 | Production triage flag/permissions need validation | `REPORT_FIRST_TRIAGE_ENABLED` is scoped to Preview in the Vercel variable list, while the new review-severity database trigger requires a triage record before ordinary reviewer decisions | Enable/test staging first; confirm low/moderate reviewer and high/critical admin workflows, then explicitly roll out in production |
| P0 | Preview Meta credentials not listed | `MODEL_API_KEY` and `SAM_API_KEY` appeared only for Production in the Vercel environment-name inspection | Provision separate, least-privilege Preview credentials, then verify one actual Meta request without printing secrets |
| P1 | Auth security advisories | Supabase advisor reported callable `SECURITY DEFINER` warnings (11 staging, 12 production) and leaked-password protection disabled. These are advisory findings, not proof of exploitation | Review each privileged function's intentional authenticated use, execute grants and UID checks; enable compromised-password protection |
| P1 | CI does not run signed-in Playwright E2E | `.github/workflows/ci.yml` runs lint, TypeScript, Vitest and build; E2E isn't in the job | Add an approved staging E2E gate with isolated accounts; run upload, review, forbidden access and private URL tests |
| P1 | Paid model execution duration and retries | Muse route retries transient requests up to 5 attempts with delays; timeout and function duration must be tested on the actual hosting plan | Measure real call latency, set appropriate function duration, handle stale `analyzing` requests |
| P1 | Supplemental Google context must not be presented as Meta image analysis | Gemini-powered background context is a separate optional input; model-generated text is not an official bulletin | Keep Meta image evidence and optional third-party context labeled separately with source links |

## Implemented in the focused stabilization patch

1. **False live advisories:** Missing external credentials or an unknown location now yields a clearly ungrounded result without invented weather alerts, news headlines, source citations or Manila coordinates. Google outputs without retrieved grounding links no longer claim verified grounding.
2. **Meta observation integrity:** Auxiliary context and SAM overlays use separate persisted metadata rather than inserting extra keys into the strict Zod observation. Legacy read compatibility remains.
3. **Paid SAM boundary:** Reviewer/admin authorization, event-scoped permission checks, server-side AI budget checks, reuse/cooldown of a saved mask, usage telemetry and explicit save-error handling.
4. **Upload abuse:** An unavailable database upload counter now returns a temporary error instead of silently allowing unlimited uploads. Zero successful uploads are claimed when it fails.
5. **Idempotent triage:** Incident candidate matching uses the stored original incident type, not a new result calculated during a retry.
6. **Plain-language UX:** A signed-in reporter's landing CTA opens the upload page (not the reviewer queue); dashboard no longer requires users to understand internal event counts; reporters do not see the reviewer-only external context card.
7. **Regression tests:** Added checks for provenance, false advisories, strict-schema separation, cost gates, CTA routing and fail-closed counting.

> **Important:** These are code changes, not proofs of live readiness. Always require green CI and then actual end-to-end staging checks. Keep any new public critical publication flag OFF until authorized field and security testing is completed.

## The one core demo to polish (no feature creep)

1. **Reporter:** Log in, tap **Upload a photo**, choose a rights-cleared synthetic or licensed image. There is no event dropdown.
2. **Proof:** Show file validation, optional location/unknown state, private storage, and newly created report ID.
3. **Meta:** Show a genuine Muse Spark response, model ID and structured visible evidence. Explicitly state image-only uncertainty and retain original metadata.
4. **Reviewer:** Sign in as a *different* authorized account. Display the pending/uncertain seal, compare evidence, and confirm or correct with an auditable reason.
5. **Map:** Show one verified and located report, with unlocated reports excluded, and one genuinely provisional grouping clearly labeled suggested.
6. **Explain safeguards:** No automatic emergency dispatch, no invented location, no anonymous evidence download and no AI auto-verification.

If live inference fails, show the real error and the manual-review path. Do not edit a recorded demo to represent mocks as real Meta responses.

## Acceptance and QA matrix

| Category | Critical test | Pass criterion |
|---|---|---|
| Authentication | Reporter signup/login/logout and revoked session | No redirect loop; protected routes deny stale/anonymous sessions |
| Authorization | Reporter tries review, cross-user report and arbitrary event upload | 403/404; no role escalation; no private URL |
| Media | JPEG, PNG, WebP, disguised nonimage, over-limit file | Supported files save privately; others fail with clear reason |
| Data reliability | Duplicate photo, two simultaneous submissions, network interruption | No repeated expensive model call; no duplicate lost report; resumable status |
| AI | Real Meta request, malformed response, 429, timeout | Validated typed result, retry cap, error/manual-review path |
| Severity | Low/moderate reviewer; critical admin; unverified alert | DB policy enforced; no AI-generated confirmed disaster |
| Geolocation | GPS, manual, unknown, boundary extremes | No invented coordinates; map excludes unknown |
| Clustering | Two reports of same hazard within 5/10 km, concurrent arrivals | Suggestions only, original reports independent, no duplicate verified claims |
| Privacy | Reporter tries another user's raw evidence link | Denied; private storage and short TTL remain enforced |
| UX | 320, 375, 768, 1024 and 1440 px; keyboard; Day/Mist/Night | No clipped primary action; WCAG-oriented contrast and focus; reduced motion |
| Deployment | Protected preview, latest production SHA, error scan | Correct environments, matching tested commit, valid response and rollback target |

## Release decision

**Code/architecture:** Promising prototype with meaningful safeguards.  
**UI concept:** Strong, but a reviewer interface is too complex to substitute for one accessible reporter journey.  
**Operational readiness:** **NOT VERIFIED** until a real reporter → Meta → reviewer → map demonstration exists in a deployed environment.  
**Winner potential:** Plausible if the problem story and working Meta-powered workflow are clear; no reliable method can predict judging outcomes.

**Do not add more large features before the demo is stable.** Fix the first failed real-world step, repeat with a second account, capture non-secret evidence and make the submission honest.
