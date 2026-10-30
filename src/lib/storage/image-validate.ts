// src/lib/storage/image-validate.ts
//
// Server-side image validation. NEVER trust the client's MIME type,
// filename, or size alone — the brief's requirement. We verify:
//   1. The file size is within the configured limit.
//   2. The file's magic bytes match one of the allowed types (JPEG,
//      PNG, WebP) — not the client-supplied Content-Type.
//   3. The image actually decodes via Sharp (catches truncated /
//      disguised files a magic-byte check alone would miss).
//
// Allowed types: JPEG, PNG, WebP. WebP is added per the brief
// ("Support JPEG, PNG, and WebP").

import sharp from "sharp";

export type AllowedImageType = "image/jpeg" | "image/png" | "image/webp";

export const ALLOWED_IMAGE_TYPES: AllowedImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Default max upload size: 10 MB. Overridable via UPLOAD_MAX_BYTES. */
export function maxUploadBytes(): number {
  const raw = process.env.UPLOAD_MAX_BYTES;
  if (!raw) return 10 * 1024 * 1024;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024;
}

interface MagicByteMatch {
  type: AllowedImageType;
  /** Byte offset to start checking at. */
  offset: number;
  /** The expected bytes. */
  bytes: number[];
}

// Magic-byte signatures. Source: https://en.wikipedia.org/wiki/List_of_file_signatures
const MAGIC_BYTES: MagicByteMatch[] = [
  // JPEG: FF D8 FF
  { type: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    type: "image/png",
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // WebP: RIFF....WEBP (offset 0 = "RIFF", offset 8 = "WEBP")
  {
    type: "image/webp",
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  },
];

/**
 * Detect the image type from magic bytes. Returns the detected type
 * or null if no signature matches. Does NOT trust the client MIME.
 */
export function detectImageType(buf: Uint8Array): AllowedImageType | null {
  for (const sig of MAGIC_BYTES) {
    if (buf.length < sig.offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      // WebP needs the "WEBP" at offset 8 too.
      if (sig.type === "image/webp") {
        if (
          buf.length >= 12 &&
          buf[8] === 0x57 && // W
          buf[9] === 0x45 && // E
          buf[10] === 0x42 && // B
          buf[11] === 0x50 // P
        ) {
          return "image/webp";
        }
        continue; // RIFF but not WEBP — keep checking
      }
      return sig.type;
    }
  }
  return null;
}

export type ValidationError =
  | { code: "too_large"; limitBytes: number; actualBytes: number }
  | { code: "empty" }
  | { code: "wrong_type"; detected: string | null; allowed: AllowedImageType[] }
  | { code: "decode_failed"; detail: string };

export interface ValidationResult {
  ok: boolean;
  detectedType: AllowedImageType | null;
  error?: ValidationError;
}

/**
 * Full server-side validation: size limit + magic bytes + Sharp decode.
 * Returns the detected type on success, or a structured error.
 *
 * This is the boundary the brief specifies: "Verify actual file
 * signatures and successful image decoding server-side; never trust
 * client MIME, name, metadata, or size alone."
 */
export async function validateImageFile(
  buf: Uint8Array,
  declaredMime?: string,
): Promise<ValidationResult> {
  const size = buf.byteLength;
  const limit = maxUploadBytes();

  if (size === 0) {
    return { ok: false, detectedType: null, error: { code: "empty" } };
  }
  if (size > limit) {
    return {
      ok: false,
      detectedType: null,
      error: { code: "too_large", limitBytes: limit, actualBytes: size },
    };
  }

  // 1. Magic-byte check (NOT the declaredMime).
  const detectedType = detectImageType(buf);
  if (!detectedType) {
    return {
      ok: false,
      detectedType: null,
      error: {
        code: "wrong_type",
        detected: declaredMime ?? null,
        allowed: ALLOWED_IMAGE_TYPES,
      },
    };
  }

  // 2. Sharp decode check — catches truncated / corrupted files that
  // pass the magic-byte check but aren't real images.
  try {
    const metadata = await sharp(Buffer.from(buf)).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
      return {
        ok: false,
        detectedType,
        error: { code: "decode_failed", detail: "Image has no dimensions" },
      };
    }
    // Sanity cap: reject absurdly large dimensions (decompression defense).
    if (metadata.width > 20000 || metadata.height > 20000) {
      return {
        ok: false,
        detectedType,
        error: {
          code: "decode_failed",
          detail: `Image dimensions ${metadata.width}x${metadata.height} exceed the 20000px cap`,
        },
      };
    }
  } catch (err) {
    return {
      ok: false,
      detectedType,
      error: {
        code: "decode_failed",
        detail: err instanceof Error ? err.message : "Unknown decode error",
      },
    };
  }

  return { ok: true, detectedType };
}

/**
 * Human-readable error message for a ValidationError. Used by the
 * route handler to return a helpful 400 body.
 */
export function describeValidationError(err: ValidationError): string {
  switch (err.code) {
    case "empty":
      return "The file is empty.";
    case "too_large":
      return `The file is ${(err.actualBytes / 1024 / 1024).toFixed(1)} MB; the limit is ${(err.limitBytes / 1024 / 1024).toFixed(0)} MB.`;
    case "wrong_type":
      return `The file type is not allowed${err.detected ? ` (declared ${err.detected})` : ""}. Allowed: ${err.allowed.join(", ")}.`;
    case "decode_failed":
      return `The image could not be decoded: ${err.detail}. The file may be truncated or corrupted.`;
  }
}
