// src/lib/api-schemas/reports.ts
//
// Zod schemas for the report upload API. The file itself is validated
// server-side by validateImageFile (magic bytes + Sharp decode), NOT
// by these schemas — the schema only covers the JSON metadata fields
// that accompany the multipart upload.

import { z } from "zod";

export const reportUploadMetaSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  // The contributor can pre-declare the location if they didn't get
  // it from EXIF. The route handler reads EXIF first; this is the
  // fallback / override.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationSource: z.enum(["gps", "manual", "unknown"]).optional(),
  locationLabel: z.string().max(200).optional(),
  // When the user confirmed a duplicate link, the client sends the
  // existing report id to link to. The route handler verifies the
  // duplicate is real (sha256 match) before linking.
  linkToReportId: z.string().uuid().optional(),
});

export type ReportUploadMeta = z.infer<typeof reportUploadMetaSchema>;
