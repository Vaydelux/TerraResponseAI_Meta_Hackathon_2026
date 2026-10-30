# TerraResponse AI — Three-Minute Demo Script

> **Gate**: rehearse the full flow and record approximate timestamps; no
> hidden manual steps or claims of real-world deployment. Use only
> truthful claims about capabilities demonstrated.

This script walks through the full demo flow with exact timestamps,
actual clicks, and truthful claims. The demo runs in **Demo Mode**
(`DEMO_MODE=1`) with **seeded data** from `scripts/seed-demo.ts`.
The seeded data includes 5 demo reports with precomputed mock AI
observations (model_id = `demo-mock-v1`, NOT `muse-spark-1.3` —
per the brief: "Precomputed mock outputs must never be falsely
labeled as live Meta inference").

A **backup demo** path is included at the end for when the live Meta
API is unavailable: the seeded data renders without a model call.

## Prerequisites

- The app is deployed (Vercel + Supabase per `docs/DEPLOYMENT.md`).
- `DEMO_MODE=1` is set on Vercel (the red "Demonstration Data"
  banner is visible on every page).
- The demo seed has been run: `bun run scripts/seed-demo.ts`
  (requires `DEMO_SEED_ADMIN_PASSWORD` to be set; the script refuses
  to use a default password and refuses to seed a non-local Supabase
  URL unless `ALLOW_DEMO_SEED_ON_PRODUCTION=1` is set).
- Sign in as `admin@terra.ai` / <password from DEMO_SEED_ADMIN_PASSWORD>.

## Demo flow (3:00 total)

### 0:00–0:20 — Real-world problem and decision-support disclaimer

**What to say:**
> "TerraResponse AI is a decision-support prototype for disaster
> response teams. It helps contributors upload photos of disaster
> scenes, uses AI to produce preliminary structured observations,
> and routes them through a human review queue before they appear
> on an incident map. The AI observations are **not verified findings**
> — a human reviewer must confirm, correct, or reject every
> observation before it's treated as actionable."

**What to show:**
1. The **red "Demonstration Data" banner** at the top of the page —
   point out that this is a seeded demo, not a live disaster.
2. The **amber "Decision-support prototype — human review required"**
   banner below it.

**Truthful claims:**
- "This is a prototype, not a deployed system."
- "The data shown is demonstration data seeded by a script."
- "Every AI observation requires human review."

### 0:20–0:50 — Photo upload + verified/manual location

**What to say:**
> "A contributor uploads a disaster photo. The server extracts EXIF
> GPS data if present. If GPS is available, the contributor confirms
> it. If not, they can place a manual pin on a map, or mark the
> location as unknown. The server validates coordinate bounds and
> stores the location source — GPS, manual, or unknown."

**What to click:**
1. Click **"Upload Photo"** in the sidebar nav.
2. Select a rights-cleared stock photo (from Pexels/Unsplash — do NOT
   use a real disaster photo).
3. Watch the upload progress bar.
4. After upload, the server returns the EXIF GPS (if present).
5. If GPS is present: click **"Confirm GPS location"**.
6. If GPS is absent: click the map to place a manual pin, OR click
   **"I don't know the location"** (unknown).

**Truthful claims:**
- "The server validates the file signature (magic bytes + Sharp
  decode) — the client MIME is never trusted."
- "EXIF GPS is extracted server-side via exifr."
- "The derivative (the image the AI sees) is EXIF-stripped via Sharp."
- "The original is stored in a private Supabase Storage bucket
  (never publicly accessible)."

### 0:50–1:25 — Real Muse Spark structured observations

**What to say:**
> "After upload, the server calls the Meta Muse Spark 1.3 vision
> model via the Chat Completions API with a JSON-schema-constrained
> response format. The model returns a structured observation:
> incident type, visible evidence, preliminary severity (1-5),
> uncertainties, English and Tagalog summaries. The observation is
> always labeled 'AI-generated, not verified' until a reviewer acts."

**What to click:**
1. Navigate to the **Dashboard** — the new report appears with status
   `needs_review`.
2. Click the report to open the **report detail page**.
3. The **Model & Schema Version** card shows:
   - Model: `muse-spark-1.3` (if the live API was used) OR
     `demo-mock-v1` (if the seeded mock was used — the badge says
     "DEMO MOCK — not live Meta inference").
   - Prompt version: `v1` / Schema version: `v1`.
4. The **AI observation** section shows:
   - Incident type (e.g., "flooding", "debris", "structural damage")
   - Visible evidence (array of factual observations)
   - Preliminary severity (1-5)
   - Uncertainties (what the model is unsure about)
   - English summary
   - Tagalog summary (draft translation)
5. The **"AI-generated, not verified"** disclaimer is visible.

**If using the live API** (MODEL_API_KEY is set):
- Truthful claim: "This is a real Meta Muse Spark 1.3 inference."
- The observation reflects the model's actual analysis of the image.

**If using the backup demo** (MODEL_API_KEY is NOT set):
- Truthful claim: "This is a precomputed mock observation from the
  seeded demo data. The model_id is `demo-mock-v1` — it's clearly
  labeled as a mock, not a live inference."
- Point out the red "DEMO MOCK" badge next to the model_id.
- The live API can be tested separately via the opt-in smoke test
  (`bun run test:smoke`).

### 1:25–1:45 — Optional SAM overlay

**What to say:**
> "SAM 3.1 is an optional secondary operation. A reviewer can request
> a segmentation mask for a specific target — for example,
> 'floodwater' or 'road debris'. The mask is overlaid on the image.
> Segmentation is opt-in; it never runs automatically. If SAM is
> unavailable, the rest of the report is fully usable."

**What to click:**
1. On the report detail page, scroll to the **Segmentation** section
   (below the evidence image).
2. If `SAM_API_KEY` is set: the "Generate mask" button is enabled.
   Click it. The request goes to the Meta Responses API with the
   image + a concrete noun phrase prompt.
3. If `SAM_API_KEY` is NOT set: the button shows "SAM not configured"
   and is disabled. Explain: "Segmentation requires a separate API
   key; it's opt-in. Without it, the report is fully usable."

**Truthful claims:**
- "SAM 3.1 uses the Meta Responses API with streaming."
- "The prompt must be a concrete noun phrase (not vague like
  'everything' or 'damage')."
- "If SAM fails or returns no match, the report is unaffected."

### 1:45–2:15 — Reviewer confirms/corrects data and audit trail

**What to say:**
> "A reviewer — someone with the reviewer or admin role, who is NOT
> the report's creator — opens the report and can confirm, correct,
  flag, or reject the AI observation. Every action is recorded in
  an append-only audit trail. Corrected fields are labeled as
  human-reported; the original model output is preserved."

**What to click:**
1. Sign out of the admin account. Sign in as
   `reviewer@terra.ai` / <password from DEMO_SEED_REVIEWER_PASSWORD>.
2. Navigate to the **Review Queue**.
3. Click a pending report to open the detail page.
4. The **Reviewer Action Panel** shows:
   - The AI observation (read-only, with "AI-generated, not verified"
     badge).
   - Action buttons: **Confirm/Correct**, **Request info**,
     **Reject**, **Flag**.
5. Click **Confirm/Correct**.
6. Edit the incident type or severity if needed. Enter a reason.
7. Click **Confirm**.
8. A toast notification appears: "Action 'confirm' applied successfully."
9. The report's status transitions to `reviewed` + `review_outcome:
   confirmed`.
10. The **Review History** section shows the audit trail: reviewer
    name, timestamp, action, before/after status + severity.

**Truthful claims:**
- "The contributor cannot review their own report."
- "Every review action is append-only (no UPDATE/DELETE for
  non-admins)."
- "The original model output is preserved; corrections are labeled
  as human-reported."

### 2:15–2:40 — Incident map, unlocated queue, provisional factor breakdown

**What to say:**
> "Reviewed + confirmed reports appear on the incident map with
  green circles. Pending-review reports appear as gray squares
  (NOT red — they're not confirmed emergencies). Reports with
  unknown locations never appear on the map; they appear in the
  Unlocated list only. The priority score is a transparent 5-factor
  calculation — visual severity, critical facility impact, access
  disruption, time recency, and independent corroboration."

**What to click:**
1. Navigate to the **Incident Map**.
2. The map shows pins for GPS/manual-location reports.
   - **Green circles** = confirmed (reviewer-verified).
   - **Gray squares** = pending review (NOT red — not confirmed).
   - **Amber circles** = flagged.
   - **Blue circles** = resolved.
3. The **legend** at the top explains each marker type.
4. The **AI disclaimer** says: "Pending-review markers (gray
   squares) are not confirmed emergencies."
5. Click a marker → the **side panel** shows:
   - Review status, location source, coordinates.
   - Provisional priority score (e.g., 62/100).
   - Incident category (from the AI observation).
   - "Open report detail" link.
6. Navigate to the **Dashboard**.
7. The stat cards show: Reports received, Awaiting review, Reviewed,
   Unlocated, AI analysis failed.
8. The **Unlocated** stat counts the unknown-location report (which
   is NOT on the map).
9. Click the report detail for the unknown-location report → the
   **Location Provenance** card shows the "Unknown" badge + the
   explanation: "No GPS or user chose not to share. Appears in the
   Unlocated list only — never on the map."
10. Click the **Priority** link on a report → the factor breakdown
    shows the 5 factors with points + status + explanation.

**Truthful claims:**
- "Reports with unknown locations never appear on the map."
- "Pending-review markers are gray squares, not red circles."
- "The priority score is labeled 'provisional review prioritization'
  (never 'real-world emergency severity')."
- "The score factors are deterministic and transparent."

### 2:40–3:00 — Safety/privacy and value proposition

**What to say:**
> "TerraResponse AI is built with fixed safety boundaries:
>   1. No automatic dispatch of emergency services — a human always
>      decides.
>   2. AI observations are always labeled 'AI-generated, not verified'
>      until a reviewer acts.
>   3. The priority score is provisional — it's for review
>      prioritization, not for triage or resource allocation.
>   4. Original evidence photos are in private storage — never
>      publicly accessible. The server mints 60-second signed URLs.
>   5. The retention workflow lets contributors or reviewers request
>      evidence deletion; the storage objects are purged after a
>      7-day window.
> The value proposition: a contributor uploads a photo, the AI
> produces a structured preliminary observation in seconds, a
> reviewer confirms or corrects it, and the confirmed incident
> appears on the map — all with a transparent audit trail and
> explainable priority factors."

**What to show:**
1. The **"AI-generated, not verified"** disclaimer on a report
   detail page.
2. The **location provenance badge** (GPS / Manual / Unknown).
3. The **private storage** note on the evidence card: "Original in
   private storage · derivative EXIF-stripped".
4. The **resilience panel** showing the safe-retry cap + the
   "Force manual review" button (no model call → no cost).

**Truthful claims:**
- "No API client for any dispatch system exists in the codebase."
- "Every AI observation is labeled preliminary."
- "The priority score is deterministic + transparent (5 factors,
  each with points + status + explanation)."
- "Evidence photos are in private Supabase Storage buckets; signed
  URLs expire in 60 seconds."

## Backup demo (when the live Meta API is unavailable)

If `MODEL_API_KEY` is not set (or the API is temporarily down):

1. The demo seed (`scripts/seed-demo.ts`) has already created 5
   reports with precomputed mock observations.
2. The 4 `needs_review` reports show the mock observation with
   `model_id = "demo-mock-v1"` and the red "DEMO MOCK — not live
   Meta inference" badge.
3. The 1 `retryable_error` report shows the Resilience Panel's
   "Re-analyze" button (returns 503 NOT_CONFIGURED — the UI
   surfaces the error inline) + the "Force manual review" button
   (admin-only; no model call).
4. The reviewer can still confirm/correct the mock observation —
   the review flow works identically with mock or live data.
5. The map + dashboard + priority factors all render normally.

**On-screen label**: The red "Demonstration Data" banner at the top
of every page makes it clear this is a demo, not a live deployment.

**No hidden manual steps**: the entire flow (upload → analyze →
review → map) can be demonstrated with the seeded data alone. The
only step that requires a live API key is uploading a NEW photo
(which triggers the real Muse Spark call). The seeded reports'
mock observations are sufficient for the review + map + priority
demonstration.

## Live API evidence (optional, recorded separately)

To test the live Meta Muse Spark API separately:

```bash
MODEL_API_KEY=<your-key> bun run test:smoke
```

This runs `src/lib/ai/muse-spark.smoke.test.ts` which calls the real
API with a synthesized 100×100 grey image and asserts the response
passes both validation layers. The test logs the observation + usage
metadata to stdout. Record the output in `docs/DEMO_MODE.md` §3.3.

To test the live SAM 3.1 API:

```bash
SAM_API_KEY=<your-key> bun run test:smoke
```

This runs `src/lib/ai/sam.smoke.test.ts` which calls the real
Responses API with a synthesized image + prompt.

## Timing summary

| Time | Section | Duration |
|---|---|---|
| 0:00–0:20 | Problem + disclaimer | 20s |
| 0:20–0:50 | Upload + location | 30s |
| 0:50–1:25 | AI structured observations | 35s |
| 1:25–1:45 | SAM overlay (optional) | 20s |
| 1:45–2:15 | Reviewer confirms + audit | 30s |
| 2:15–2:40 | Map + unlocated + factors | 25s |
| 2:40–3:00 | Safety/privacy + value | 20s |
| **Total** | | **3:00** |

## Rehearsal notes

- Practice the sign-out / sign-in switch (admin → reviewer) — it
  takes ~5 seconds. Have both accounts open in separate browser
  tabs if possible.
- If the live API is slow, the upload → analyze step may take 10-15
  seconds. Use the backup demo (seeded data) if the API is
  unavailable.
- The demo banner is always visible — point it out at the start so
  the audience knows this is a demo.
- The priority factor breakdown is on the report detail page (scroll
  down). Pre-navigate to it if you want to show it quickly.
