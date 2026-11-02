> [!WARNING]
> **SECURITY RELEASE BLOCKER — [Issue #21](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21).**
> Temporary test-account email confirmation exceptions must be removed before launch.
> Every new AI coding assistant should read [AGENTS.md](AGENTS.md) and ask the owner
> if confirmation, SMTP and demo-account cleanup have been completed.

<p align="center">
  <img src="public/brand/readme-banner.svg" width="100%" alt="TerraResponse AI — See the evidence. Share the signal." />
</p>

<h1 align="center">TerraResponse AI</h1>
<p align="center"><strong>See the evidence. Share the signal.</strong><br />
Community-powered disaster photo reporting, AI-assisted observations and human verification.</p>

<p align="center">
  <a href="docs/DESIGN.md">Design system</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/SECURITY.md">Safety and security</a> ·
  <a href="docs/DEPLOYMENT.md">Deployment guide</a>
</p>

> **Decision-support prototype — not an emergency alert or dispatch service.**
> AI classifications are provisional. A human review is required for a verified
> finding; an urgent review priority does not mean a public warning has been issued.

Built for the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon).

## A simpler way to report

People do **not** need to predict a disaster, create an event, or choose a
workspace to share relevant evidence. Event organization happens behind the
scenes; incident threads remain suggestions until reviewed.

```mermaid
flowchart LR
    A["📷 Send photo"] --> B["🔒 Private evidence"]
    B --> C["🤖 AI-assisted observation"]
    C --> D["🧭 Severity and location context"]
    D --> E["👥 Human review"]
    E --> F["🗺️ Verified incident awareness"]
    D -. "Priority only; not verified" .-> E
```

| Stage | What a person sees | What the system does |
| :-- | :-- | :-- |
| **Report** | Choose a photo, confirm or skip location, submit | Validates the file and saves private evidence |
| **Understand** | Track preliminary analysis and report status | Extracts safe derivatives and validates AI observations |
| **Verify** | Reviewer decision and provenance | Preserves uncertainty; authorized reviewers confirm, correct or reject |
| **Organize** | Incident threads and context map | Suggests related observations without silently merging evidence |

### Who can do what

| Role | Main experience |
| :-- | :-- |
| **Reporter** | Submit a photo with no event setup; track their authorized reports |
| **Reviewer** | See authorized review queues, check evidence and record decisions |
| **Administrator** | Reviewer capabilities plus role oversight, audit tools and privileged controls where enabled |

The platform never automatically dispatches emergency services, and it does not
treat model-generated severity as human-confirmed evidence.

### Brand and UI

The mark combines a **terrain peak**, a **shared observation horizon** and
**broadcast arcs**. It is deliberately calm, recognizable at favicon sizes,
and independent from report-verification symbols.

- **Day** — cool survey-paper surfaces and dark ink.
- **Mist** — a softer light palette designed for long reading sessions.
- **Night Ops** — dark field-operations palette with readable bright controls.
- **Auto** — follows the device color preference.

The vector icon (`public/logo.svg` and `src/app/icon.svg`) is infinitely
scalable, including 8K exports. The committed multi-resolution
`src/app/favicon.ico` contains practical browser sizes (16–256 px), not
a misleading 8192-pixel ICO. Typography uses **Bricolage Grotesque** for
headings and **Public Sans** for readable UI text. See
[the design guide](docs/DESIGN.md) for color contrast, tokens, responsive
behavior and accessible motion.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│  Next.js App Router · React 19 · Tailwind · MapLibre │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS (cookies)
┌──────────────────────────▼──────────────────────────┐
│              Next.js 16 Server (Node.js)              │
│  Middleware (auth refresh) · Server Components        │
│  Route Handlers (API) · Server Actions (auth)        │
│  Sharp (image processing) · exifr (EXIF)             │
└──────┬─────────────┬──────────────┬───────────────────┘
       │             │              │
       ▼             ▼              ▼
┌──────────┐ ┌────────────┐ ┌────────────────┐
│ Supabase │ │ Meta API   │ │ Supabase       │
│ Auth     │ │ v1/chat/   │ │ Storage        │
│ (JWT)    │ │ completions│ │ (private       │
│          │ │ v1/responses│ │ buckets)       │
│ Postgres │ │            │ │                │
│ + RLS    │ │ Muse Spark │ │ Originals      │
│          │ │ 1.3        │ │ Derivatives    │
│ RLS data  │ │ SAM 3.1    │ │ Thumbnails     │
└──────────┘ └────────────┘ └────────────────┘
```

### Sequence: upload → analyze → review → map

```
Contributor                Server                 Muse Spark    Supabase
    │                         │                       │           │
    │── upload photo ────────►│                       │           │
    │                         │── validate file ──────►│           │
    │                         │── extract EXIF ───────►│           │
    │                         │── store private ──────►│           │
    │                         │── insert report ─────►│           │
    │                         │── chat/completions ──►│           │
    │                         │◄── structured JSON ───│           │
    │                         │── Zod validate ──────►│           │
    │                         │── insert analysis ───►│           │
    │◄── needs_review ───────│                       │           │
    │                         │                       │           │
    │                    Reviewer                     │           │
    │                         │── confirm/correct ───►│           │
    │                         │── insert review_act ─►│           │
    │                         │── update status ─────►│           │
    │◄── reviewed ────────────│                       │           │
    │                         │                       │           │
    │── view map ────────────►│                       │           │
    │◄── confirmed pins ─────│                       │           │
```

## Meta model integration

| Model | API endpoint | Why it's meaningful |
|---|---|---|
| **Muse Spark 1.3** (`muse-spark-1.3`) | `POST /v1/chat/completions` | Vision-language model that produces structured observations (incident type, severity, evidence, uncertainties, summaries) from disaster photos. Uses JSON-schema-constrained decoding (`response_format: { type: "json_schema", strict: true }`) for guaranteed-valid structured output. A second Zod validation layer catches any schema drift. |
| **SAM 3.1** (`sam-3.1`) | `POST /v1/responses` | Media segmentation model that produces pixel-accurate masks for a concrete target (e.g., "floodwater"). Uses the Responses API with streaming (`stream: true`). Opt-in — never runs automatically. If unavailable, the rest of the report is fully usable. |

Both models use the Meta Model API at `https://api.meta.ai/v1` with Bearer token auth.

## Setup

```bash
# 1. Clone + install
git clone https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026.git
cd TerraResponseAI_Meta_Hackathon_2026
bun install --frozen-lockfile

# 2. Local configuration (do not commit credentials)
cp .env.example .env
# Fill in the matching Supabase project URL, anon key and server-only
# service-role key. MODEL_API_KEY is needed for real Muse Spark inference.

# 3. Run locally
bun run dev    # http://localhost:3000

# 4. Verification
bun run lint && bun run typecheck && bun run test && bun run build
```

**Database migration safety:** The existing production and staging projects have different migration histories. Do not run `supabase db push` against either without reconciling the remote migration ledger and verifying the target. Staging has source migrations 0001–0012 installed, including the reviewer RPC. The connector-generated remote migration versions still differ from the repository's four-digit names. Only the protected staging workflows create an ephemeral timestamp-aligned CLI workspace for safe staging previews/applications; never run a blind `db push` from the repository root. Distinct-role end-to-end tests remain outstanding. See [staging issue #30](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/30) and [the staging verification guide](docs/LIVE_STAGING_VERIFICATION.md).

See `docs/DEPLOYMENT.md` for the full Vercel + Supabase deployment guide, and [the hackathon submission kit](docs/HACKATHON_SUBMISSION_2026.md) for an evidence-based three-minute demo and release criteria.

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Server-only? | Default | Purpose |
|---|---|---|---|
| `MODEL_API_KEY` | ✅ | (empty) | Meta Model API key |
| `SAM_API_KEY` | ✅ | (empty) | SAM 3.1 API key (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | (empty) | Bypasses RLS — server only |
| `NEXT_PUBLIC_SUPABASE_URL` | ❌ | (empty) | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ❌ | (empty) | Supabase anon key (public; RLS is the boundary) |
| `DEMO_MODE` | ✅ | (unset) | `1` = show "Demonstration Data" banner |

## Tests

```bash
bun run test          # Vitest unit + mocked integration tests
bun run test:e2e      # Playwright browser tests (requires the proper test environment)
bun run test:smoke    # Opt-in: paid/real Meta model API smoke tests (requires keys)
bun run typecheck     # TypeScript strict typecheck
bun run lint          # ESLint
bun run build         # Production build
```

## Safety limitations (fixed boundaries)

1. **No automatic dispatch** — no API client for any emergency service exists in the codebase.
2. **AI observations always labeled "AI-generated, not verified"** until a reviewer acts.
3. **Priority score is "provisional review prioritization"** — not for triage or resource allocation.
4. **No self-signup for reviewer/admin** — the first admin is bootstrapped via a server-side script.
5. **Evidence photos in private storage** — 60-second signed URLs, never publicly accessible.
6. **Retention workflow** — contributors/reviewers can request evidence deletion; storage purged after 7 days.
7. **Prompt-injection defenses** — user text never reaches the model; input is sanitized before storage.
8. **Bounded API spend** — per-user, per-event, and daily ceilings prevent runaway costs.

## Demo data

The demo seed (`scripts/seed-demo.ts`) creates 5 rights-cleared demo reports with precomputed mock observations (`model_id = "demo-mock-v1"`, NOT `muse-spark-1.3`). When `DEMO_MODE=1`, a red "Demonstration Data" banner is visible on every page. The mock observations are clearly labeled — they are never falsely presented as live Meta inference.

See `docs/DEMO_SCRIPT.md` for the 3-minute demo script and `docs/DEMO_MODE.md` for the demo data details.

## License

This project's owned code is released under the MIT License — see `LICENSE`.

## Contributors

- **TerraResponse Team** — built during the Meta Global AI Developer Hackathon

> Update this section with individual contributor names before the public repo push.

## Documentation

- `docs/DESIGN.md` — brand consistency, Day/Mist/Night Ops tokens, responsive UI and contrast rules

- `docs/DEPLOYMENT.md` — Vercel + Supabase deployment guide
- `docs/DEMO_SCRIPT.md` — 3-minute demo script with timestamps
- `docs/DEMO_MODE.md` — demo data + live API evidence
- `docs/SECURITY.md` — security boundaries + RLS policies
- `docs/ARCHITECTURE.md` — system architecture + DB schema
- `docs/BUILD_PLAN.md` — phase-by-phase implementation plan
- `docs/PRODUCT_SCOPE.md` — scope + fixed safety boundaries
- `docs/DECISIONS.md` — architecture decision records
- `tests/TEST_COVERAGE.md` — test inventory + known limitations
