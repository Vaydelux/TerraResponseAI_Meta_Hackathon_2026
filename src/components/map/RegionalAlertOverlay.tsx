"use client";

// src/components/map/RegionalAlertOverlay.tsx
//
// Small, dismissible notification overlay within the Map view that
// surfaces high-priority localized weather or seismic alerts fetched
// from Google Search Grounding when a user pans to a new region.
//
// Uses Framer Motion (`AnimatePresence`, `motion.aside`) for smooth
// entrance and dismissal transitions.

import { motion, AnimatePresence } from "framer-motion";
import {
  CloudLightning,
  Activity,
  X,
  ExternalLink,
  RefreshCw,
  Globe,
} from "lucide-react";
import type { RegionalHazardAlert } from "@/app/api/map/alerts/route";

export interface RegionalAlertOverlayProps {
  alert: RegionalHazardAlert | null;
  loading?: boolean;
  dismissed?: boolean;
  onDismiss: () => void;
  onRefreshRegion: () => void;
}

export function RegionalAlertOverlay({
  alert,
  loading = false,
  dismissed = false,
  onDismiss,
  onRefreshRegion,
}: RegionalAlertOverlayProps) {
  const showCard = !dismissed && (loading || alert !== null);

  return (
    <div className="map-alert-anchor" data-testid="regional-alert-container">
      <AnimatePresence mode="wait">
        {showCard ? (
          <motion.aside
            key={alert?.id ?? "loading-regional-alert"}
            className="map-alert-overlay"
            data-severity={alert?.severity ?? "warning"}
            data-testid="regional-alert-overlay"
            role="status"
            aria-live="polite"
            aria-label="Localized weather and seismic alert notification"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="map-alert-overlay__head">
              <div className="map-alert-overlay__title-row">
                <span className="map-alert-overlay__icon" aria-hidden="true">
                  {alert?.category === "seismic" ? (
                    <Activity size={15} />
                  ) : (
                    <CloudLightning size={15} />
                  )}
                </span>
                <div className="map-alert-overlay__meta">
                  <span className="map-alert-overlay__kicker">
                    {alert?.category === "seismic"
                      ? "Seismic Alert"
                      : alert?.category === "combined"
                        ? "Weather & Seismic Alert"
                        : "Weather Alert"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="map-alert-overlay__grounding">
                    <Globe size={11} aria-hidden="true" />
                    {alert?.grounded ? "Google Search Grounded" : "Search Grounding"}
                  </span>
                </div>
              </div>

              <div className="map-alert-overlay__actions">
                <button
                  type="button"
                  className="map-alert-overlay__icon-btn"
                  onClick={onRefreshRegion}
                  disabled={loading}
                  title="Refresh regional alert for current map sector"
                  aria-label="Refresh regional weather or seismic alert"
                  data-testid="refresh-regional-alert"
                >
                  <RefreshCw
                    size={13}
                    className={loading ? "animate-spin" : undefined}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  className="map-alert-overlay__icon-btn"
                  onClick={onDismiss}
                  title="Dismiss alert notification"
                  aria-label="Dismiss regional alert"
                  data-testid="dismiss-regional-alert"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {loading && !alert ? (
              <p className="map-alert-overlay__detail" data-testid="regional-alert-loading">
                Scanning panned region via Google Search Grounding for active weather or seismic advisories…
              </p>
            ) : alert ? (
              <>
                <h4 className="map-alert-overlay__headline" data-testid="regional-alert-headline">
                  {alert.headline}
                </h4>
                <p className="map-alert-overlay__detail" data-testid="regional-alert-detail">
                  {alert.detail}
                </p>
                <div className="map-alert-overlay__foot">
                  <span className="map-alert-overlay__coords num">
                    {alert.coordinates.lat.toFixed(3)}°N, {alert.coordinates.lon.toFixed(3)}°E
                  </span>
                  {alert.sources.length > 0 && (
                    <div className="map-alert-overlay__sources">
                      {alert.sources.slice(0, 2).map((src, idx) => (
                        <a
                          key={`${src.uri}-${idx}`}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="map-alert-overlay__source-link"
                        >
                          <span className="map-alert-overlay__source-text">
                            {src.title}
                          </span>
                          <ExternalLink size={11} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </motion.aside>
        ) : (
          <motion.button
            key="reopen-regional-alert"
            type="button"
            className="map-alert-reopen-btn"
            onClick={onRefreshRegion}
            data-testid="reopen-regional-alert"
            aria-label="Show regional weather and seismic alerts"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.16 }}
          >
            <CloudLightning size={13} aria-hidden="true" />
            <span>Region Alerts</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
