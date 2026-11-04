// src/components/map/IncidentPanel.tsx
//
// Floating Selected Incident Inspector card on the Tactical Map
// matching the hackathon reference layout using shadcn & Lucide:
//   - Severity + Verification status header & close button
//   - Title + location line
//   - Photo thumbnail with Meta AI Vision overlay & timestamp bar
//   - 3-column situational metrics grid (Priority, Severity, Sector Lead)
//   - Primary "Review & Verify" / "View Full Report" CTA + "Dispatch Team" + Share
//   - Elevated z-index & positioning above bottom controls to prevent truncation.

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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "@/components/report/ReportThumb";
import { ShareReportButton } from "@/components/report/ShareReportButton";
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
  const aiTag = report.incidentType
    ? INCIDENT_LABEL[report.incidentType] ?? report.incidentType
    : "Flood & Surface Hazard";

  const targetHref =
    canReview && report.status !== "reviewed"
      ? `/review/${report.id}`
      : `/reports/${report.id}`;

  return (
    <aside
      className={cn(
        "tactical-incident-card",
        "absolute z-30 w-[380px] max-w-[calc(100%-32px)]",
        "bottom-24 left-4 sm:bottom-24 sm:left-4",
        "max-h-[calc(100%-110px)] overflow-y-auto",
        "bg-slate-950/95 dark:bg-[#0B141A]/95 backdrop-blur-xl",
        "border border-slate-700/80 dark:border-slate-800",
        "rounded-2xl shadow-2xl shadow-black/80 text-slate-100",
        "transition-all duration-200 ease-out",
        className,
      )}
      aria-label="Selected incident details"
    >
      <div className="p-4 sm:p-5 flex flex-col gap-3.5">
        {/* Header Row: Severity Pill + Status + Close Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {sev >= 4 ? (
              <Badge className="bg-red-600/90 text-white hover:bg-red-600 border-0 font-bold px-2.5 py-1 text-[11px] tracking-wide uppercase shadow-sm">
                <AlertTriangle className="size-3 mr-1" />
                CRITICAL SEVERITY
              </Badge>
            ) : (
              <Badge className="bg-amber-500/90 text-slate-950 hover:bg-amber-500 border-0 font-bold px-2.5 py-1 text-[11px] tracking-wide uppercase shadow-sm">
                SEVERITY {sev} / 5
              </Badge>
            )}

            <Badge
              variant="outline"
              className={cn(
                "border px-2.5 py-1 text-[11px] font-semibold bg-slate-900/80 dark:bg-slate-900/90",
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
                "Status: Needs Review"
              )}
            </Badge>
          </div>

          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close incident details"
              className="size-7 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 shrink-0"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {/* Title & Location */}
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
            {title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300 font-medium">
            <MapPin className="size-3.5 text-teal-400 shrink-0" />
            <span className="truncate">{locText}</span>
          </p>
        </div>

        {/* Media Thumbnail with Meta AI Detected Overlay & Bottom Telemetry Strip */}
        <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900/90 aspect-[16/10] shadow-inner">
          <ReportThumb
            reportId={report.id}
            state={state}
            alt={title}
            className="w-full h-full object-cover"
          />

          {/* Top-left AI Detected Tag */}
          <div className="absolute top-2.5 left-2.5 px-2 py-1 rounded-md bg-slate-950/85 text-teal-300 border border-teal-500/40 text-[11px] font-bold inline-flex items-center gap-1.5 backdrop-blur-md shadow-md">
            <Cpu className="size-3 text-teal-400" />
            <span>AI Detected: {aiTag}</span>
          </div>

          {/* Bottom Telemetry Bar */}
          <div className="absolute inset-x-0 bottom-0 px-3 py-1.5 bg-slate-950/90 text-slate-200 flex items-center justify-between text-[11px] border-t border-slate-800/60 backdrop-blur-md">
            <span>
              Severity <strong className="text-amber-400 font-bold">Level {sev}/5</strong>
            </span>
            <span className="text-slate-400">{formatRelativeTime(report.uploaded_at)}</span>
          </div>
        </div>

        {/* Verification Seal Badge */}
        <SealBadge state={state} reviewerName={reviewerName} />

        {/* Observation Summary */}
        {report.summary && (
          <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5">
            {report.summary}
          </p>
        )}

        {/* 3-Column Situational Telemetry Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90">
            <span className="block text-[10px] font-bold text-slate-400 tracking-wider">
              PRIORITY
            </span>
            <strong className="text-sm font-extrabold text-white">
              {report.priority_score ?? 82} / 100
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90">
            <span className="block text-[10px] font-bold text-slate-400 tracking-wider">
              SEVERITY
            </span>
            <strong
              className={cn(
                "text-sm font-extrabold",
                sev >= 4 ? "text-red-400" : "text-amber-400",
              )}
            >
              Sev {sev} / 5
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90">
            <span className="block text-[10px] font-bold text-slate-400 tracking-wider">
              SECTOR LEAD
            </span>
            <strong className="text-xs font-bold text-slate-200">Metro Sector</strong>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            asChild
            className="flex-1 min-h-[38px] bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow-md shadow-teal-900/40 border-0"
          >
            <Link href={targetHref}>
              <ShieldCheck className="size-4 mr-1.5" />
              <span>
                {canReview && report.status !== "reviewed"
                  ? "Review & Verify (1 Click)"
                  : "View Full Report"}
              </span>
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            className={cn(
              "min-h-[38px] text-xs font-semibold px-3 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white",
              dispatched && "border-teal-500 text-teal-400 bg-teal-950/40",
            )}
            onClick={() => {
              setDispatched((d) => !d);
              toast.success(
                dispatched
                  ? "Cleared dispatch flag."
                  : `Dispatched field response team to ${locText}.`,
              );
            }}
          >
            <Send className="size-3.5 mr-1 text-teal-400" />
            <span>{dispatched ? "Dispatched ✓" : "Dispatch Team"}</span>
          </Button>

          <ShareReportButton
            reportId={report.id}
            title={title}
            variant="quiet"
            size="sm"
          />
        </div>
      </div>
    </aside>
  );
}
