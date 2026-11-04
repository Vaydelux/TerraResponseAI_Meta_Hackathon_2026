// src/components/map/IncidentPanel.tsx
//
// Decongested Floating Incident Inspector on the Tactical Map:
// Renders an elegant Material 3 preview card with soft elevation, and connects
// to the IncidentDetailsDialog modal to avoid congested on-screen interfaces.

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Cpu,
  ShieldCheck,
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Maximize2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "@/components/report/ReportThumb";
import { ShareReportButton } from "@/components/report/ShareReportButton";
import { IncidentDetailsDialog } from "./IncidentDetailsDialog";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { toast } from "@/components/ui-tr";
import { cn } from "@/lib/utils";

export interface IncidentPanelData {
  id: string;
  status: string;
  review_outcome: string | null;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  location_label: string | null;
  uploaded_at: string;
  priority_score: number | null;
  severity?: number | null;
  incidentType?: string | null;
  summary?: string | null;
}

export interface IncidentPanelProps {
  report: IncidentPanelData;
  reviewerName?: string | null;
  canReview?: boolean;
  onClose?: () => void;
  className?: string;
}

const INCIDENT_LABEL: Record<string, string> = {
  flooding: "Flash Flooding & Inundation",
  blocked_road: "Blocked Access Corridor",
  debris: "Fallen Tree & Debris",
  visible_structural_damage: "Structural Damage",
  medical: "Rescue & Medical Triage",
  fire: "Fire & Smoke Hazard",
  other: "Field Hazard Observation",
  unclear: "Unclassified Field Report",
};

export function IncidentPanel({
  report,
  reviewerName,
  canReview = false,
  onClose,
  className,
}: IncidentPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const state = stateFromReport({ status: report.status, reviewOutcome: report.review_outcome });
  const sev = toSeverityLevel(report.severity);
  const title =
    report.title ||
    (report.incidentType
      ? INCIDENT_LABEL[report.incidentType] ?? report.incidentType
      : `Report #TR-${report.id.slice(0, 6).toUpperCase()}`);
  const locText =
    report.location_label ||
    `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`;

  const targetHref =
    canReview && report.status !== "reviewed"
      ? `/review/${report.id}`
      : `/reports/${report.id}`;

  function handleQuickDispatch() {
    setDispatched(true);
    toast.success(`Dispatched field triage packet for ${title}`);
  }

  return (
    <>
      <aside
        className={cn(
          "tactical-incident-card",
          "absolute z-30 w-[360px] max-w-[calc(100%-32px)]",
          "bottom-24 left-4 sm:bottom-24 sm:left-4",
          "bg-slate-950/95 dark:bg-[#0B141A]/95 backdrop-blur-xl",
          "border border-slate-700/80 dark:border-slate-800",
          "rounded-2xl shadow-2xl shadow-black/80 text-slate-100",
          "transition-all duration-200 ease-out",
          className,
        )}
        aria-label="Selected incident preview"
      >
        <div className="p-4 flex flex-col gap-3">
          {/* Header Row: Severity Pill + Status + Expand in Modal & Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {sev >= 4 ? (
                <Badge className="bg-red-600/90 text-white border-0 font-bold px-2 py-0.5 text-[10px] tracking-wide uppercase">
                  <AlertTriangle className="size-3 mr-1" />
                  Sev {sev}/5 Critical
                </Badge>
              ) : (
                <Badge className="bg-amber-500/90 text-slate-950 border-0 font-bold px-2 py-0.5 text-[10px] tracking-wide uppercase">
                  Sev {sev}/5
                </Badge>
              )}

              <Badge
                variant="outline"
                className={cn(
                  "border px-2 py-0.5 text-[10px] font-semibold bg-slate-900/80",
                  state === "confirmed"
                    ? "border-emerald-500/60 text-emerald-400"
                    : "border-slate-700 text-slate-300",
                )}
              >
                {state === "confirmed" ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-400" />
                    Verified
                  </span>
                ) : (
                  "Needs Review"
                )}
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setModalOpen(true)}
                className="size-7 rounded-full text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/80 shrink-0"
                title="Expand incident details in modal"
                aria-label="Expand in modal"
              >
                <Maximize2 className="size-3.5" />
              </Button>

              {onClose && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close incident details"
                  className="size-7 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 shrink-0"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Title + Location Line */}
          <div>
            <h3 className="text-base font-bold text-white tracking-tight leading-snug line-clamp-1">
              {title}
            </h3>
            <p className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5 truncate">
              <MapPin className="size-3 text-cyan-400 shrink-0" />
              <span className="truncate">{locText}</span>
            </p>
          </div>

          {/* Compact Photo Preview with AI overlay */}
          <div
            className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-slate-800 bg-slate-900 cursor-pointer group"
            onClick={() => setModalOpen(true)}
            title="Click to view full photo and SAM 3.1 masks in modal"
          >
            <ReportThumb
              reportId={report.id}
              state={state}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />

            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300 flex items-center gap-1">
                <Cpu className="size-3 text-cyan-400" />
                Meta AI Vision
              </span>
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-slate-300">
              <span className="font-mono text-cyan-400 font-semibold">
                Priority: {report.priority_score ?? 65}/100
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Maximize2 className="size-3" /> Expand
              </span>
            </div>
          </div>

          {/* Actions Row */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-bold text-xs h-9 rounded-lg"
            >
              <Maximize2 className="size-3.5 mr-1.5" />
              Inspect Details
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleQuickDispatch}
              disabled={dispatched}
              className={`h-9 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                dispatched
                  ? "bg-emerald-950/50 border-emerald-700/60 text-emerald-300"
                  : "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Send className="size-3.5 mr-1" />
              {dispatched ? "Dispatched" : "Dispatch"}
            </Button>

            <ShareReportButton
              reportId={report.id}
              title={title}
              className="size-9 p-0 rounded-lg shrink-0 border border-slate-700 text-slate-300 hover:bg-slate-800"
            />
          </div>
        </div>
      </aside>

      {/* Spacious Material 3 Modal Dialog for deep inspection */}
      <IncidentDetailsDialog
        report={report}
        open={modalOpen}
        onOpenChange={setModalOpen}
        reviewerName={reviewerName}
        canReview={canReview}
      />
    </>
  );
}
