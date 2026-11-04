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
