import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { validPoint, type PlaceSearchResult } from "@/lib/map/location-search";

/**
 * User-initiated place lookup only. No evidence, report content or account
 * details are forwarded to the provider. MapTiler key stays on the server.
 * Coordinate search itself runs in the browser and needs no provider.
 */
export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to search places." } }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-origin search blocked." } }, { status: 403 });
  }
  const payload: unknown = await request.json().catch(() => null);
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>).query : null;
  const query = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (query.length < 3 || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return NextResponse.json({ error: { code: "INVALID_QUERY", message: "Enter 3–100 characters to search for a place." } }, { status: 400 });
  }

  const key = process.env.MAPTILER_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: {
      code: "GEOCODING_NOT_CONFIGURED",
      message: "Address search is not configured. Map pinning and coordinate search are still available.",
    } }, { status: 503 });
  }

  // Best-effort single-instance rate limit; the provider account's quota is
  // the authoritative cap across multiple serverless instances.
  const limitKey = user.id;
  const now = Date.now();
  const current = queries.get(limitKey);
  const next = current && now - current.start < 60_000
    ? { start: current.start, count: current.count + 1 }
    : { start: now, count: 1 };
  queries.set(limitKey, next);
  if (queries.size > 1500) {
    for (const [id, entry] of queries) if (now - entry.start > 60_000) queries.delete(id);
  }
  if (next.count > 15) {
    return NextResponse.json({ error: { code: "RATE_LIMIT", message: "Too many place searches. Try again shortly." } }, { status: 429 });
  }

  const url = new URL("https://api.maptiler.com/geocoding/" + encodeURIComponent(query) + ".json");
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "5");
  url.searchParams.set("language", "en");
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(6500) });
    if (!response.ok) {
      return NextResponse.json({ error: { code: "GEOCODING_UNAVAILABLE", message: "Place search is unavailable. You can still pick a point on the map." } }, { status: 502 });
    }
    const json: unknown = await response.json();
    const features = json && typeof json === "object" && Array.isArray((json as { features?: unknown }).features)
      ? (json as { features: unknown[] }).features : [];
    const places: PlaceSearchResult[] = features.slice(0, 5).flatMap((rawFeature, index) => {
      if (!rawFeature || typeof rawFeature !== "object") return [];
      const item = rawFeature as Record<string, unknown>;
      const center = item.center;
      if (!Array.isArray(center) || center.length < 2) return [];
      const [lon, lat] = center;
      if (typeof lat !== "number" || typeof lon !== "number" || !validPoint(lat, lon)) return [];
      const label = typeof item.place_name === "string" ? item.place_name
        : typeof item.text === "string" ? item.text : "";
      if (!label.trim()) return [];
      return [{
        id: typeof item.id === "string" ? item.id.slice(0, 120) : "place-" + index,
        label: label.slice(0, 180), lat, lon, source: "maptiler" as const,
      }];
    });
    return NextResponse.json({ ok: true, places, attribution: "Search © MapTiler" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "GEOCODING_UNAVAILABLE", message: "Place search timed out. Try coordinates or tap the map." } }, { status: 503 });
  }
}

const queries = new Map<string, { start: number; count: number }>();
