# Privacy-safe demonstration fixtures

This directory holds the test fixtures for TerraResponse AI. The
brief: "Use privacy-safe demonstration fixtures; public repository
must contain no personally identifying incident imagery or sensitive
precise locations."

## What's NOT in this repo (and never will be)

1. **No real disaster photos.** No images of real people, real
   homes, real vehicles, or real identifying features from any
   incident.
2. **No precise GPS coordinates from real incidents.** Demo
   fixtures use rounded or synthetic coordinates (e.g.,
   `35.5, -82.5` for "Asheville" — the city center, not a
   specific address).
3. **No personally identifying text.** Demo titles and descriptions
   are generic ("Flooding on Main Street") — no names, no phone
   numbers, no addresses, no license plates.
4. **No real EXIF metadata.** Any EXIF in the fixture images is
   either stripped or synthetic (see `tests/fixtures/images/`
   below).

## What IS in this repo (privacy-safe demo data)

### `tests/fixtures/` (when added)

Per `docs/BUILD_PLAN.md` §5, the demo fixtures are:

| Fixture | Source | Privacy |
|---|---|---|
| Demo users (3) | `scripts/seed.ts` | `reporter@terra.ai`, `reviewer@terra.ai`, `admin@terra.ai` — clearly demo emails on a demo domain. |
| Demo events (2) | `scripts/seed-events.ts` | "Demo Hurricane Helene — Asheville", "Demo LA Wildfires — Pacific Palisades" — uses the event NAMES (public record) but the location coords are rounded to the city center (not a specific address). |
| Sample images (5) | `tests/fixtures/images/` (when added) | Public-domain disaster stock photos OR images generated via the `image-generation` skill. NEVER sourced from a real disaster report. |
| Image with no EXIF | `tests/fixtures/images/no_exif.jpg` | Tests the "manual pin" branch. |
| Image too large | `tests/fixtures/images/too_large.jpg` | Synthetic 11 MB file generated in test setup. |
| Mock AI responses | `tests/fixtures/ai-responses/` | Hand-written JSON files committed to the repo. |

### The fixture-image sourcing rule (for whoever adds the images later)

1. **Prefer public-domain stock photos** (e.g., from Pexels, Unsplash,
   Wikimedia Commons) of generic flooding / wildfire / structural
   damage scenes. Use the `image-search` skill to find them.
2. **If no suitable public-domain image is available, generate one**
   with the `image-generation` skill. Generated images carry no
   real-world PII.
3. **NEVER source a fixture image from a real disaster report.** Even
   if the source is "publicly available," the brief says no PII
   imagery in the repo.
4. **Strip EXIF from the committed fixture image** before commit:
   ```bash
   exiftool -all= tests/fixtures/images/flood.jpg
   ```
   The route handler's `makeDerivatives` strips EXIF at runtime;
   the fixture should also have no EXIF at rest so the test isn't
   relying on the runtime strip.
5. **For the "image with EXIF" fixture (the test that EXIF GPS is
   read)**, use a SYNTHETIC EXIF payload (set with `exiftool`):
   ```bash
   exiftool -GPSLatitude=35.5 -GPSLatitudeRef=N \
            -GPSLongitude=-82.5 -GPSLongitudeRef=W \
            -DateTimeOriginal="2024:09:27 14:30:00" \
            tests/fixtures/images/with_exif.jpg
   ```
   Use rounded city-center coords (not a specific address).

## Verification (Phase 12 added)

The Phase 12 review verifies:

1. `find . -name "*.jpg" -o -name "*.png"` returns no images under
   `src/`, `docs/`, or `tests/` that aren't in `tests/fixtures/` (and
   `tests/fixtures/` is empty in the current commit — no fixture
   images have been added yet).
2. `rg "passport|ssn|driver'?s license|phone number"` returns only
   `docs/SECURITY.md` (the section discussing what NOT to do).
3. `rg "@gmail|@yahoo|@example\.com"` returns only demo placeholder
   text in the login form + the demo emails (`@terra.ai`) in the
   seed/test code.
4. `rg -n "[0-9]{1,3}\.[0-9]{3,}, *-?[0-9]{1,3}\.[0-9]{3,}"` (the
   pattern for precise GPS coordinates) returns nothing in `src/`
   or `docs/`. The demo data uses rounded city-center coords only
   (and they're stored in the seeded DB, not in the repo).
5. The `skills/` directory's stock images are Z.ai internal design
   assets (social-card templates), NOT incident imagery.

## Storage lifecycle notes

Per the brief: "storage lifecycle notes." The evidence lifecycle is:

```
upload → store original + derivative + thumbnail in private buckets
       → reports row created (status = uploaded)
       → optional: AI analyzes the derivative (status → analyzing →
         needs_review / needs_manual_review / retryable_error)
       → reviewer confirms/flags/rejects/resolves (status → reviewed)
       → contributor or reviewer requests soft-delete
         (retention_state = soft_deleted; signed URLs refused)
       → retention window expires (default 7 days)
       → admin or scheduled purge removes the storage objects
         (retention_state = purged; reports row preserved with
         storage keys blanked; audit trail intact)
```

See `src/lib/storage/retention.ts` for the implementation, the
`DELETE /api/reports/[id]/retention` endpoint for the revoke affordance,
and `POST /api/reports/[id]/retention?purge=1` for the admin purge
affordance.

The private buckets (`evidence-originals`, `evidence-derivatives`,
`evidence-thumbnails`) are configured in `supabase/migrations/
0003_storage.sql` to be PRIVATE (no public read). The server mints
short-lived (60s) signed URLs at read time (see `src/app/api/reports/
[id]/evidence/route.ts`). The retention gate refuses to mint URLs
for soft_deleted or purged reports (410 GONE).
