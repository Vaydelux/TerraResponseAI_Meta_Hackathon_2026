# Integration locations

Active server integrations live in `src/lib/`:

- `src/lib/ai/muse-spark.ts`: Meta photo observations.
- `src/lib/ai/sam.ts` and `sam-protocol.ts`: optional Meta segmentation and mask validation.
- `src/lib/ai/contextual-intelligence.ts`: optional Gemini contextual search.
- `src/lib/supabase/`: Supabase clients for authentication, database and storage access.

API orchestration lives in `src/app/api/`. Database schema and authorization changes live in `supabase/migrations/`. The earlier Prisma/SQLite, local-upload and S3 service plan is historical; it does not describe the current runtime.
