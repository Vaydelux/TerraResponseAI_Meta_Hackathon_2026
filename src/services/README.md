# src/services

Reserved for **service-layer modules** that wrap external integrations
(AI providers, object storage, email, etc.). The active auth, audit,
and database services live in `src/lib/` per the planning gate
(`docs/ARCHITECTURE.md` §2.3, `docs/DECISIONS.md` ADR-001). New
service modules added in later phases (e.g., `src/services/ai/` for
Muse Spark, `src/services/storage/` for S3) will live here when they
need to coordinate more than one external system; thin wrappers stay
in `src/lib/`.

## Planned (per `docs/BUILD_PLAN.md`)

- `src/services/ai/` — Phase 3. Wraps the configured vision model
  (Meta Muse Spark in production; `z-ai-web-dev-sdk` VLM in the
  sandbox). Server-only.
- `src/services/storage/` — Phase 2. Wraps image storage (local
  filesystem in the sandbox; S3 in production). Server-only.
- `src/services/review/` — Phase 4. Coordinates the reviewer-action
  transaction (`ReviewAction` + `Report.update` + `AuditLog.create`
  in one Prisma transaction).

This directory is intentionally empty in the scaffold.
