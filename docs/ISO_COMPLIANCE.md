# ISO Compliance Reference — TerraResponse AI

**Last updated:** 2026-10-29  
**Purpose:** Maps the TerraResponse AI implementation to relevant ISO standards for data security, software quality, lifecycle process, and web engineering.

---

## 1. ISO/IEC 27001 — Information Security Management

**Scope:** Regulates how the organization and infrastructure manage data security, risk assessment, and threat mitigation.

### Compliance mapping

| Control area | Implementation | Evidence |
|---|---|---|
| **Access control** | Supabase Auth (email + password) with server-side identity verification via `supabase.auth.getUser()`. JWT signature verified, not cookie presence alone. RLS on all 11 public tables enforces row-level access. | `src/lib/supabase/server.ts` (`requireServerUser`); `supabase/migrations/0002_rls.sql` (8 RLS-enabled tables + 3 in 0004); 34 authz tests |
| **Credential management** | All secrets (`MODEL_API_KEY`, `SAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-only, never prefixed with `NEXT_PUBLIC_`. `.env` is gitignored. `.env.example` contains empty values only. | `src/lib/secrets-server-only.test.ts` (8 tests scanning ALL source files); `.gitignore` (`.env*` + `!.env.example`) |
| **Cryptography** | bcrypt cost-10 for password hashing. SHA-256 for image dedup. Supabase JWT signing. 60-second signed URLs for evidence access. | `scripts/bootstrap-admin.ts`; `src/lib/storage/sha256.ts`; `src/app/api/reports/[id]/evidence/route.ts` |
| **Incident management** | Append-only audit log (`audit_events` table) records LOGIN, AUTH_FAILED, UPLOAD, ANALYZE, REVIEW, PERMISSION_DENIED, STATUS_CHANGE, DELETE, REGISTER, PRIORITY_OVERRIDE. | `supabase/migrations/0001_schema.sql` (§8); `supabase/migrations/0002_rls.sql` (write_audit_event SECURITY DEFINER) |
| **Threat mitigation** | Prompt-injection sanitization on user captions. Rate limits (per-user upload, per-user AI, per-event budget, signed-URL, daily spend, daily requests). Bounded retries. 30s model call timeout. | `src/lib/ai/prompt-injection.ts` (14 tests); `src/lib/rate-limit.ts` (24 tests); `src/lib/ai/cost-controls.ts` (12 tests); `src/lib/ai/retry.ts` (8 tests) |
| **Secure development** | No `console.log` with sensitive data in source. No hardcoded credentials. No tracked secrets. | Verified by `secrets-server-only.test.ts`; git history audit in Phase 17 |

### Gaps / notes

- **Formal ISMS certification** is an organizational process, not a software deliverable. The implementation follows 27001 principles but is not formally certified.
- **Penetration testing** has not been conducted. The RLS policies have negative tests in `supabase/tests/test_rls.sql` but no external pentest.

---

## 2. ISO/IEC 27701 — Privacy Information Management

**Scope:** Extends 27001 to handle Personally Identifiable Information (PII), aligning with GDPR.

### Compliance mapping

| Control area | Implementation | Evidence |
|---|---|---|
| **PII minimization** | Reports store title + description (sanitized for prompt injection), location source (gps/manual/unknown), and image hashes. No names, phone numbers, or identity fields beyond the contributor's user ID. | `supabase/migrations/0001_schema.sql` (reports table); `src/lib/ai/prompt-injection.ts` |
| **Data retention** | Active → soft_deleted → purged lifecycle. 7-day retention window (configurable via `RETENTION_WINDOW_DAYS`). Admin-only purge. Signed URLs refused after soft-delete. | `src/lib/storage/retention.ts` (23 tests); `supabase/migrations/0004_resilience.sql` (report_retention table) |
| **Right to erasure** | Contributors and reviewers can request evidence deletion. Storage objects are purged (original first, then derivative, then thumbnail). Reports row is preserved for audit trail with blanked storage keys. | `src/app/api/reports/[id]/retention/route.ts` (GET/POST/DELETE) |
| **Data portability** | All data is in standard PostgreSQL tables (Supabase). Reports can be exported via the API (`GET /api/reports`). | `src/app/api/reports/route.ts` |
| **Privacy by design** | Private storage buckets (public=false). EXIF stripped from derivatives. Original photos never publicly accessible. Unknown-location reports never appear on the map. | `supabase/migrations/0003_storage.sql`; `src/lib/storage/derivative.ts` (8 tests); `src/lib/storage/missing-location.ts` (15 tests) |
| **Consent** | Contributors explicitly confirm location (GPS, manual, or unknown). No automatic location inference from AI captions. | `src/lib/storage/missing-location.ts` (`resolveLocation` — user choice wins) |

### Gaps / notes

- **GDPR DSR (Data Subject Request) workflow** is not automated beyond the retention endpoint. A formal DSR process would require additional tooling.
- **Data Processing Agreement (DPA)** with Supabase/Meta would be needed for production GDPR compliance — this is a legal, not a software, deliverable.

---

## 3. ISO/IEC 25010 — System and Software Quality (SQuaRE)

**Scope:** Defines 8 product quality characteristics. Each is evaluated below.

### 3.1 Functional Suitability

**Does the software do what it is supposed to do?**

| Capability | Status | Evidence |
|---|---|---|
| Authenticated upload with file validation | ✅ Implemented | 21 image-validate tests; Sharp decode + magic-bytes check |
| EXIF GPS extraction + manual pin + unknown location | ✅ Implemented | 6 exif tests; 15 missing-location tests |
| Meta Muse Spark structured observation | ✅ Implemented | 12 muse-spark tests; Zod validation; `/v1/chat/completions` |
| SAM 3.1 segmentation overlay | ✅ Implemented | 14 sam tests; `/v1/responses` streaming |
| Human review (confirm/correct/flag/reject) | ✅ Implemented | 14 authz-rules tests; 20 escalation tests |
| Priority scoring (5-factor, 0-100) | ✅ Implemented | 27 priority tests |
| Incident map with filters | ✅ Implemented | 16 location tests; MapLibre GL JS |
| PostGIS nearby + viewport queries | ✅ Implemented | 6 nearby integration tests; 0005_postgis.sql migration |
| Demo mode with seeded data | ✅ Implemented | 7 demo-mode tests; `scripts/seed-demo.ts` |

### 3.2 Performance Efficiency

**Time behavior, resource utilization, capacity.**

| Aspect | Implementation | Evidence |
|---|---|---|
| API response time | Model call timeout 30s; bounded retries (4 max); AbortController on all client fetches | `src/lib/ai/cost-controls.ts`; `src/lib/ai/retry.ts` |
| Resource utilization | GiST spatial index for PostGIS queries; partial index (WHERE geo IS NOT NULL); per-event budget limits AI spend | `supabase/migrations/0005_postgis.sql` (idx_reports_geo_gist); `AI_PER_EVENT_BUDGET=500` |
| Capacity | Daily spend ceiling $50; daily request ceiling 1000; per-user AI 30/hr; per-user uploads 20/hr | `src/lib/ai/cost-controls.ts` (12 tests); `src/lib/rate-limit.ts` (24 tests) |
| Frontend performance | Shimmer skeletons (not spinners) for perceived performance; debounced map fetches; AbortController for stale requests | `src/components/terra/states.tsx`; `src/components/views/map-view.tsx` |
| Build optimization | `output: "standalone"` for minimal server bundle; Next.js 16 Turbopack | `next.config.ts` |

### 3.3 Compatibility

**Co-existence and interoperability.**

| Aspect | Implementation |
|---|---|
| Browser compatibility | React 19 + Next.js 16 (standards-based); Tailwind CSS 4; no IE 11 support needed |
| API compatibility | OpenAI-compatible Chat Completions API for Muse Spark; Responses API for SAM 3.1; Supabase REST API |
| Database compatibility | PostgreSQL 15+ (Supabase); PostGIS extension; standard SQL migrations |
| Deployment compatibility | Vercel (primary); self-hosted Linux (documented alternative); Docker-compatible |

### 3.4 Usability

**Learnability, user error protection, aesthetics.**

| Aspect | Implementation | Evidence |
|---|---|---|
| Learnability | Role-aware navigation; labeled placeholders; ViewHeading + PhaseBadge on every view | `src/components/terra/nav-list.tsx`; `src/components/terra/phase-badge.tsx` |
| User error protection | Zod validation on all inputs; file magic-bytes check; coordinate bounds validation; duplicate detection (SHA-256) | `src/lib/api-schemas/reports.ts`; `src/lib/storage/image-validate.ts`; `src/lib/storage/missing-location.ts` |
| Aesthetics | shadcn/ui (New York) design system; Lucide icons; light/dark theme; smooth transitions | `src/app/globals.css`; `src/components/terra/providers.tsx` |
| Accessibility | WCAG 2.1 AA reference; skip-to-content; focus-visible; reduced motion; aria-labels; touch targets | `docs/ACCESSIBILITY.md` (213 lines, 16 entries) |

### 3.5 Reliability

**Fault tolerance, maturity, recoverability.**

| Aspect | Implementation | Evidence |
|---|---|---|
| Fault tolerance | Fail-open rate limits (DB errors don't block uploads); dedup cache miss falls through to model call; SAM failure doesn't break the report | `src/lib/rate-limit.ts` (fail-open documented); `src/lib/ai/dedup-cache.ts` (9 tests) |
| Error recovery | Retryable error state with backoff; safe-retry cap (5 manual, 4 automated); Force-manual-review button; Resilience Panel | `src/lib/ai/safe-retry.ts` (17 tests); `src/components/terra/resilience-panel.tsx` |
| Data recovery | Storage rollback on insert failure; retention workflow preserves audit trail; migration rollback scripts | `src/lib/storage/private-store.ts` (deleteEvidence rollback); `supabase/migrations/0005_postgis_rollback.sql` |
| Graceful degradation | App runs without MODEL_API_KEY (503 NOT_CONFIGURED); demo seed works without live API; unknown-location reports stay in the list | `docs/DEMO_SCRIPT.md` (backup demo section) |

### 3.6 Security

**Confidentiality, integrity, accountability.**

| Aspect | Implementation | Evidence |
|---|---|---|
| Confidentiality | RLS on all tables; private storage buckets; 60s signed URLs; prompt-injection sanitization; secrets server-only | 8 RLS policies + 3 Phase 12 policies; 8 secrets-server-only tests; 14 prompt-injection tests |
| Integrity | SHA-256 image dedup; Zod schema validation (2-layer); reviewer corrections preserve original (`_original_model_output`); append-only audit log | `src/lib/storage/sha256.ts` (9 tests); `src/lib/ai/muse-spark.ts` (12 tests) |
| Accountability | Audit log records every security-relevant action with actor ID, IP (leftmost from x-forwarded-for), user agent, timestamp | `supabase/migrations/0001_schema.sql` (audit_events); write_audit_event SECURITY DEFINER |

### 3.7 Maintainability

**Modularity, reusability, modifiability, testability.**

| Aspect | Implementation | Evidence |
|---|---|---|
| Modularity | Pure functions for authz rules, priority scoring, cost controls, prompt injection, missing-location resolution — no I/O dependencies | `src/lib/authz-rules.ts`; `src/lib/priority.ts`; `src/lib/ai/cost-controls.ts` |
| Reusability | Shared states component (Skeleton, EmptyState, ErrorState, SkeletonRow); shared demo-banner, prototype-banner | `src/components/terra/states.tsx` |
| Modifiability | Env-var-driven configuration (11 cost-control vars, 2 retention vars, 4 demo-seed vars); no hardcoded values for limits or model IDs | `src/lib/ai/cost-controls.ts` (readCostControlConfig) |
| Testability | 368 unit + integration tests + 86 E2E tests; mocked transport for AI calls; vi.mock for Supabase; mocked RPC for PostGIS | 30 test files; `tests/TEST_COVERAGE.md` |

### 3.8 Portability

**Adaptability, installability, replaceability.**

| Aspect | Implementation |
|---|---|
| Adaptability | Supabase (cloud) or self-hosted Postgres + MinIO (documented); Vercel or self-hosted Node (documented) |
| Installability | `bun install` + `supabase db push` + `bun run scripts/seed-demo.ts` |
| Replaceability | No vendor lock-in for AI (OpenAI-compatible API → any OpenAI-compatible provider); standard SQL migrations (portable to any Postgres) |

---

## 4. ISO/IEC 12207 — Software Lifecycle Processes

**Scope:** Common framework for software lifecycle processes.

| Process | Implementation |
|---|---|
| **Acquisition** | Open-source dependencies via `bun install`; Meta Model API via `MODEL_API_KEY` |
| **Supply** | MIT License (owned code); npm packages retain their own licenses |
| **Development** | 17 phases (Phase 1–17) documented in `worklog.md` (5500+ lines); each phase inspected existing code before modifying |
| **Operation** | `bun run dev` (development); Vercel auto-deploy from GitHub (production); `docs/DEPLOYMENT.md` |
| **Maintenance** | Migration system (0001–0005 + rollbacks); versioned SQL; env-var-driven config; `docs/SECURITY.md` |

---

## 5. ISO 9001 — Quality Management Systems

**Scope:** Consistent, documented workflows for product quality.

| Aspect | Implementation |
|---|---|
| **Documented procedures** | 10 docs: PRODUCT_SCOPE, ARCHITECTURE, SECURITY, BUILD_PLAN, DECISIONS, DEPLOYMENT, DEMO_SCRIPT, DEMO_MODE, SUBMISSION_CHECKLIST, ACCESSIBILITY |
| **Consistent output** | Every phase followed the same pattern: implement → run lint/typecheck/test/build → report results → append worklog |
| **Nonconformance management** | Phase review checkpoint prompt (run after every phase): inspect changes, fix defects, run tests, report pass/fail |
| **Continuous improvement** | 16 phase reviews identified and fixed issues (security, bugs, missing tests, dead code) |

---

## 6. ISO/IEC 23026 — Web Engineering

**Scope:** Engineering practices for managing, releasing, and maintaining website operations.

| Aspect | Implementation |
|---|---|
| **System management** | Supabase dashboard for DB/auth/storage; Vercel dashboard for deployment; env-var-driven config |
| **Release management** | Git-based versioning; Vercel auto-deploy on push; rollback via Vercel "Promote to Production" |
| **Usability management** | WCAG 2.1 AA reference document (`docs/ACCESSIBILITY.md`); Playwright E2E tests for desktop + mobile; keyboard navigation tests |
| **Content management** | Demo seed script (`scripts/seed-demo.ts`) for test data; DEMO_MODE banner for clear labeling |

---

## Summary

| ISO standard | Coverage | Formal certification |
|---|---|---|
| ISO/IEC 27001 (Security) | ✅ Implemented (access control, credentials, crypto, audit, threat mitigation) | ⏳ Not formally certified (organizational process) |
| ISO/IEC 27701 (Privacy) | ✅ Implemented (PII minimization, retention, erasure, privacy by design) | ⏳ Not formally certified (requires DPA) |
| ISO/IEC 25010 (Quality) | ✅ All 8 characteristics addressed | N/A (product quality model, not a certification) |
| ISO/IEC 12207 (Lifecycle) | ✅ 17 phases documented; each phase inspected existing code | N/A (process framework, not a certification) |
| ISO 9001 (QMS) | ✅ Documented procedures; consistent output; review checkpoints | ⏳ Not formally certified (organizational process) |
| ISO/IEC 23026 (Web Engineering) | ✅ System management, release management, usability, content | N/A (engineering practice guide) |

> **Note:** ISO 27001, 27701, and 9001 are organizational certifications, not software deliverables. The TerraResponse AI implementation follows the principles of each standard but formal certification requires an organizational audit process that is outside the scope of a hackathon project.
