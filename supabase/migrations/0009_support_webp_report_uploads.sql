-- TerraResponse AI — fix WebP report-upload persistence.
-- Upload validator and derivative pipeline accept image/webp, but the
-- original 0001 reports.image_mime_type CHECK omitted it.
-- Forward-only, non-destructive; review/apply on staging first.
--
-- Preserve the original constraint name to avoid duplicate constraints.
-- Existing JPEG/PNG records remain valid.

alter table public.reports
  drop constraint if exists reports_image_mime_type_check;

alter table public.reports
  add constraint reports_image_mime_type_check
  check (image_mime_type in ('image/jpeg', 'image/png', 'image/webp'));
