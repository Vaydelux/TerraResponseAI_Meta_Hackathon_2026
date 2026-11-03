// src/app/api/reports/[id]/context/route.ts
//
// GET / POST /api/reports/[id]/context — retrieves or refreshes real-time
// Google Search grounded contextual intelligence (weather alerts, local news,
// situational advisories) for an incident report's location and hazard type.
//
// Uses @google/genai (`gemini-3.8-flash`) with `tools: [{ googleSearch: {} }]`
// on the server side so GEMINI_API_KEY is never exposed to the browser.

import { NextRequest, NextResponse } from "next/server";
import {
  requireServerUser,
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import {
  fetchContextualIntelligence,
  type ContextualIntelligenceData,
} from "@/lib/ai/contextual-intelligence";

interface ReportContextRow {
  id: string;
  event_id: string;
  title: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  captured_at: string | null;
  uploaded_at: string;
  report_analyses?:
    | {
        raw_usage_metadata?: Record<string, unknown> | null;
        model_id?: string;
        structured_observation?: Record<string, unknown> | null;
      }
    | Array<{
        raw_usage_metadata?: Record<string, unknown> | null;
        model_id?: string;
        structured_observation?: Record<string, unknown> | null;
      }>
    | null;
}

async function resolveContextForReport(
  id: string,
  forceRefresh: boolean,
): Promise<NextResponse> {
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

  // External context is a reviewer tool, never a public user-paid
  // inference endpoint. The RLS report read below still checks access.
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Reviewer access required." } },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: rawReport, error } = await supabase
    .from("reports")
    .select(
      "id, event_id, title, description, latitude, longitude, location_label, captured_at, uploaded_at, report_analyses(model_id, structured_observation, raw_usage_metadata)",
    )
    .eq("id", id)
    .single();

  if (error || !rawReport) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found or access denied." } },
      { status: 404 },
    );
  }

  const report = rawReport as unknown as ReportContextRow;
  const analysisRow = Array.isArray(report.report_analyses)
    ? report.report_analyses[0]
    : report.report_analyses;
  const structuredObs = analysisRow?.structured_observation ?? null;

  // Keep external context separate from strict Meta image observations:
  // adding arbitrary keys to structured_observation breaks Zod .strict()
  // and can strand an otherwise valid report on a triage retry.
  const analysisMetadata = analysisRow?.raw_usage_metadata ?? {};
  const existingContext = (analysisMetadata.contextual_intelligence ??
    structuredObs?.contextual_intelligence) as ContextualIntelligenceData | undefined;
  const cachedAt = existingContext?.generatedAt ? Date.parse(existingContext.generatedAt) : NaN;
  const refreshCooldownMs = 15 * 60 * 1000;
  const cacheFresh = Number.isFinite(cachedAt) &&
    cachedAt <= Date.now() && Date.now() - cachedAt < refreshCooldownMs;
  if (existingContext?.summary && (!forceRefresh || cacheFresh)) {
    return NextResponse.json({
      ok: true,
      contextualIntelligence: existingContext,
      fromCache: true,
    });
  }

  const incidentType =
    typeof structuredObs?.incident_type === "string"
      ? structuredObs.incident_type
      : null;

  const contextualIntelligence = await fetchContextualIntelligence({
    incidentType,
    locationLabel: report.location_label,
    latitude: report.latitude,
    longitude: report.longitude,
    capturedAt: report.captured_at,
    uploadedAt: report.uploaded_at,
    title: report.title,
    description: report.description,
  });

  // Only confirmed source-grounded results deserve a durable cache.
  // In standby mode, do not invent evidence or alter the Meta observation.
  if (structuredObs && contextualIntelligence.grounded) {
    const db = createClient(supabaseUrl(), serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: cacheError } = await db
      .from("report_analyses")
      .update({
        raw_usage_metadata: {
          ...analysisMetadata,
          contextual_intelligence: contextualIntelligence,
        },
      })
      .eq("report_id", id);
    if (cacheError) {
      // Do not claim a persisted cache; the reviewer still gets the
      // grounded response and this incident can be retried later.
      console.error("[context] Unable to persist external context.", { code: cacheError.code });
    }
  }

  return NextResponse.json({
    ok: true,
    contextualIntelligence,
    fromCache: false,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return resolveContextForReport(id, false);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return resolveContextForReport(id, true);
}
