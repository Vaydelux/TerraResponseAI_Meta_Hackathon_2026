// src/lib/storage/exif.ts
//
// EXIF extraction (server-side). We read GPS coordinates + the
// capture timestamp from the original upload so the contributor can
// confirm or correct the location. The derivative (see derivative.ts)
// strips ALL EXIF by default — the brief's requirement.
//
// Uses exifr (server-side only). Returns null for any field that's
// missing or unreadable — never throws.

import exifr from "exifr";

export interface ExifData {
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date | null;
}

/**
 * Parse GPS + capture timestamp from an image buffer. Returns nulls
 * for any field that's missing. The location_source (gps/manual/
 * unknown) is decided by the route handler based on whether GPS is
 * present.
 */
export async function readExif(buf: Uint8Array): Promise<ExifData> {
  try {
    // exifr.gps() returns { latitude, longitude } or null.
    const gps = await exifr.gps(Buffer.from(buf)).catch(() => null);
    // For the date, use a full parse with the date options. exifr
    // doesn't have a .date() helper; .parse() with the right options
    // returns the DateTimeOriginal field.
    let capturedAt: Date | null = null;
    try {
      const parsed = await exifr.parse(Buffer.from(buf), {
        tiff: true,
        exif: true,
        gps: false,
      });
      // DateTimeOriginal is the standard EXIF capture-time tag.
      if (parsed?.DateTimeOriginal instanceof Date) {
        capturedAt = parsed.DateTimeOriginal;
      } else if (parsed?.DateTimeOriginal) {
        capturedAt = new Date(parsed.DateTimeOriginal);
      }
    } catch {
      // No EXIF date — fine.
    }
    return {
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      capturedAt,
    };
  } catch {
    return { latitude: null, longitude: null, capturedAt: null };
  }
}
