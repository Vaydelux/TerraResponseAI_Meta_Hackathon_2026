// src/lib/storage/private-store.ts
//
// Store the original + derivative + thumbnail in the private Supabase
// Storage buckets (0003_storage.sql). The original is NEVER publicly
// exposed; the derivative + thumbnail are EXIF-stripped (see
// derivative.ts). The server mints short-lived signed URLs at read
// time (see supabase/README.md §6).
//
// Per the brief:
//   - "Preserve the original in private Storage according to retention
//     policy and do not publicly expose it."
//   - "Upload only after server identity/event authorization checks."
//   - "Resilient partial-upload rollback."
//
// The rollback strategy: upload the original first; if the derivative
// or thumbnail upload fails, delete the original + any partial
// derivatives so no orphaned objects remain. The caller (route
// handler) is responsible for not creating the reports row until all
// three objects are stored.

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, serviceRoleKey, isSupabaseConfigured } from "@/lib/supabase/env";

// The service-role client bypasses RLS. Server-side only. We use it
// (not the SSR cookie-bound client) because storage uploads from the
// server don't need the user's RLS context — the route handler
// already authorized the user + event.
function serviceStorage() {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const BUCKET_ORIGINAL = "evidence-originals";
const BUCKET_DERIVATIVE = "evidence-derivatives";
const BUCKET_THUMBNAIL = "evidence-thumbnails";

export interface StoredKeys {
  originalStorageKey: string;
  derivativeStorageKey: string;
  thumbnailStorageKey: string;
}

/**
 * Store the original + derivative + thumbnail. Each goes to its
 * private bucket under <event_id>/<report_id>.<ext>.
 *
 * On ANY failure, delete the already-uploaded objects so no orphans
 * remain (resilient partial-upload rollback per the brief).
 *
 * Returns the three storage keys on success, or throws with a
 * descriptive error. The caller must not create the reports row
 * until this returns successfully.
 */
export async function storeEvidence(args: {
  eventId: string;
  reportId: string;
  /** The original upload bytes (any Uint8Array, including Buffer). */
  original: Uint8Array;
  /** The EXIF-stripped derivative (Sharp returns a Buffer). */
  derivative: Uint8Array;
  /** The EXIF-stripped thumbnail (Sharp returns a Buffer). */
  thumbnail: Uint8Array;
  ext: "jpg" | "png" | "webp";
}): Promise<StoredKeys> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured; cannot store evidence.");
  }
  const client = serviceStorage();
  const { eventId, reportId, original, derivative, thumbnail, ext } = args;

  const originalPath = `${eventId}/${reportId}.${ext}`;
  const derivativePath = `${eventId}/${reportId}.jpg`; // derivative is always JPEG
  const thumbnailPath = `${eventId}/${reportId}.jpg`;

  const uploaded: Array<{ bucket: string; path: string }> = [];

  try {
    // 1. Original (private bucket; EXIF intact).
    const { error: origErr } = await client.storage
      .from(BUCKET_ORIGINAL)
      .upload(originalPath, Buffer.from(original), {
        contentType: ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp",
        upsert: false,
      });
    if (origErr) throw new Error(`Original upload failed: ${origErr.message}`);
    uploaded.push({ bucket: BUCKET_ORIGINAL, path: originalPath });

    // 2. Derivative (EXIF-stripped JPEG).
    const { error: derivErr } = await client.storage
      .from(BUCKET_DERIVATIVE)
      .upload(derivativePath, Buffer.from(derivative), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (derivErr) throw new Error(`Derivative upload failed: ${derivErr.message}`);
    uploaded.push({ bucket: BUCKET_DERIVATIVE, path: derivativePath });

    // 3. Thumbnail (EXIF-stripped JPEG).
    const { error: thumbErr } = await client.storage
      .from(BUCKET_THUMBNAIL)
      .upload(thumbnailPath, Buffer.from(thumbnail), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (thumbErr) throw new Error(`Thumbnail upload failed: ${thumbErr.message}`);
    uploaded.push({ bucket: BUCKET_THUMBNAIL, path: thumbnailPath });

    return {
      originalStorageKey: `${BUCKET_ORIGINAL}/${originalPath}`,
      derivativeStorageKey: `${BUCKET_DERIVATIVE}/${derivativePath}`,
      thumbnailStorageKey: `${BUCKET_THUMBNAIL}/${thumbnailPath}`,
    };
  } catch (err) {
    // Rollback: delete every object that was successfully uploaded.
    await Promise.all(
      uploaded.map(({ bucket, path }) =>
        client.storage.from(bucket).remove([path]).catch(() => {}),
      ),
    );
    throw err;
  }
}

/**
 * Delete all three storage objects for a report. Used when the reports
 * row creation fails AFTER the storage upload (e.g., a DB insert error)
 * — the route handler calls this to clean up.
 */
export async function deleteEvidence(keys: StoredKeys): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = serviceStorage();
  // Each key is "<bucket>/<path>"; split on the first "/".
  const items = [
    { key: keys.originalStorageKey, bucket: BUCKET_ORIGINAL },
    { key: keys.derivativeStorageKey, bucket: BUCKET_DERIVATIVE },
    { key: keys.thumbnailStorageKey, bucket: BUCKET_THUMBNAIL },
  ];
  await Promise.all(
    items.map(({ key, bucket }) => {
      const path = key.slice(bucket.length + 1);
      return client.storage.from(bucket).remove([path]).catch(() => {});
    }),
  );
}
