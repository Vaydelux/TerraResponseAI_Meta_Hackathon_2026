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
        model_id?: string;
        structured_observation?: Record<string, unknown> | null;
      }
    | Array<{
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

  const supabase = await createSupabaseServerClient();
  const { data: rawReport, error } = await supabase
    .from("reports")
    .select(
      "id, event_id, title, description, latitude, longitude, location_label, captured_at, uploaded_at, report_analyses(model_id, structured_observation)",
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

  // Return cached contextual_intelligence if already present and not force-refreshing
  const existingContext = structuredObs?.contextual_intelligence as
    | ContextualIntelligenceData
    | undefined;
  if (!forceRefresh && existingContext && existingContext.summary) {
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

  // Best-effort persist into report_analyses.structured_observation if an analysis row exists
  if (structuredObs) {
    try {
      await supabase
        .from("report_analyses")
        .update({
          structured_observation: {
            ...structuredObs,
            contextual_intelligence: contextualIntelligence,
          },
        })
        .eq("report_id", id);
    } catch {
      // Non-fatal if RLS or transient DB error prevents caching
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
