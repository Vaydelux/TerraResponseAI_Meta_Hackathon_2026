"use client";

// src/components/review/ContextualIntelligenceCard.tsx
//
// Sidebar card on the Review Workbench surfacing real-time Google Search
// grounded contextual intelligence (weather alerts, local news reports,
// and situational advisories) for the incident's location.
//
// Styled with the unified `.panel.context-card` classes from components.css
// and canonical design tokens (`--ink`, `--rule`, `--sheet`, `--tide`).

import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  CloudRain,
  Newspaper,
  ExternalLink,
  RefreshCw,
  MapPin,
  Search,
  ShieldAlert,
} from "lucide-react";
import type { ContextualIntelligenceData } from "@/lib/ai/contextual-intelligence";

export interface ContextualIntelligenceCardProps {
  reportId: string;
  initialContext?: ContextualIntelligenceData | null;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  incidentType?: string | null;
}

export function ContextualIntelligenceCard({
  reportId,
  initialContext = null,
  locationLabel = null,
  latitude = null,
  longitude = null,
  incidentType = null,
}: ContextualIntelligenceCardProps) {
  const [contextData, setContextData] = useState<ContextualIntelligenceData | null>(
    initialContext,
  );
  const [loading, setLoading] = useState<boolean>(!initialContext);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(
    async (forceRefresh: boolean) => {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(`/api/reports/${reportId}/context`, {
          method: forceRefresh ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) {
          throw new Error(
            payload?.error?.message ?? "Could not load contextual intelligence.",
          );
        }
        setContextData(payload.contextualIntelligence ?? null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to retrieve Google Search context.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [reportId],
  );

  useEffect(() => {
    if (initialContext) {
      // Preserve server-provided context without changing the existing render flow.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContextData(initialContext);
      setLoading(false);
      return;
    }
    void loadContext(false);
  }, [initialContext, loadContext]);

  const fallbackCoordLabel =
    locationLabel ||
    (typeof latitude === "number" && typeof longitude === "number"
      ? `Latitude ${latitude.toFixed(4)}, longitude ${longitude.toFixed(4)}`
      : "Location not provided");

  return (
    <aside
      className="panel context-card"
      data-testid="contextual-intelligence-card"
      aria-label="External situational context and source status"
    >
      {/* Header */}
      <div className="context-card__head">
        <div className="context-card__title-group">
          <span className="context-card__icon" aria-hidden="true">
            <Globe size={16} />
          </span>
          <div>
            <h3 className="context-card__title">Contextual Intelligence</h3>
            <div className="context-card__meta">
              <MapPin size={12} aria-hidden="true" />
              <span>{contextData?.locationContext ?? fallbackCoordLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                {contextData?.grounded
                  ? "Google Search Grounded"
                  : "Live sources not verified"}
              </span>
              {incidentType ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{incidentType.replace(/_/g, " ")}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => void loadContext(true)}
          disabled={loading || refreshing}
          data-testid="refresh-contextual-intelligence"
          aria-label="Refresh Google Search contextual intelligence"
          title="Refresh real-time weather & news context"
        >
          <RefreshCw
            size={13}
            className={refreshing || loading ? "animate-spin" : undefined}
            aria-hidden="true"
          />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && !contextData ? (
        <div
          className="t-meta"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            padding: "var(--s-3)",
            background: "var(--sheet-sunk)",
            borderRadius: "var(--r-ctl)",
          }}
          data-testid="contextual-intelligence-loading"
        >
          <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
          <span>Querying Google Search for local weather alerts & news reports…</span>
        </div>
      ) : null}

      {/* Error state */}
      {error && !contextData ? (
        <div
          className="t-meta"
          style={{
            padding: "var(--s-3)",
            background: "var(--sheet-sunk)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-ctl)",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Main content */}
      {contextData ? (
        <>
          {/* Situational Summary */}
          <p
            className="context-card__summary"
            data-testid="contextual-intelligence-summary"
          >
            {contextData.summary}
          </p>

          {/* Weather & Hydro-Meteorological Alerts */}
          {contextData.weatherAlerts.length > 0 ? (
            <div className="context-card__section">
              <div className="context-card__section-title">
                <CloudRain size={14} aria-hidden="true" />
                <span>Weather & Hydro-Meteorological Alerts</span>
              </div>
              <ul
                className="context-card__list"
                data-testid="contextual-intelligence-weather"
              >
                {contextData.weatherAlerts.map((alert, idx) => (
                  <li key={idx}>{alert}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Local News & Situational Advisories */}
          {contextData.localNewsAndAdvisories.length > 0 ? (
            <div className="context-card__section">
              <div className="context-card__section-title">
                <Newspaper size={14} aria-hidden="true" />
                <span>Local News & Situational Reports</span>
              </div>
              <ul
                className="context-card__list"
                data-testid="contextual-intelligence-news"
              >
                {contextData.localNewsAndAdvisories.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Grounded Web Citations */}
          {contextData.sources.length > 0 ? (
            <div className="context-card__section">
              <div className="context-card__section-title">
                <Search size={14} aria-hidden="true" />
                <span>Grounded Web Sources</span>
              </div>
              <div
                className="context-card__sources"
                data-testid="contextual-intelligence-sources"
              >
                {contextData.sources.map((src, idx) => (
                  <a
                    key={`${src.uri}-${idx}`}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="context-card__source-link"
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "240px",
                      }}
                    >
                      {src.title}
                    </span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Epistemic separation notice */}
      <div className="context-card__foot">
        <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <span>
          {contextData?.grounded
            ? "Source-linked external context is separate from the photo observation. Verify each advisory with its publisher before acting."
            : "No independently retrieved live advisories are available. This panel is not a verified alert or a substitute for official warnings."}
        </span>
      </div>
    </aside>
  );
}
