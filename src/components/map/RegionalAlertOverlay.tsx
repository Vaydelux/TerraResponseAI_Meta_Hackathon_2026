// src/components/map/RegionalAlertOverlay.tsx
//
// Non-intrusive, dismissible notification overlay for localized weather
// and seismic alerts (Google Search Grounding). Instead of blocking the
// map pins with an oversized box, it renders a sleek floating alert chip
// that expands into a readable dialog upon user request.

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudLightning,
  Activity,
  X,
  ExternalLink,
  RefreshCw,
  Globe,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  const [modalOpen, setModalOpen] = useState(false);
  const showCard = !dismissed && (loading || alert !== null);

  return (
    <>
      <div
        className="grid min-w-0 max-w-full"
        data-testid="regional-alert-container"
      >
        <AnimatePresence mode="wait">
          {showCard ? (
            <motion.div
              key={alert?.id ?? "loading-regional-alert"}
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex items-center gap-2 p-1.5 pl-3 pr-2 rounded-xl text-xs font-medium shadow-lg backdrop-blur-md",
                "bg-slate-950/95 dark:bg-[#0B141A]/95 text-slate-100",
                alert?.severity === "critical"
                  ? "border border-red-500/80 shadow-red-950/40"
                  : "border border-amber-500/70 shadow-amber-950/40",
              )}
              role="status"
              aria-live="polite"
              data-testid="regional-alert-overlay"
            >
              <div
                className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                onClick={() => setModalOpen(true)}
              >
                <span
                  className={cn(
                    "size-5 rounded-md flex items-center justify-center shrink-0",
                    alert?.severity === "critical"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400",
                  )}
                  aria-hidden="true"
                >
                  {alert?.category === "seismic" ? (
                    <Activity className="size-3" />
                  ) : (
                    <CloudLightning className="size-3" />
                  )}
                </span>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[11px] text-white truncate">
                      {loading
                        ? "Scanning sector for advisories…"
                        : alert?.category === "seismic"
                          ? "Seismic Advisory"
                          : "Weather Advisory"}
                    </span>
                    <span className="text-[10px] text-teal-400 font-semibold hidden sm:inline">
                      · Grounded
                    </span>
                  </div>
                  {alert && (
                    <span className="text-[10px] text-slate-300 truncate max-w-[220px] sm:max-w-[280px]">
                      {alert.headline}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setModalOpen(true)}
                  className="size-6 rounded-md text-teal-400 hover:text-teal-300 hover:bg-slate-800"
                  title="View full advisory details"
                  aria-label="View advisory details"
                >
                  <Info className="size-3.5" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onRefreshRegion}
                  disabled={loading}
                  className="size-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Refresh advisory"
                  aria-label="Refresh regional alert"
                  data-testid="refresh-regional-alert"
                >
                  <RefreshCw
                    className={cn("size-3", loading && "animate-spin text-teal-400")}
                  />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onDismiss}
                  className="size-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Dismiss alert banner"
                  aria-label="Dismiss alert banner"
                  data-testid="dismiss-regional-alert"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
                className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-slate-950/90 border-slate-800 text-teal-400 hover:bg-slate-850 hover:text-teal-300 shadow-md backdrop-blur-md"
              >
                <Activity className="size-3 mr-1.5" />
                <span>Region Alerts</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Full Alert Details Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 text-slate-100 border-slate-800 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-8 rounded-lg flex items-center justify-center shrink-0",
                  alert?.severity === "critical"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-amber-500/20 text-amber-400",
                )}
              >
                {alert?.category === "seismic" ? (
                  <Activity className="size-4" />
                ) : (
                  <CloudLightning className="size-4" />
                )}
              </span>
              <div>
                <DialogTitle className="text-base font-bold text-white leading-snug">
                  {alert?.headline ?? "Regional Grounding Advisory"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Globe className="size-3 text-teal-400" />
                  <span>Google Search Grounded Telemetry</span>
                  {alert && (
                    <span className="font-mono text-slate-300">
                      · {alert.coordinates.lat.toFixed(3)}°N, {alert.coordinates.lon.toFixed(3)}°E
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed">
              {loading && !alert ? (
                <p className="text-slate-400 italic">
                  Scanning current sector coordinates via Google Search Grounding for active weather or seismic advisories…
                </p>
              ) : (
                alert?.detail ?? "No active critical advisories reported in this map sector."
              )}
            </div>

            {alert && alert.sources && alert.sources.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  Official Verification Sources
                </span>
                <div className="flex flex-col gap-1">
                  {alert.sources.map((src, idx) => (
                    <a
                      key={`${src.uri}-${idx}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      <span className="truncate pr-2 font-medium">{src.title}</span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefreshRegion}
              disabled={loading}
              className="text-xs border-slate-800 text-slate-300 hover:bg-slate-900"
            >
              <RefreshCw className={cn("size-3 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
