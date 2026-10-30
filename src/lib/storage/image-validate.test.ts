// src/lib/storage/image-validate.test.ts
//
// Unit tests for server-side image validation. Tests the magic-byte
// detection + the full validateImageFile (size + magic + Sharp
// decode) path. Uses Sharp to generate real test images so the decode
// check exercises real code.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  detectImageType,
  validateImageFile,
  describeValidationError,
  maxUploadBytes,
  ALLOWED_IMAGE_TYPES,
} from "@/lib/storage/image-validate";

// Helper: make a real 1x1 JPEG/PNG/WebP buffer via Sharp.
async function makeImage(format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .toFormat(format)
    .toBuffer();
}

describe("detectImageType (magic bytes)", () => {
  it("detects a JPEG from the FF D8 FF magic bytes", async () => {
    const buf = await makeImage("jpeg");
    expect(detectImageType(new Uint8Array(buf))).toBe("image/jpeg");
  });
  it("detects a PNG from the 89 50 4E 47 magic bytes", async () => {
    const buf = await makeImage("png");
    expect(detectImageType(new Uint8Array(buf))).toBe("image/png");
  });
  it("detects a WebP from the RIFF....WEBP magic bytes", async () => {
    const buf = await makeImage("webp");
    expect(detectImageType(new Uint8Array(buf))).toBe("image/webp");
  });
  it("returns null for a non-image buffer", () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(detectImageType(buf)).toBeNull();
  });
  it("returns null for an empty buffer", () => {
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });
  it("returns null for a buffer that's too short for any signature", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
  it("rejects a RIFF file that's not WebP (e.g., WAV)", () => {
    // RIFF....WAVE — not WEBP
    const buf = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x41, 0x56, 0x45, // WAVE
    ]);
    expect(detectImageType(buf)).toBeNull();
  });
});

describe("validateImageFile (full server-side check)", () => {
  it("accepts a real JPEG", async () => {
    const buf = new Uint8Array(await makeImage("jpeg"));
    const res = await validateImageFile(buf, "image/jpeg");
    expect(res.ok).toBe(true);
    expect(res.detectedType).toBe("image/jpeg");
  });
  it("accepts a real PNG", async () => {
    const buf = new Uint8Array(await makeImage("png"));
    const res = await validateImageFile(buf, "image/png");
    expect(res.ok).toBe(true);
    expect(res.detectedType).toBe("image/png");
  });
  it("accepts a real WebP", async () => {
    const buf = new Uint8Array(await makeImage("webp"));
    const res = await validateImageFile(buf, "image/webp");
    expect(res.ok).toBe(true);
    expect(res.detectedType).toBe("image/webp");
  });
  it("rejects an empty file", async () => {
    const res = await validateImageFile(new Uint8Array(0), "image/jpeg");
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("empty");
  });
  it("rejects a file that exceeds the size limit", async () => {
    // Save the original limit, set a tiny one for the test, restore.
    const orig = process.env.UPLOAD_MAX_BYTES;
    process.env.UPLOAD_MAX_BYTES = "100"; // 100 bytes
    try {
      const buf = new Uint8Array(await makeImage("jpeg")); // ~200 bytes
      expect(buf.byteLength).toBeGreaterThan(100);
      const res = await validateImageFile(buf, "image/jpeg");
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("too_large");
      if (res.error?.code === "too_large") {
        expect(res.error.limitBytes).toBe(100);
        expect(res.error.actualBytes).toBe(buf.byteLength);
      }
    } finally {
      if (orig === undefined) delete process.env.UPLOAD_MAX_BYTES;
      else process.env.UPLOAD_MAX_BYTES = orig;
    }
  });
  it("rejects a disguised non-image (wrong magic bytes) regardless of declared MIME", async () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const res = await validateImageFile(buf, "image/jpeg"); // lying MIME
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("wrong_type");
    if (res.error?.code === "wrong_type") {
      expect(res.error.detected).toBe("image/jpeg");
      expect(res.error.allowed).toEqual(ALLOWED_IMAGE_TYPES);
    }
  });
  it("rejects a truncated image that passes magic bytes but fails Sharp decode", async () => {
    // Take a real JPEG and truncate it so the magic bytes pass but
    // Sharp can't decode.
    const full = await makeImage("jpeg");
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    const res = await validateImageFile(new Uint8Array(truncated), "image/jpeg");
    expect(res.ok).toBe(false);
    // Could be decode_failed (Sharp can't read) — that's the expected path.
    expect(["decode_failed", "wrong_type"]).toContain(res.error?.code);
  });
});

describe("describeValidationError (human-readable messages)", () => {
  it("describes an empty-file error", () => {
    expect(describeValidationError({ code: "empty" })).toBe("The file is empty.");
  });
  it("describes a too-large error with MB rounding", () => {
    const msg = describeValidationError({
      code: "too_large",
      limitBytes: 10 * 1024 * 1024,
      actualBytes: 15 * 1024 * 1024,
    });
    expect(msg).toContain("15.0 MB");
    expect(msg).toContain("10 MB");
  });
  it("describes a wrong-type error with the declared MIME", () => {
    const msg = describeValidationError({
      code: "wrong_type",
      detected: "application/pdf",
      allowed: ALLOWED_IMAGE_TYPES,
    });
    expect(msg).toContain("application/pdf");
    expect(msg).toContain("image/jpeg");
  });
  it("describes a decode-failed error", () => {
    const msg = describeValidationError({ code: "decode_failed", detail: "truncated" });
    expect(msg).toContain("truncated");
  });
});

describe("maxUploadBytes (configurable limit)", () => {
  it("defaults to 10 MB when UPLOAD_MAX_BYTES is unset", () => {
    const orig = process.env.UPLOAD_MAX_BYTES;
    delete process.env.UPLOAD_MAX_BYTES;
    try {
      expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
    } finally {
      if (orig !== undefined) process.env.UPLOAD_MAX_BYTES = orig;
    }
  });
  it("respects UPLOAD_MAX_BYTES when set", () => {
    const orig = process.env.UPLOAD_MAX_BYTES;
    process.env.UPLOAD_MAX_BYTES = "5242880"; // 5 MB
    try {
      expect(maxUploadBytes()).toBe(5 * 1024 * 1024);
    } finally {
      if (orig === undefined) delete process.env.UPLOAD_MAX_BYTES;
      else process.env.UPLOAD_MAX_BYTES = orig;
    }
  });
  it("falls back to 10 MB for an invalid value", () => {
    const orig = process.env.UPLOAD_MAX_BYTES;
    process.env.UPLOAD_MAX_BYTES = "not-a-number";
    try {
      expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
    } finally {
      if (orig === undefined) delete process.env.UPLOAD_MAX_BYTES;
      else process.env.UPLOAD_MAX_BYTES = orig;
    }
  });
});
