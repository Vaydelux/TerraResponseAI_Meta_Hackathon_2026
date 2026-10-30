import { z } from "zod";

export const reportUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  locationSource: z.enum(["gps", "manual", "unknown"]).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  locationLabel: z.string().max(200).optional(),
}).strict();

type ReportUpdate = z.infer<typeof reportUpdateSchema>;

type ReportColumns = {
  title?: string;
  description?: string;
  location_source?: "gps" | "manual" | "unknown";
  latitude?: number | null;
  longitude?: number | null;
  location_label?: string;
};

/** Convert public API camelCase fields into actual PostgreSQL columns. */
export function toReportColumns(input: ReportUpdate): ReportColumns {
  const columns: ReportColumns = {};
  if (input.title !== undefined) columns.title = input.title;
  if (input.description !== undefined) columns.description = input.description;
  if (input.locationLabel !== undefined) columns.location_label = input.locationLabel;

  const changesLocation = input.locationSource !== undefined ||
    input.latitude !== undefined || input.longitude !== undefined;
  if (changesLocation) {
    // Update the canonical location atomically. Never infer missing
    // coordinates or preserve stale coordinates for an unknown source.
    if (input.locationSource === "unknown") {
      if (input.latitude != null || input.longitude != null) {
        throw new Error("Unknown location must not have coordinates.");
      }
      columns.location_source = "unknown";
      columns.latitude = null;
      columns.longitude = null;
    } else if (input.locationSource === "gps" || input.locationSource === "manual") {
      if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
        throw new Error("GPS or manual location requires both coordinates.");
      }
      columns.location_source = input.locationSource;
      columns.latitude = input.latitude;
      columns.longitude = input.longitude;
    } else {
      throw new Error("Coordinate updates require an explicit locationSource.");
    }
  }
  if (Object.keys(columns).length === 0) throw new Error("No editable fields supplied.");
  return columns;
}
