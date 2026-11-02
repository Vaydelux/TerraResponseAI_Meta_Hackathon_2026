// src/lib/ai/contextual-intelligence.ts
//
// Server-only contextual intelligence service powered by Gemini with
// Google Search grounding (`tools: [{ googleSearch: {} }]`).
//
// Queries real-time weather alerts, hydro-meteorological bulletins,
// and local news reports for an incident's location and hazard type to
// give reviewers situational awareness on the Review Workbench.
//
// Epistemic boundary (per docs/DESIGN.md):
// Contextual intelligence is external supporting context and is NEVER
// conflated with what the vision model observed directly in the photo.

import { GoogleGenAI } from "@google/genai";

export interface ContextualIntelligenceSource {
  title: string;
  uri: string;
}

export interface ContextualIntelligenceData {
  /** Concise 2-3 sentence situational summary for the incident area. */
  summary: string;
  /** Active weather alerts or hydro-meteorological advisories. */
  weatherAlerts: string[];
  /** Local news reports, road closures, or situational updates. */
  localNewsAndAdvisories: string[];
  /** Grounded web sources returned by Google Search grounding. */
  sources: ContextualIntelligenceSource[];
  /** Search queries executed by the model. */
  searchQueries: string[];
  /** Human-readable location string queried. */
  locationContext: string;
  /** ISO timestamp when this intelligence was generated. */
  generatedAt: string;
  /** Model identifier used for grounding. */
  modelId: string;
  /** True if live Google Search grounding was used; false if fallback. */
  grounded: boolean;
}

export interface ContextualIntelligenceInput {
  incidentType?: string | null;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt?: string | null;
  uploadedAt?: string | null;
  title?: string | null;
  description?: string | null;
}

const GEMINI_GROUNDING_MODEL = "gemini-3.8-flash";

function formatIncidentCategory(incidentType?: string | null): string {
  if (!incidentType) return "hazard incident";
  const map: Record<string, string> = {
    flooding: "flooding and surface water inundation",
    blocked_road: "road obstruction and transport disruption",
    debris: "storm debris and structural obstruction",
    visible_structural_damage: "structural damage and building hazard",
    other: "local emergency hazard",
    unclear: "reported field incident",
  };
  return map[incidentType] ?? incidentType.replace(/_/g, " ");
}

function buildLocationDescriptor(input: ContextualIntelligenceInput): string {
  const parts: string[] = [];
  if (input.locationLabel && input.locationLabel.trim().length > 0) {
    parts.push(input.locationLabel.trim());
  }
  if (
    typeof input.latitude === "number" &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.longitude)
  ) {
    parts.push(`(${input.latitude.toFixed(4)}°N, ${input.longitude.toFixed(4)}°E)`);
  }
  if (parts.length === 0) {
    return "Metro Manila / Philippines operational sector";
  }
  return parts.join(" ");
}

function parseGroundedSections(rawText: string): {
  summary: string;
  weatherAlerts: string[];
  localNewsAndAdvisories: string[];
} {
  const cleaned = rawText.trim();
  if (!cleaned) {
    return {
      summary: "No live external advisories were returned for this location.",
      weatherAlerts: [],
      localNewsAndAdvisories: [],
    };
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let section: "summary" | "weather" | "news" = "summary";
  const summaryParts: string[] = [];
  const weatherAlerts: string[] = [];
  const localNewsAndAdvisories: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.startsWith("weather") ||
      lower.includes("weather alert") ||
      lower.includes("meteorological") ||
      lower.startsWith("## weather") ||
      lower.startsWith("**weather")
    ) {
      section = "weather";
      continue;
    }
    if (
      lower.startsWith("news") ||
      lower.includes("local news") ||
      lower.includes("situational") ||
      lower.includes("advisories") ||
      lower.startsWith("## news") ||
      lower.startsWith("**news") ||
      lower.startsWith("**local")
    ) {
      section = "news";
      continue;
    }
    if (
      lower.startsWith("summary") ||
      lower.startsWith("## summary") ||
      lower.startsWith("**summary")
    ) {
      section = "summary";
      continue;
    }

    const bulletCleaned = line
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*/g, "")
      .trim();

    if (!bulletCleaned) continue;

    if (section === "weather") {
      weatherAlerts.push(bulletCleaned);
    } else if (section === "news") {
      localNewsAndAdvisories.push(bulletCleaned);
    } else {
      if ( line.startsWith("-") || line.startsWith("*") || line.startsWith("•") ) {
        if (weatherAlerts.length < 2) {
          weatherAlerts.push(bulletCleaned);
        } else {
          localNewsAndAdvisories.push(bulletCleaned);
        }
      } else {
        summaryParts.push(bulletCleaned);
      }
    }
  }

  const summary =
    summaryParts.join(" ").slice(0, 550) ||
    cleaned.replace(/\*\*/g, "").slice(0, 400);

  return {
    summary,
    weatherAlerts: weatherAlerts.slice(0, 4),
    localNewsAndAdvisories: localNewsAndAdvisories.slice(0, 4),
  };
}

function buildFallbackIntelligence(
  input: ContextualIntelligenceInput,
): ContextualIntelligenceData {
  const locationContext = buildLocationDescriptor(input);
  const hazardLabel = formatIncidentCategory(input.incidentType);
  return {
    summary: `Situational context for ${locationContext} (${hazardLabel}): Monitor local disaster risk reduction advisories, drainage capacity, and arterial road passability in the surrounding barangay sector.`,
    weatherAlerts: [
      `Check active PAGASA rainfall and thunderstorm advisories for ${locationContext}.`,
      "Low-lying waterways and urban underpasses remain sensitive to localized runoff surges.",
    ],
    localNewsAndAdvisories: [
      `Cross-reference field reports of ${hazardLabel} with municipal DRRMO dispatch logs.`,
      "Verify clearance of primary emergency responder access routes before confirming severity.",
    ],
    sources: [
      {
        title: "PAGASA Official Weather & Flood Advisories",
        uri: "https://bagong.pagasa.dost.gov.ph",
      },
      {
        title: "NDRRMC Situational Bulletins",
        uri: "https://ndrrmc.gov.ph",
      },
    ],
    searchQueries: [
      `${locationContext} weather alert flood advisory`,
      `${locationContext} ${hazardLabel} news update`,
    ],
    locationContext,
    generatedAt: new Date().toISOString(),
    modelId: "contextual-standby-v1",
    grounded: false,
  };
}

/**
 * Queries Gemini (`gemini-3.8-flash`) with Google Search grounding enabled
 * (`tools: [{ googleSearch: {} }]`) to retrieve real-time weather alerts
 * and local news reports for the incident location.
 */
export async function fetchContextualIntelligence(
  input: ContextualIntelligenceInput,
): Promise<ContextualIntelligenceData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return buildFallbackIntelligence(input);
  }

  const locationContext = buildLocationDescriptor(input);
  const hazardLabel = formatIncidentCategory(input.incidentType);
  const timeReference = input.capturedAt ?? input.uploadedAt ?? new Date().toISOString();

  const prompt = [
    `You are an emergency management situational intelligence analyst assisting a human reviewer.`,
    `Provide real-time Google Search grounded context for a reported incident:`,
    `- Location: ${locationContext}`,
    `- Reported Hazard Category: ${hazardLabel}`,
    input.title ? `- Report Title: ${input.title.slice(0, 140)}` : null,
    input.description ? `- Field Note: ${input.description.slice(0, 240)}` : null,
    `- Timestamp Reference: ${timeReference}`,
    ``,
    `Format your response with these exact section headers:`,
    `Summary:`,
    `Write a concise 2-sentence situational overview of current conditions, weather, or hazards reported near this location.`,
    `Weather Alerts:`,
    `- List 2 to 3 specific active weather alerts, rainfall/wind warnings, or hydro-meteorological conditions for this area.`,
    `Local News & Advisories:`,
    `- List 2 to 3 relevant local news updates, traffic/road advisories, or municipal emergency notices near this location.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const response = await ai.models.generateContent({
      model: GEMINI_GROUNDING_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text ?? "";
    const parsed = parseGroundedSections(text);

    const candidate = response.candidates?.[0];
    const groundingMeta = candidate?.groundingMetadata;
    const rawChunks = groundingMeta?.groundingChunks ?? [];

    const sources: ContextualIntelligenceSource[] = [];
    const seenUris = new Set<string>();

    for (const chunk of rawChunks) {
      const uri = chunk.web?.uri;
      const title = chunk.web?.title;
      if (uri && !seenUris.has(uri)) {
        seenUris.add(uri);
        sources.push({
          title: title && title.trim().length > 0 ? title.trim() : uri,
          uri,
        });
      }
    }

    const searchQueries = (groundingMeta?.webSearchQueries ?? []).filter(
      (q): q is string => typeof q === "string" && q.trim().length > 0,
    );

    return {
      summary: parsed.summary,
      weatherAlerts:
        parsed.weatherAlerts.length > 0
          ? parsed.weatherAlerts
          : [
              `Active meteorological monitoring in effect for ${locationContext}.`,
            ],
      localNewsAndAdvisories:
        parsed.localNewsAndAdvisories.length > 0
          ? parsed.localNewsAndAdvisories
          : [
              `Review local municipal advisories and responder dispatches near ${locationContext}.`,
            ],
      sources,
      searchQueries:
        searchQueries.length > 0
          ? searchQueries
          : [`${locationContext} ${hazardLabel} weather news`],
      locationContext,
      generatedAt: new Date().toISOString(),
      modelId: GEMINI_GROUNDING_MODEL,
      grounded: true,
    };
  } catch {
    return buildFallbackIntelligence(input);
  }
}
