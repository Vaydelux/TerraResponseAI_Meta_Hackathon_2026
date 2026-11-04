import { createHmac, timingSafeEqual } from "node:crypto";
import { serviceRoleKey } from "@/lib/supabase/env";

export interface DirectUploadGrant {
  userId: string;
  eventId: string;
  reportId: string;
  path: string;
  expiresAt: number;
}

function secret() {
  const value = serviceRoleKey();
  if (!value) throw new Error("Direct upload signing is not configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createDirectUploadGrant(grant: Omit<DirectUploadGrant, "expiresAt">, ttlMs = 15 * 60_000) {
  const payload = JSON.stringify({ ...grant, expiresAt: Date.now() + ttlMs });
  return Buffer.from(payload).toString("base64url") + "." + signature(payload);
}

export function verifyDirectUploadGrant(token: string): DirectUploadGrant | null {
  const [encoded, received] = token.split(".");
  if (!encoded || !received) return null;
  try {
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = signature(payload);
    if (expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
    const grant = JSON.parse(payload) as DirectUploadGrant;
    if (!grant.userId || !grant.eventId || !grant.reportId || !grant.path || grant.expiresAt < Date.now()) return null;
    return grant;
  } catch {
    return null;
  }
}
