// src/components/review/WeatherContext.tsx
//
// Weather Context panel — displays a 24-hour weather forecast for the
// report's confirmed location, sourced from Open-Meteo via the
// application's own /api/weather endpoint (server-side proxy).
//
// Per the design thesis: weather is SUPPORTING CONTEXT, not evidence.
// The panel is visually distinct from the AI observation (it uses the
// tide-wash background, not the amber hatched treatment). It never
// implies the forecast caused or worsened the disaster.
//
// Client component — fetches the weather on mount via the API route.

"use client";

import { useEffect, useState } from "react";
import type { WeatherForecast } from "@/lib/weather/open-meteo";
import { weatherCodeLabel } from "@/lib/weather/open-meteo";

export interface WeatherContextProps {
  reportId: string;
  hasLocation: boolean;
}

export function WeatherContext({ reportId, hasLocation }: WeatherContextProps) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<"NO_LOCATION" | "RETENTION_BLOCKED" | null>(!hasLocation ? "NO_LOCATION" : null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!hasLocation) {
      queueMicrotask(() => {
        setLoading(false);
        setUnavailableReason("NO_LOCATION");
      });
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError(null);
        setUnavailableReason(null);
        setWeather(null);
      }
    });
    async function load() {
      try {
        const res = await fetch(`/api/weather?reportId=${encodeURIComponent(reportId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body?.error?.message ?? "Weather unavailable");
          setLoading(false);
          return;
        }
        if (body.weather === null) {
          setUnavailableReason(body.reason === "RETENTION_BLOCKED" ? "RETENTION_BLOCKED" : "NO_LOCATION");
          setLoading(false);
          return;
        }
        setWeather(body.weather);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load weather context.");
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [reportId, hasLocation, retryCount]);

  if (unavailableReason) {
    return (
      <div className="panel panel--sunk" style={{ marginTop: "var(--s-4)" }}>
        <h3 className="obs__section-title">Weather context</h3>
        <p className="t-meta">
          {unavailableReason === "RETENTION_BLOCKED"
            ? "Weather context is unavailable because this report is no longer active."
            : "This report has no confirmed location. Weather context is unavailable until GPS or a manual pin is provided."}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel panel--sunk" style={{ marginTop: "var(--s-4)" }}>
        <h3 className="obs__section-title">Weather context</h3>
        <div className="skeleton" style={{ height: 48, width: "100%" }} />
        <div className="skeleton" style={{ height: 32, width: "60%", marginTop: "var(--s-2)" }} />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="panel panel--sunk" style={{ marginTop: "var(--s-4)" }}>
        <h3 className="obs__section-title">Weather context</h3>
        <p className="t-meta" style={{ color: "var(--ink-3)" }}>
          {error ?? "Weather forecast is temporarily unavailable. The report is still fully usable."}
        </p>
        <button type="button" className="btn" style={{ marginTop: "var(--s-3)" }}
          onClick={() => setRetryCount((count) => count + 1)}>
          Retry weather forecast
        </button>
      </div>
    );
  }

  const condition = weather.current.weatherCode !== null
    ? weatherCodeLabel(weather.current.weatherCode)
    : "—";

  return (
    <div
      className="panel"
      style={{
        marginTop: "var(--s-4)",
        background: "var(--tide-wash)",
        borderColor: "rgba(11,101,116,0.2)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--s-3)",
        }}
      >
        <h3 className="obs__section-title" style={{ margin: 0 }}>
          Weather near this incident
        </h3>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 10px",
            borderRadius: "var(--r-pill)",
            background: "var(--sheet)",
            border: "1px solid var(--rule)",
            fontSize: "var(--step--1)",
            fontWeight: 600,
            color: "var(--ink-2)",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--tide)" strokeWidth={2} aria-hidden="true">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 6v6l4 2" />
          </svg>
          {weather.provider} · {weather.providerModel}
        </span>
      </div>

      {/* Current conditions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "var(--s-3)",
          marginBottom: "var(--s-4)",
        }}
      >
        <WeatherMetric label="Conditions" value={condition} />
        <WeatherMetric label="Temperature" value={weather.current.temperature !== null ? `${Math.round(weather.current.temperature)}°C` : "—"} />
        <WeatherMetric label="Wind" value={weather.current.windSpeed !== null ? `${Math.round(weather.current.windSpeed)} km/h` : "—"} />
        <WeatherMetric label="Gusts" value={weather.current.windGusts !== null ? `${Math.round(weather.current.windGusts)} km/h` : "—"} />
      </div>

      {/* 24-hour outlook */}
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "var(--s-3)" }}>
        <div className="t-label" style={{ marginBottom: "var(--s-2)" }}>
          Next 24 hours
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
            gap: "var(--s-3)",
          }}
        >
          <WeatherMetric
            label="Total rainfall"
            value={`${weather.daily24h.totalPrecipitation} mm`}
            highlight={weather.daily24h.totalPrecipitation > 10}
          />
          <WeatherMetric
            label="Max precip prob."
            value={`${weather.daily24h.maxPrecipitationProbability}%`}
          />
          <WeatherMetric label="Max wind" value={`${weather.daily24h.maxWindSpeed} km/h`} />
          <WeatherMetric label="Max gusts" value={`${weather.daily24h.maxWindGusts} km/h`} />
        </div>
      </div>

      {/* Contextual statement — supporting, not prescriptive */}
      {weather.daily24h.totalPrecipitation > 5 && (
        <div
          className="well-uncertain"
          style={{
            marginTop: "var(--s-3)",
            padding: "var(--s-3)",
            border: "1px dashed var(--rule-strong)",
            borderRadius: 8,
          }}
        >
          <p className="t-meta" style={{ color: "var(--ink-2)" }}>
            Additional rainfall is forecast near this report&apos;s location.
            Reviewers may wish to check whether local conditions have changed
            since the photograph was captured.
          </p>
        </div>
      )}

      {/* Provider attribution + valid time */}
      <div
        style={{
          marginTop: "var(--s-3)",
          paddingTop: "var(--s-2)",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--s-1)",
        }}
      >
        <span className="t-meta">
          Forecast valid: {new Date(weather.validFrom).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short", timeZone: weather.timezone })} — {new Date(weather.validUntil).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short", timeZone: weather.timezone })}
        </span>
        <span className="t-meta">
          {weather.timezone} · Retrieved {new Date(weather.retrievedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: weather.timezone })}
        </span>
      </div>

      {/* Separation statement — weather is NOT evidence */}
      <p
        className="t-meta"
        style={{
          marginTop: "var(--s-2)",
          fontSize: "var(--step--1)",
          color: "var(--ink-3)",
          fontStyle: "italic",
        }}
      >
        Weather context is a forecast for the location, not evidence from the photo.
        It does not confirm or deny the incident.
      </p>
    </div>
  );
}

function WeatherMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="t-label" style={{ fontSize: "var(--step--1)", marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="num"
        style={{
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: "var(--step-1)",
          color: highlight ? "var(--tide)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
