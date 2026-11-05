# TerraResponse AI — primary 2½-minute verified workflow demo

> **Current implementation plan, November 5, 2026.** The steps below describe the intended real authenticated staging demonstration. **They have not yet been verified twice in a live browser.** The historical public navigation-showcase script is retained below as a clearly labeled fallback, not proof of end-to-end Meta inference.

## Repeatable offline sample walkthrough

Open `/demo/walkthrough` (or **Try the sample walkthrough** on the landing page). No accounts, Supabase configuration, model keys, map tiles or paid requests are needed. This is an isolated **simulation**, not the primary real Meta-powered acceptance path. It uses only the bundled synthetic image and prewritten observations. Selecting **AI unavailable** changes the sample scenario with one control. Decisions live in memory; **Reset walkthrough** or reload clears them. First load requires the site or local server; once loaded, the interaction has no network dependency. If the image cannot load, its retry/fallback preserves the rest of the journey.

**One-paragraph, three-minute script:** ?This is a simulated workflow, not live Meta output.? Start with the seeded photo, choose the available-observation scenario and select **Use sample report**. Explain the visible evidence and uncertainty, including the English and draft Tagalog summaries; live Muse Spark would generate a separately validated observation here. Continue to sample review, choose confirm and write a factual explanation, then save the simulated decision. Show the sample reviewed index, illustrative coordinate diagram and local history; no real emergency or historical location was verified. Select **Run another walkthrough**, choose **AI unavailable**, and repeat with a manual-review explanation to demonstrate degradation. Use rejection on a further run to show that rejected samples stay out of the index. Finish by explaining that actual uploads, Meta calls, independently authenticated review and database audit evidence require the signed-in staging workflow.

**Rehearsal gate:** Complete this sample path twice consecutively from reset at 320/768/1440; check keyboard focus, no horizontal scrolling, missing-image recovery, unavailable-analysis and rejection. Record results separately from real staging acceptance. The sample map is an offline coordinate diagram; it does not prove real WebGL marker rendering or geographic correctness.

## Preflight: trust boundaries

Use the isolated staging Supabase project and two preauthorized distinct accounts (reporter and reviewer). Never seed or create emergency records in production for a judging demonstration. A labeled synthetic photo may be uploaded as a staging test, but the Meta call and human review must genuinely execute for this to count as a real powered demo. Confirm staging MODEL_API_KEY is configured in the protected environment without printing its value.

The landing's fictional sample map is not live disaster data; the original photo's authenticity is **not** assessed by the system. Human confirmation applies to the recorded review decision, not independent verification of a real-world disaster.

## Primary judged path (2:30–3:00)

| Time | Actual presenter action | Required proof |
| --- | --- | --- |
| 0:00–0:20 | Open public landing, explain that this is human-reviewed decision support, not dispatch | Clearly labeled fictional landing preview |
| 0:20–0:55 | Sign in as staging reporter, choose a synthetic/consented image on **Upload photo**, select its manual location, submit | A persistent report ID and the **Open the report** link, not a mock upload |
| 0:55–1:20 | Show AI status/provenance in the saved report | Actual persisted Muse Spark observation, model ID, provisional severity/uncertainty; or openly show unavailable/manual-review state |
| 1:20–2:05 | Sign in with a separate authorized staging reviewer, open **Review queue** and the same report, inspect evidence, use **Confirm** or a justified correction | A real atomic reviewer decision, independent reviewer ID and durable audit history |
| 2:05–2:40 | Open **Incident map**, point to the human-confirmed report and reviewed map index; inspect its report | Correct coordinates, different status from pending AI-only reports, same authorized snapshot |
| 2:40–3:00 | Explain limitations and fallback | No auto-dispatch, no fabricated location, no unlabeled simulation |

**If a live dependency fails:** show the recorded report's actual error and human-review fallback. If login, model, or map access is unavailable, open the public [fictional sample preview](/#incident-map-preview) and **explicitly state it is a synthetic UI demonstration**, not the reporter→Muse→reviewer transaction. Do not silently replace real inference or confirmation with prerecorded data.

## Two-consecutive-pass acceptance gate

GitHub → Actions → **Staging integration verification** → **Run workflow** → choose branch `plan/demo-two-pass-acceptance-20261105`, and set `run_authenticated_e2e=true` after staging secrets and authorized accounts are confirmed. Leave `run_muse_spark=false` and `run_sam=false` unless a separate smoke test is explicitly needed: **the authenticated E2E itself already makes two real paid Muse inference calls.** The workflow is bound to the protected staging environment; inspect its current branch and owner restrictions before dispatch. If environment branch restrictions reject the run, keep the production release blocked rather than loosening those restrictions silently. This explicitly incurs **two real model inference calls** and exercises two independent synthetic uploads and reviewer actions. The protected job sets `E2E_REQUIRE_AUTHENTICATED=1`, runs `--repeat-each=2 --workers=1 --retries=0`, and fails closed rather than silently skipping. The test is browser-operated for upload and reviewer actions and checks persisted analysis, signed private evidence access, audit history and the reviewed map index. The actual interactive map marker must also be checked during the manual demo: a text fallback cannot prove that WebGL rendered a pin.

Record the exact commit, staging target, two separate pass outcomes, non-secret model identity, reviewer audit verification, map/queue visibility, visual inspection at 320/768/1440, the rehearsal runtime, and any skipped or failed checks. Never paste account passwords, service keys, evidence URLs or private photo contents into a PR, recording or chat.

## Current known limitations (do not hide from judges)

- At the read-only staging audit there was **one located report with a successful Muse Spark 1.3 analysis but zero persisted review actions**. The independent reviewer-to-map proof remains outstanding.
- The authenticated two-pass workflow has been implemented as an **opt-in** staging gate; it is not part of ordinary CI and has not been observed passing until a real protected run completes.
- The map index remains usable if map tiles/WebGL fail; that is not proof of a visually rendered pin.
- Offline upload drafts are local-device storage, not uploaded evidence or live model results. Older drafts without verified owner identity are intentionally not auto-submitted across accounts.
- Provider outages, missing keys or exhausted budgets can interrupt live inference; human review must remain available when supported by the saved report state.
- Issues #21 and #30 are closed on GitHub as checked November 5, 2026. Their closure is separate from evidence for live authenticated acceptance or current deployment configuration.

---

## Previous public navigation-showcase script (fallback only)

# TerraResponse AI — 2½-minute judging demo (current UI)

> Updated for the November 4, 2026 command workspace. This is a **rehearsal
> script**, not evidence that an authenticated browser run or live Meta API
> request has succeeded. Never present synthetic examples as field reports.

## Preflight — do before judges arrive

- [ ] Production/Preview points at the intended Git commit and displays the current landing + dashboard. Do not use a build that failed lint/typecheck/tests.
- [ ] Use a previously authorized **staging** reporter/reviewer account if showing real data; confirm access before starting. No credentials or reset links should be shown on screen.
- [ ] Confirm the chosen event has enough permitted reports for multiple hazards and at least one report with a real location. The dashboard is a **bounded, authorized snapshot (up to 200 reports)**, not a live global disaster feed.
- [ ] Know which demonstration branch you are presenting: **(A)** real staging reports with actual analysis, or **(B)** visibly labeled synthetic landing samples. Do not silently switch from B to A.
- [ ] Confirm map tiles load. If not, rehearse the queue/timeline/details fallback rather than waiting on WebGL.
- [ ] If a real password-reset or Meta API call is required, verify it separately and never count a mock or a successful compilation as proof of delivery.

## Judging flow (2:30 total)

### 0:00–0:20 — Problem, trust boundary, and landing

Open `/`. Show “From disaster photos to clearer incident decisions” and
the synthetic example image. Say:

> “TerraResponse AI turns submitted disaster photos into structured,
> provisional observations. A human verifies them before they are treated as
> confirmed reports. This is decision support, **not emergency dispatch**.”

The landing preview is fictional and explicitly marked as such. Select one
sample pin to demonstrate linkage between a map marker and a detail card.
It is **not** a live model or database transaction.

### 0:20–0:55 — Enter an authorized workspace

Use **Open workspace** (or sign in if a permitted staging account is ready).
Show the event name, **loaded-vs-event-total** count, and four trustworthy
metrics. In `/dashboard`, explain:

> “These results are limited to this event and my account's permissions;
> the loaded report count is not a national emergency statistic.”

Select **Flood** in the horizontal hazard pills, then **All hazards**. Search
for a report you know exists. If there are no reports, stop claiming there
are — use the landing's labeled synthetic preview instead.

### 0:55–1:25 — Timeline and map/queue synchronization

Scrub **Reported-time timeline**. Explain that the timeline shows report
*upload time*, not inferred disaster onset. The priority queue and map
must update together. Click a located map pin or its matching queue card
and show the same selected report in the **Incident details** panel.

A report with unknown location **must remain in the queue and must not be
plotted at any guessed coordinates**. Do not refer to the map's default
camera position as a disaster location.

### 1:25–2:05 — Provenance, pinning, human decision

Point to **AI generated, not verified** on a real AI observation; clarify
that it applies to the **model observation, not proof that the uploaded
photograph was synthetically generated**. If analysis is still pending,
the queue correctly says **Awaiting AI analysis** or **Human review pending**.
Use **Pin report** to add one or two *real authorized* reports to the
**local pinned shortlist**, then optionally select an out-of-filter pin to
restore its details. Explain that pins are local and reset across events.

If signed in as a reviewer, open **Open review workbench** for a report
they are permitted to review. Show the original model observation and
existing human review history, where available. Do **not** fabricate a
successful confirmation or auditor action. If the presenter has only
reporter access, show the read-only evidence view instead.

### 2:05–2:30 — Graceful failures and close

Show the **Refresh reports** control and point out the stale/unavailable
banner if a real refresh fails. Explain the fallback:

> “Even without map tiles or AI inference, authorized reports remain in the
> queue for human attention. No rescue services are automatically dispatched.”

Finish at the selected report's real **Open full report** link or the
`/reports/new` reporter upload entrypoint.

## If the live demo lacks data or a model key

**Preferred fallback:** the synthetic `/` landing preview with visibly
labeled sample observations. Do not seed a disaster into Production merely to
fill the dashboard. For staging data seeding, use only the repository's
guarded, owner-approved isolated staging process; `demo-mock-v1` remains a
mock, never `muse-spark-1.3`. An absent Meta key means **no live inference**.

## Manual QA acceptance checklist (record actual results)

- [ ] Landing, workspace shell, filters, and image cards at **320×800,
      768×1024, 1440×900**; no document-level horizontal scrolling.
- [ ] 44px target and visible focus for tab, pin, theme, account dropdown,
      reporter and review action links; keyboard-only operation.
- [ ] Desktop 65/35 split, tablet map-first 400px, mobile map-first 320px,
      pinned swipe cards and stacked CTAs.
- [ ] Dark and light contrast, long titles/emails/coordinates, reduced motion,
      no text floating unsafely over images.
- [ ] Loaded/total numbers truthful; no phantom hazard classification,
      severity, model confidence, geographical location or agency dispatch.
- [ ] Broken thumbnail, blocked tiles, no WebGL, rejected/expired auth,
      stale report read, missing AI analysis: clear fallback without a crash.
- [ ] Explicit separate evidence for a *real staging* reporter → Meta →
      human reviewer → map workflow, if that claim is made.

## Release QA evidence

- GitHub Actions lint, TypeScript, Vitest and production build are the core
  gate. `responsive-browser-smoke` runs real Chromium against the
  **standalone production artifact** at 320, 768, and 1440 when configured.
- The public browser smoke **does not prove a real Supabase upload, Meta
  inference, review action, private-storage isolation or SMTP delivery**.
  Protected authenticated staging E2E remains opt-in and must fail rather
  than silently skip when `E2E_REQUIRE_AUTHENTICATED=1`.
- Record the exact run SHA, browser smoke outcome, any skipped protected
  checks and the actual rehearsal duration before calling the demo done.
