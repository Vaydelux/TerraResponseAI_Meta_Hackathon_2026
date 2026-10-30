// src/lib/ai/usage-log.ts
//
// Insert a row into ai_usage_log for every AI call (success, transient
// failure, permanent failure, schema-invalid, budget-exhausted, or
// rate-limited). Per the brief:
//   - "Log model, prompt version, requests, token/usage counts where
//     the API provides them, latency, estimated cost with clear
//     caveats, and failures without logging secrets or sensitive
//     image content."
//
// What we log:
//   - report_id, event_id, user_id (the actor who triggered the call)
//   - model_id, prompt_version, schema_version (the inference recipe)
//   - provider_request_id (for billing correlation; NOT the user's req id)
//   - prompt_tokens, completion_tokens, total_tokens (when the provider
//     returns them)
//   - latency_ms (round-trip, including retries)
//   - estimated_cost_usd + cost_basis ('tokens' | 'flat')
//   - outcome ('succeeded' | 'transient_failed' | 'permanent_failed' |
//     'schema_invalid' | 'budget_exhausted' | 'rate_limited' |
//     'download_failed')
//   - failure_kind + a SHORT, SANITIZED error_message
//   - utc_day (UTC day stamp for the daily rollup)
//
// What we DO NOT log (SECURITY.md §6.4 + §6.5):
//   - The prompt body (the system prompt is fixed; the user's
//     title/description are NOT included in the prompt — see prompt.ts)
//   - The image bytes (the image is read from private storage; the
//     telemetry row only references the report_id)
//   - The raw model response text (the parsed observation is stored
//     on report_analyses; the telemetry row stores only token counts
//     + outcome)
//   - Any secret or credential
//
// Sanitization of error_message: we cap at 200 chars and strip
// anything that looks like an API key, a JWT, or a base64 blob. The
// raw error is logged via console.error (server-side only) for the
// operator to read in the platform logs.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  estimateCost,
  readCostControlConfig,
  type CostControlConfig,
} from "@/lib/ai/cost-controls";
import { MODEL_ID } from "@/lib/ai/muse-spark";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { OBSERVATION_SCHEMA_VERSION } from "@/lib/ai/observation-schema";

export type UsageOutcome =
  | "succeeded"
  | "transient_failed"
  | "permanent_failed"
  | "schema_invalid"
  | "budget_exhausted"
  | "rate_limited"
  | "download_failed";

export interface UsageLogEntry {
  reportId: string | null;
  eventId: string | null;
  userId: string | null;
  modelId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  providerRequestId?: string | null;
  /** Token usage from the provider. Accepts either the provider's
   *  snake_case (prompt_tokens, completion_tokens, total_tokens)
   *  OR the camelCase shape (promptTokens, etc.) so the caller can
   *  pass the result.usageMetadata object directly without renaming. */
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
  latencyMs?: number | null;
  outcome: UsageOutcome;
  failureKind?: string | null;
  errorMessage?: string | null;
  config?: CostControlConfig;
}

/** Sanitize an error message: cap length, strip credentials/blobs. */
function sanitizeError(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw);
  // Strip JWTs (ey...).
  s = s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
  // Strip long hex (API keys).
  s = s.replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-key]");
  // Strip Bearer tokens.
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted-bearer]");
  // Strip long base64 blobs (could leak image content).
  s = s.replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[redacted-blob]");
  // Cap at 200 chars.
  if (s.length > 200) s = s.slice(0, 200) + "…";
  return s;
}

/** Insert a usage log entry. Logs errors to console.error (server-side
 *  only) and never throws — telemetry is best-effort. */
export async function logUsage(entry: UsageLogEntry): Promise<void> {
  const config = entry.config ?? readCostControlConfig();
  // Normalize the usage: the provider returns snake_case; the cache
  // hit path may pass camelCase. Both are accepted; we normalize to
  // camelCase for estimateCost + to the DB column names for the row.
  const u = entry.usage;
  const usage = u
    ? {
        promptTokens: u.promptTokens ?? u.prompt_tokens ?? null,
        completionTokens: u.completionTokens ?? u.completion_tokens ?? null,
        totalTokens: u.totalTokens ?? u.total_tokens ?? null,
      }
    : null;
  const cost = estimateCost(usage, config);
  const utcDay = new Date().toISOString().slice(0, 10);

  const row = {
    report_id: entry.reportId,
    event_id: entry.eventId,
    user_id: entry.userId,
    model_id: entry.modelId ?? MODEL_ID,
    prompt_version: entry.promptVersion ?? PROMPT_VERSION,
    schema_version: entry.schemaVersion ?? OBSERVATION_SCHEMA_VERSION,
    provider_request_id: entry.providerRequestId ?? null,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    total_tokens: usage?.totalTokens ?? null,
    latency_ms: entry.latencyMs ?? null,
    estimated_cost_usd: Number(cost.usd.toFixed(6)),
    cost_basis: cost.basis,
    outcome: entry.outcome,
    failure_kind: entry.failureKind ?? null,
    error_message: sanitizeError(entry.errorMessage),
    utc_day: utcDay,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("ai_usage_log").insert(row);
    if (error) {
      console.error(
        `[usage-log] insert failed: ${error.message}. ` +
          `outcome=${entry.outcome} report=${entry.reportId ?? "-"} ` +
          `model=${row.model_id} prompt_v=${row.prompt_version}.`,
      );
    }
  } catch (err) {
    // Never throw from telemetry. The operator sees the error in
    // the platform logs; the request flow continues regardless.
    console.error(
      `[usage-log] unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Summarize usage for a UTC day. Used by the admin dashboard (O3).
 *  Returns the total cost + request count + outcome breakdown. */
export async function getDailyUsageSummary(
  utcDay: string,
): Promise<{
  totalCostUsd: number;
  totalRequests: number;
  byOutcome: Record<string, number>;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("estimated_cost_usd, outcome")
    .eq("utc_day", utcDay);
  if (error || !data) {
    return { totalCostUsd: 0, totalRequests: 0, byOutcome: {} };
  }
  let totalCost = 0;
  const byOutcome: Record<string, number> = {};
  for (const row of data) {
    totalCost += typeof row.estimated_cost_usd === "number" ? row.estimated_cost_usd : 0;
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
  }
  return {
    totalCostUsd: Number(totalCost.toFixed(6)),
    totalRequests: data.length,
    byOutcome,
  };
}
