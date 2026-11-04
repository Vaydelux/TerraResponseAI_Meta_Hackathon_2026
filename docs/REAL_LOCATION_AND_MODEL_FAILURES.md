# TerraResponse AI — Real location picker and Meta output diagnostics

## What changed
- Report Step 2 no longer uses the fictional Metro Manila sector pad. It uses the same MapLibre GL JS / theme-aware OpenStreetMap raster basemap as the incident map. The initial map camera is a labeled Philippines overview and **is not a selected evidence location**.
- Click to propose coordinates from MapLibre's real map projection. Drag the selected marker or use its arrow keys for fine positioning. Manual latitude/longitude, consented browser GPS, EXIF GPS and Location unknown remain available.
- Local coordinate search accepts `latitude, longitude` (WGS84). Optional address/place-name lookup uses the signed-in POST `/api/map/geocode` route and **does not send report titles, image bytes, or private URLs**. Map page place-search results are not incident reports.
- The report pipeline timeline only says "AI observation produced, schema validated" after an actually successful status. Empty provider output is **not** a schema-validation failure.

## Optional place-name search setup
1. Create a MapTiler account and geocoding API key: https://cloud.maptiler.com/
2. Add `MAPTILER_API_KEY` as a server-side secret in Vercel (Production and whichever Preview/Staging environments should support search). Do **not** prefix it with `NEXT_PUBLIC_`; use provider restrictions/quotas.
3. Redeploy when permitted by your Vercel plan. Without this key, place-name search clearly reports unavailable while map pinning, manual coordinates, GPS and local coordinate search remain usable.
4. This is user-triggered search with a 550 ms client debounce, 6.5-second provider timeout, per-instance best-effort throttling and provider-level quota. This is **not** a global, distributed billing ceiling; set the actual provider quota accordingly.

## Model failure diagnosis and recovery
The staging report uploaded 2026-11-04 around 19:41 UTC was saved but failed with `Meta API returned an empty response.` There is **no evidence that its Zod schema validation failed**.

New analysis calls capture ONLY operational metadata when content is empty:
- `finish_reason` (for example `length` or `stop`)
- request choices count, completion tokens and reasoning tokens if present
- whether failure was an empty output, an actual malformed JSON/schema mismatch, timeout or provider HTTP failure

These are not the private reasoning text, image content, prompt, model response or access tokens. If a new failure has `finish_reason=length`, it is stored as retryable within the existing capped, idempotent path. Otherwise the preserved report remains for independent manual review. **No hidden automatic second paid call.** The model is configured for `reasoning_effort: low` to reduce reasoning-token consumption with the same bounded output limit; live schema-quality verification is required before claiming improved success rates. Provider usage charges remain subject to the live account pricing.

## Operational tests and limitations
- Run lint, TypeScript, unit/integration tests and Playwright 320/768/1440 before merge.
- On staging, verify actual tile rendering and pin click/drag/keyboard; real place-name search requires the key and a browser able to load maps.
- Confirm the saved report persists when tiles, place search, or inference fail.
- Two consecutive real authenticated reporter → Meta → independent reviewer → map validations remain the release acceptance gate, separate from browser smoke.
- Ensure basemap tile usage/attribution complies with your tile provider's terms; heavy production usage may require a contracted tile source.
- A selected map location is a user-supplied assertion, **not authenticated GPS**, and neither an AI observation nor a human review guarantees photo authenticity.
