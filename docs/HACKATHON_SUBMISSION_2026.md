# TerraResponse AI — 2026 Meta Global AI Developer Hackathon submission kit

> **Truthfulness rule:** Never call a build, mocked test, staging schema or prerecorded synthetic example proof of live Meta inference. The product is a decision-support **prototype**, not an operational disaster dispatch system.

## Submission snapshot (verify immediately before submission)

- **Track:** Indie Developer (if entered as an individual) or Startup (if entered as a startup team); select the track actually registered.
- **Theme:** Build for Your World.
- **Published 3-minute demo (YouTube):** https://youtu.be/MldyTvwECMo
- **What the video proves:** UI walkthrough with real recorded analysis-unavailable fallback; not proof of a completed live Meta output or persisted independent reviewer transaction.
- **Repository:** https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026
- **Application:** https://terra-response-ai.vercel.app
- **Official deadline:** November 4, 2026, 9:00 PM US Eastern Time (November 5, 2026, 10:00 AM Philippine time).
- **Review gate:** GitHub CI success and Vercel deployment READY are necessary, not sufficient.
- **Connected staging:** `ytfaetqvtbsbmcsdlkvk` — separate from production; all twelve source migrations are now applied and recorded, including 0010's transactional reviewer RPC. Its remote migration history uses connector-generated timestamps rather than the repository's four-digit versions; do not use `db push` until reconciled. The RPC schema, grants and unauthenticated denial were verified, but live distinct-user role tests are pending.
- **Security verified with read-only SQL:** 11 public application tables with RLS enabled, 3 private evidence buckets, zero privileged `SECURITY DEFINER` functions executable by `anon` after staging permission hardening.
- **Not yet proven:** end-to-end reporter → live Muse Spark → human review → map with real JWTs, live model use, SMTP deliverability, automated browser acceptance. Keep issue #21 and issue #30 open until proven.
- **Deployment:** Production data is not an authorized staging test surface. No real responder or victim evidence should be uploaded for public hackathon use.

## Source and AI-development acknowledgments

The project creator credits **Z.ai** for the initial design, **Gemini 4 and Gemini 3.8** for agent-first implementation (creator-provided model labels), followed by **OpenAI ChatGPT and Codex** for brainstorming, review and polishing. These are coding/design assistants, distinct from the **runtime Meta Muse Spark 1.3 and optional Meta SAM 3.1** integration. See [Hackathon showcase](HACKATHON_SHOWCASE.md).

**Judges' video:** https://youtu.be/MldyTvwECMo. The delivered recording does **not** establish a successful Muse response or persisted independent review action. Avoid using “AI successfully classified this example” for the filmed case.

## Project title

**TerraResponse AI — Human-Verified Disaster Photo Intelligence**

## One-sentence pitch

Turn disaster photos into structured, location-aware incident observations using Meta AI, then let authorized people verify the findings before they appear on a decision-support map.

## Copy-ready abstract (use only if the corresponding features are actually demonstrated)

Disaster-response teams receive pictures faster than they can interpret, organize and cross-check them. TerraResponse AI is a prototype that organizes incident photographs into a reviewable event workspace. Meta Muse Spark analyzes an uploaded image and proposes a structured incident category, visible evidence, preliminary severity and uncertainty. The API validates that output and explicitly labels it unverified. A separate, authorized human reviewer can correct or confirm observations, with an audit record and original AI output retained. Reviewed reports with trustworthy locations can be plotted on an incident map; unknown-location evidence is never assigned fabricated coordinates. Optional SAM 3.1 segmentation is available to highlight user-selected objects when its live integration has been tested. The application is designed as human decision support—not emergency dispatch or authoritative triage.

**Before submitting:** Remove any sentence above that the demo has not actually proven. If Muse Spark or SAM is mocked, say so prominently.

## Why Meta models are material

- **Muse Spark:** Vision-language analysis of a disaster photo; proposes incident type, evidence, concise summaries, uncertainty and preliminary severity. Zod schema validation is performed separately from model generation. The model does not approve its own findings.
- **SAM 3.1 (optional):** Targeted segmentation of a reviewer-requested object such as floodwater or debris. Do not present this as a working feature unless a real request and displayed mask have been verified.
- **Human review:** Provenance, role separation and corrections are the core differentiator. No auto-dispatch and no fabricated geolocation.

## Three-minute demo plan (record the real screen, no fabricated outputs)

| Time | Shot | Evidence to show |
| --- | --- | --- |
| 0:00–0:20 | Landing page and why it matters | Prototype and AI limitations clearly labeled |
| 0:20–0:55 | Reporter uploads a rights-cleared synthetic JPEG/PNG | File validation, location selection and private report record |
| 0:55–1:25 | Model inference | Actual Muse Spark result with request evidence, model ID, validation, and uncertainty; **or** clearly state that a demo mock is used |
| 1:25–2:15 | Separate reviewer signs in | Correction/confirmation, auditable action, reviewer not equal to reporter |
| 2:15–2:40 | Event map | Only reviewed reports with real/explicit location appear; no fictional points |
| 2:40–3:00 | Technology/limitations | Architecture, safeguards, explicit Meta model attribution, next steps |

Record **one continuous successful end-to-end path** if possible. If a step fails, show the real failure path instead of editing in a fictional success.

## Submission artifacts to collect

- [x] Final 3:00 narrated YouTube demo link: https://youtu.be/MldyTvwECMo (shows AI-unavailable/manual-review fallback)
- [ ] Public GitHub repository and deployed URL confirmed accessible without revealing secrets
- [ ] Concise README with setup and model APIs
- [ ] One genuine live Muse Spark run logged with a non-secret request ID, response status, model ID, Zod validation and saved report/analysis
- [ ] One actual separate reviewer action stored and visible in the map
- [ ] Privacy-safe demo images (rights-cleared, synthetic or authorized) with clear labels
- [ ] Staging user isolation tests (reporter cannot review; cross-event access denied; no self-review)
- [ ] Mobile screenshot, keyboard accessibility and loading/error handling checked
- [ ] Individual/teammate names supplied by the project owner
- [ ] Final project submission made through Meta's actual required submission portal before the deadline (not performed by this document)

## Go/no-go criteria

**GO for a labeled prototype demonstration:** Code builds and tests pass, public landing page works, media and simulated flows are clearly labeled, and the limitations are disclosed.

**GO for a *working Meta-powered* submission:** In addition to the above, staging has required database objects and role-scoped grants; real auth works; a reporter uploads a photo; Muse Spark is invoked successfully and persists a validated observation; a distinct reviewer saves a decision; and the map shows the reviewed incident. Capture the video from the deployed app.

**NO-GO for claiming end-to-end working:** Missing `submit_review_atomic`/review RPC; unconfigured staging server secret; unavailable real model; no live reviewed-map flow; or unverified email confirmation. Fallback demo data must never be passed off as real inference.

## Current blocking items

1. [Issue #30](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/30): Staging SQL parser issue fixed and reviewer RPC installed; legacy/timestamped migration history still needs reconciliation and live role tests. A source fix is under review; do not ship API changes before the matching database function exists.
2. [Issue #21](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21): Custom SMTP, email confirmation and removal of temporary staging test identities require evidence and owner signoff.
3. Vercel Preview has a staging URL and public anon key, but lacks its own privileged service key and paid-model keys. Do **not** copy production service-role secrets to Preview or expose server keys in source code.
4. GitHub Actions cannot safely `db push` the connector-created migration history until both are reconciled and reviewed.

## Suggested judge Q&A

**Q: Can this system dispatch responders or certify severity?**  
A: No. It is a human-reviewed incident awareness prototype. AI suggestions and priority scores are provisional.

**Q: What did Meta AI actually do?**  
A: Refer to the recorded, real Muse Spark call and structured response. Only describe SAM as live if a mask from a real call is shown.

**Q: How do you prevent hallucinated locations?**  
A: A location must be supplied or extracted and verified; unknown location is represented as unknown, not a generated GPS point.

**Q: What makes human corrections trustworthy?**  
A: Separate reporter/reviewer authorization, RLS, an auditable review action and preserved raw AI observation. The full live security claim depends on completing the role-isolation tests.

**Q: What happens if AI is down?**  
A: A report remains available for appropriately authorized manual review, with no invented AI result.

## Verify before submitting

Run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, and staging browser acceptance. Only record commands as passed when their execution results are available. The presence of a package script or README claim is not a test result.
