> [!WARNING]
> **SECURITY RELEASE BLOCKER — [Issue #21](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21).**
> Temporary test-account email confirmation exceptions must be removed before launch.
> Every new AI coding assistant should read [AGENTS.md](AGENTS.md) and ask the owner
> if confirmation, SMTP and demo-account cleanup have been completed.

# TerraResponse AI

**Disaster-photo intelligence with human review — a decision-support prototype for emergency response teams.**

> ⚠️ **This is a prototype, not a deployed system.** Every AI observation is labeled
> "AI-generated, not verified" until a human reviewer confirms, corrects, or rejects it.
> The platform never automatically dispatches emergency services.

Built for the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon).

## What it does

Authenticated contributors upload disaster photos. The server:
1. Validates the file (magic bytes + Sharp decode — client MIME never trusted).
2. Extracts EXIF GPS + creates an EXIF-stripped derivative for AI inference.
3. Calls **Meta Muse Spark 1.3** via the Chat Completions API with a JSON-schema-constrained response.
4. Validates the structured output against a second Zod layer.
5. Routes the report through a human review queue.
6. A reviewer (who is NOT the contributor) confirms, corrects, or rejects the observation.
7. Confirmed incidents appear on the incident map with a transparent 5-factor priority score.

Optional: a reviewer can request a **SAM 3.1** segmentation mask via the Responses API for a specific target (e.g., "floodwater", "road debris").

## Users

| Role | What they can do |
|---|---|
| **Contributor** | Upload photos, confirm location, view own reports |
| **Reviewer** | Review AI observations, confirm/correct/flag/reject, view all reports in their events |
| **Admin** | Everything + manage events, view audit log, purge evidence, override priority |

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
│ 11 tables│ │ SAM 3.1    │ │ Thumbnails     │
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
git clone <repo-url>
cd terraresponse-ai
bun install

# 2. Environment
cp .env.example .env
# Fill in: NEXTAUTH_SECRET (openssl rand -base64 32), Supabase keys, MODEL_API_KEY

# 3. Database migrations (requires Supabase CLI)
supabase link --project-ref <your-ref>
supabase db push

# 4. Seed demo data (creates 5 demo reports + 2 events + 2 users)
bun run scripts/seed-demo.ts

# 5. Run
bun run dev    # http://localhost:3000
```

See `docs/DEPLOYMENT.md` for the full Vercel + Supabase deployment guide.

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Server-only? | Default | Purpose |
|---|---|---|---|
| `MODEL_API_KEY` | ✅ | (empty) | Meta Model API key |
| `SAM_API_KEY` | ✅ | (empty) | SAM 3.1 API key (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | (empty) | Bypasses RLS — server only |
| `NEXTAUTH_SECRET` | ✅ | (empty) | Signs JWT session cookies |
| `NEXT_PUBLIC_SUPABASE_URL` | ❌ | (empty) | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ❌ | (empty) | Supabase anon key (public; RLS is the boundary) |
| `DEMO_MODE` | ✅ | (unset) | `1` = show "Demonstration Data" banner |

## Tests

```bash
bun run test          # 369 Vitest unit + integration tests
bun run test:e2e      # 86 Playwright E2E tests (desktop + mobile)
bun run test:smoke    # Opt-in live Meta API smoke tests (requires keys)
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

- `docs/DEPLOYMENT.md` — Vercel + Supabase deployment guide
- `docs/DEMO_SCRIPT.md` — 3-minute demo script with timestamps
- `docs/DEMO_MODE.md` — demo data + live API evidence
- `docs/SECURITY.md` — security boundaries + RLS policies
- `docs/ARCHITECTURE.md` — system architecture + DB schema
- `docs/BUILD_PLAN.md` — phase-by-phase implementation plan
- `docs/PRODUCT_SCOPE.md` — scope + fixed safety boundaries
- `docs/DECISIONS.md` — architecture decision records
- `tests/TEST_COVERAGE.md` — test inventory + known limitations
