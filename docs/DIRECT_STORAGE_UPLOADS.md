# Direct Storage Uploads

The hackathon upload flow can use `NEXT_PUBLIC_DIRECT_STORAGE_UPLOADS=true` to avoid sending image bytes through the Next.js multipart route.

1. The authenticated browser requests `POST /api/reports/upload-session`.
2. The server checks the current user, intake membership, and upload rate limit, then returns a 15-minute HMAC-bound grant for one `event_id/report_id.jpg` object in the private `evidence-originals` bucket.
3. The browser uploads the client-compressed JPEG directly with the public Supabase client. The service-role key is never sent to the browser.
4. The browser calls `POST /api/reports/finalize` with the grant and metadata. The server revalidates the user and grant, downloads the private object, validates its magic bytes and decode, computes the digest, creates EXIF-stripped derivatives, and inserts the existing `reports` row shape.
5. The existing idempotent analysis endpoint remains the post-save AI handoff. The UI starts it only after finalization succeeds.

The original multipart `/api/reports` route remains available as a rollout fallback when the flag is false. Do not expose the originals bucket publicly or put the service-role key in any `NEXT_PUBLIC_` variable. The direct path does not trust the browser MIME type, metadata, hash, location, or report ID.
