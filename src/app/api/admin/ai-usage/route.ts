// src/app/api/admin/ai-usage/route.ts
//
// GET /api/admin/ai-usage — read-only AI usage summary for the
// current UTC day (and optionally a specific day via ?day=YYYY-MM-DD).
// Returns:
//   - Total estimated USD spend (today, or the queried day)
//   - Total request count
//   - Breakdown by outcome (succeeded / transient_failed / etc.)
//   - The configured ceilings (so the dashboard can show "5 / 50 USD")
//
// Authorization: admin only. Per the brief: "Gate: no ... silent
// failures." The endpoint surfaces the estimated cost with a clear
// caveat ("The provider bill is the source of truth; this is an
// estimate for anomaly detection and budget enforcement only").
//
// This endpoint does NOT expose:
//   - The provider's request_id (it's an internal billing correlation
//     id, not user-facing)
//   - Any token counts per-request (the daily total is enough; per-
//     request detail is admin-only via the DB)
//   - Any error_message text (it's stored sanitized on
//     ai_usage_log; this summary only counts outcomes)
//   - Any image bytes or raw model response (never stored, never
//     returned here)

import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { readCostControlConfig } from "@/lib/ai/cost-controls";
import { getDailyUsageSummary } from "@/lib/ai/usage-log";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } },
      { status: 503 },
    );
  }
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    );
  }
  const ctx = await getAuthContext(user);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profile not found." } },
      { status: 401 },
    );
  }
  // Admin only.
  if (ctx.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only admins can view the AI usage summary." } },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? new Date().toISOString().slice(0, 10);
  // Validate the day format (YYYY-MM-DD).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid day format. Expected YYYY-MM-DD." } },
      { status: 400 },
    );
  }

  const summary = await getDailyUsageSummary(day);
  const config = readCostControlConfig();
  return NextResponse.json({
    ok: true,
    day,
    summary,
    ceilings: {
      dailySpendCeilingUsd: config.dailySpendCeilingUsd,
      dailyRequestCeiling: config.dailyRequestCeiling,
      perEventBudget: config.perEventBudget,
      perUserAiCallsPerHour: config.perUserAiCallsPerHour,
      perUserUploadsPerHour: config.perUserUploadsPerHour,
      perUserSignedUrlsPerMinute: config.perUserSignedUrlsPerMinute,
      maxRetries: config.maxRetries,
      modelCallTimeoutMs: config.modelCallTimeoutMs,
    },
    caveat:
      "Estimated cost is a rough upper-bound approximation from token counts (or a flat per-call rate when tokens are unavailable). " +
      "The provider's actual bill is the source of truth. " +
      "These numbers are for anomaly detection + budget enforcement only.",
  });
}
