# Asynchronous report analysis pipeline

The repository contains a deployment-ready dispatcher at
`supabase/functions/report-analysis-dispatch`.

1. An authenticated upload creates a `public.reports` row and private Storage
   objects.
2. A Supabase Database Webhook sends the `INSERT` record to the Edge Function.
3. The Edge Function validates the webhook secret, validates the report and
   creator UUIDs, signs a short-lived internal request, and calls the existing
   idempotent `/api/reports/[id]/analyze` route.
4. The Next.js route validates the HMAC binding to both report ID and creator
   ID, reads the private derivative, and runs the existing bounded Meta Vision
   analysis, schema validation, telemetry, and human-review transition.

The browser cannot use the internal path. The internal signature is separate
from the Supabase service-role key and is never exposed in a `NEXT_PUBLIC_`
variable. The analysis route remains idempotent, so webhook retries do not
create duplicate model work after an analysis is persisted.

Required private configuration:

- `DATABASE_WEBHOOK_SECRET`: Edge Function only; also configured on the
  Database Webhook.
- `ANALYSIS_WEBHOOK_SECRET`: same private value in the Edge Function and the
  Vercel server environment; at least 32 characters.
- `APP_ANALYSIS_URL`: Edge Function only; the canonical Vercel origin.

Deployment and Database Webhook creation remain owner-approved release
operations. Do not commit these secrets or weaken JWT/RLS protections to make
dispatch work.
