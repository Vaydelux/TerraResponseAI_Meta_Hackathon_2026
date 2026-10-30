// src/lib/storage/sha256.ts
//
// SHA-256 over the original upload bytes. Used for dedup detection
// within the authorized event (see dedup.ts) and integrity.
//
// Uses Node's crypto (server-side only). Returns the lowercase hex
// digest (64 chars).

import { createHash } from "node:crypto";

export function sha256Hex(buf: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

/** Validate the digest format (64 lowercase hex chars). */
export function isValidSha256(s: string): boolean {
  return /^[0-9a-f]{64}$/.test(s);
}
