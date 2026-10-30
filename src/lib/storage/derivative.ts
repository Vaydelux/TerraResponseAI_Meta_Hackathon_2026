// src/lib/storage/derivative.ts
//
// Compress/resize a separate inference/display derivative with Sharp.
// The original is preserved in private Storage (see private-store.ts);
// the derivative is EXIF-stripped, re-encoded to normalized JPEG, and
// resized to a max dimension for the inference/display path.
//
// Per the brief:
//   - "Compress/resize a separate inference/display derivative with Sharp."
//   - "Strip EXIF metadata from derivatives by default."
//
// We also produce a small thumbnail for list views.
//
// All three outputs (original, derivative, thumbnail) are stored in
// the private Supabase Storage buckets (0003_storage.sql). The
// derivative is what the reviewer sees + what the AI model receives.

import sharp from "sharp";

/** Max dimension (width or height) for the inference/display derivative. */
const DERIVATIVE_MAX_DIM = 1600;
/** Max dimension for the thumbnail. */
const THUMBNAIL_MAX_DIM = 400;
/** JPEG quality for the derivative (85 is a good quality/size balance). */
const DERIVATIVE_QUALITY = 85;
/** JPEG quality for the thumbnail. */
const THUMBNAIL_QUALITY = 75;

export interface DerivativeResult {
  /** The EXIF-stripped, re-encoded JPEG derivative. Sharp returns a
   *  Node Buffer (which extends Uint8Array), so the type is Buffer. */
  derivative: Buffer;
  /** The EXIF-stripped thumbnail (JPEG). */
  thumbnail: Buffer;
  derivativeWidth: number;
  derivativeHeight: number;
}

/**
 * Produce the EXIF-stripped, re-encoded derivative + thumbnail.
 * Both are normalized JPEG (regardless of the input format) so the
 * reviewer + AI model always see a consistent format.
 */
export async function makeDerivatives(
  original: Uint8Array,
): Promise<DerivativeResult> {
  const src = sharp(Buffer.from(original), { failOn: "truncated" });

  // Read the original metadata to compute the resize dimensions.
  const meta = await src.metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  // Derivative: resize to max 1600px on the long edge, strip ALL
  // metadata (EXIF, IPTC, XMP), re-encode as JPEG quality 85.
  const derivativeBuf = await src
    .clone()
    .rotate() // auto-orient using EXIF orientation (then we strip it)
    .resize({
      width: DERIVATIVE_MAX_DIM,
      height: DERIVATIVE_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: DERIVATIVE_QUALITY, mozjpeg: true })
    .toBuffer();

  // Re-read the derivative to get its final dimensions (after resize).
  const derivativeMeta = await sharp(derivativeBuf).metadata();

  // Thumbnail: resize to max 400px on the long edge, strip metadata.
  const thumbnailBuf = await sharp(Buffer.from(original), { failOn: "truncated" })
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_DIM,
      height: THUMBNAIL_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    derivative: derivativeBuf,
    thumbnail: thumbnailBuf,
    derivativeWidth: derivativeMeta.width ?? origW,
    derivativeHeight: derivativeMeta.height ?? origH,
  };
}
