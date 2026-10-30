# WebP upload DB constraint compatibility

The Next.js upload route and Sharp pipeline accept JPEG, PNG and WebP evidence, but migration `0001_schema.sql` originally restricted `reports.image_mime_type` to JPEG/PNG. This makes a valid WebP upload fail at database INSERT after the image has been processed.

`0009_support_webp_report_uploads.sql` corrects the check to allow all three formats without modifying existing report data. Application clients can continue to validate image signatures independently of the file extension.

**Before deploying:** run the GitHub staging Supabase migration preview; inspect the report constraint and apply migrations on **staging only** after approval. Upload a legitimate WebP and confirm exactly one private report row exists, with no orphaned storage objects. Try an invalid file with a `.webp` extension and confirm server-side signature/decoder rejection.

Do not use `supabase db reset` or alter existing applied migration files to apply this fix.
