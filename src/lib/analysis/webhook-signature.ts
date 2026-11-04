import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 300;

function secret(): string {
  const value = process.env.ANALYSIS_WEBHOOK_SECRET;
  if (!value || value.length < 32) {
    throw new Error("ANALYSIS_WEBHOOK_SECRET must be at least 32 characters.");
  }
  return value;
}

function digest(message: string): string {
  return createHmac("sha256", secret()).update(message).digest("base64url");
}

export function signAnalysisWebhook(input: {
  reportId: string;
  actorId: string;
  timestampSeconds?: number;
}): string {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  return `${timestampSeconds}.${digest(`${timestampSeconds}.${input.reportId}.${input.actorId}`)}`;
}

export function verifyAnalysisWebhook(input: {
  signature: string | null;
  reportId: string;
  actorId: string;
  nowSeconds?: number;
}): boolean {
  if (!input.signature) return false;
  const [timestamp, provided] = input.signature.split(".", 2);
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || !provided) return false;

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = digest(`${timestampSeconds}.${input.reportId}.${input.actorId}`);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
