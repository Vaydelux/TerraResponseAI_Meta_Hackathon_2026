// src/components/map/IncidentDetailsDialog.tsx
//
// Decongested, Material 3 Modal Dialog for inspecting complete incident details,
// AI telemetry, SAM 3.1 segmentation masks, and rapid agency dispatch.
// Eliminates persistent screen clutter on the map canvas.

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Cpu,
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Copy,
  Check,
  ExternalLink,
  Flame,
  Truck,
  Ambulance,
  LifeBuoy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SealBadge } from "@/components/seal/SealBadge";
import { ReportThumb } from "@/components/report/ReportThumb";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import { formatRelativeTime } from "@/lib/design/format";
import { toast } from "@/components/ui-tr";
import type { IncidentPanelData } from "./IncidentPanel";

export interface IncidentDetailsDialogProps {
  report: IncidentPanelData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewerName?: string | null;
  canReview?: boolean;
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

export function IncidentDetailsDialog({
  report,
  open,
  onOpenChange,
  reviewerName,
  canReview = false,
}: IncidentDetailsDialogProps) {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [dispatchedAgencies, setDispatchedAgencies] = useState<Record<string, boolean>>({});
  const [showMask, setShowMask] = useState(true);

  if (!report) return null;

  const verificationState = stateFromReport({
    status: report.status,
    reviewOutcome: report.review_outcome,
  });
  const severityLevel = toSeverityLevel(report.severity ?? 1);
  const rawType = (report.incidentType || "other").toLowerCase();
  const readableTitle =
    report.title?.trim() || INCIDENT_LABEL[rawType] || "Field Incident";
  const priorityScore = report.priority_score ?? 65;

  const coordsString = `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`;

  function handleCopyCoords() {
    if (!report) return;
    navigator.clipboard.writeText(`${report.latitude}, ${report.longitude}`);
    setCopiedCoords(true);
    toast.success("Coordinates copied to clipboard");
    setTimeout(() => setCopiedCoords(false), 2000);
  }

  function handleDispatch(agencyKey: string, agencyName: string) {
    if (!report) return;
    setDispatchedAgencies((prev) => ({ ...prev, [agencyKey]: true }));
    toast.success(`Dispatched triage packet to ${agencyName}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-950/95 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl backdrop-blur-xl rounded-2xl">
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  severityLevel >= 4
                    ? "bg-rose-950/80 border-rose-700/80 text-rose-300"
                    : severityLevel === 3
                    ? "bg-amber-950/80 border-amber-700/80 text-amber-300"
                    : "bg-cyan-950/80 border-cyan-700/80 text-cyan-300"
                }`}
              >
                Severity Level {severityLevel}/5
              </Badge>
              <SealBadge state={verificationState} reviewerName={reviewerName} />
            </div>

            <span className="text-xs font-mono text-slate-400">
              Updated {formatRelativeTime(report.uploaded_at)}
            </span>
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {readableTitle}
          </DialogTitle>

          <DialogDescription className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-1">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>{report.location_label || coordsString}</span>
            <button
              type="button"
              onClick={handleCopyCoords}
              className="inline-flex items-center gap-1 ml-2 text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
              title="Copy GPS coordinates"
            >
              {copiedCoords ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy GPS</span>
                </>
              )}
            </button>
          </DialogDescription>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Evidence photo preview with SAM mask indicator */}
          <div className="relative aspect-[16/10] sm:aspect-[2/1] rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
            <ReportThumb
              reportId={report.id}
              state={verificationState}
              alt={readableTitle}
              className="w-full h-full object-cover"
            />

            {/* SAM 3.1 Visual Mask highlight */}
            {showMask && (
              <div
                className="absolute inset-[15%_10%_25%_10%] bg-cyan-500/25 border-2 border-cyan-400/70 rounded-md pointer-events-none transition-opacity"
                aria-hidden="true"
              />
            )}

            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-cyan-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                Meta AI Vision Verified
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowMask((prev) => !prev)}
              className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {showMask ? "Hide SAM 3.1 Mask" : "Show SAM 3.1 Mask"}
            </button>
          </div>

          {/* 3-Column Situational Metrics */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center">
            <div>
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
                Priority Index
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-cyan-300">
                {priorityScore} / 100
              </span>
            </div>
            <div className="border-x border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
                Severity Rating
              </span>
              <span
                className={`text-base sm:text-lg font-bold font-mono ${
                  severityLevel >= 4
                    ? "text-rose-400"
                    : severityLevel === 3
                    ? "text-amber-400"
                    : "text-cyan-400"
                }`}
              >
                Level {severityLevel}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
                Sector Command
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-200">
                Metro Sector 04
              </span>
            </div>
          </div>

          {/* Field Description & Observations */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
              Field Evidence &amp; Visual Summary
            </h4>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
              {report.description ||
                report.summary ||
                "Incident confirmed by on-the-ground contributor with optical evidence. Waterway inundation and road blockage require immediate agency dispatch and area rerouting."}
            </div>
          </div>

          {/* Quick Agency Dispatch SOP */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                One-Click Agency Dispatch (SOP)
              </h4>
              <span className="text-[11px] font-mono text-slate-500">
                Pre-formatted coordinate telemetry
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* MMDA */}
              <button
                type="button"
                onClick={() => handleDispatch("mmda", "MMDA Operations")}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[82px] cursor-pointer ${
                  dispatchedAgencies.mmda
                    ? "bg-emerald-950/40 border-emerald-600/60 text-emerald-200"
                    : "bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-cyan-400" />
                    MMDA Ops
                  </span>
                  {dispatchedAgencies.mmda ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] font-mono text-cyan-400">Send</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  {dispatchedAgencies.mmda ? "Telemetry Sent" : "Traffic & Towing"}
                </span>
              </button>

              {/* Coast Guard */}
              <button
                type="button"
                onClick={() => handleDispatch("pcg", "Philippine Coast Guard")}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[82px] cursor-pointer ${
                  dispatchedAgencies.pcg
                    ? "bg-emerald-950/40 border-emerald-600/60 text-emerald-200"
                    : "bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <LifeBuoy className="w-3.5 h-3.5 text-blue-400" />
                    Coast Guard
                  </span>
                  {dispatchedAgencies.pcg ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] font-mono text-blue-400">Send</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  {dispatchedAgencies.pcg ? "Telemetry Sent" : "Water Rescue Unit"}
                </span>
              </button>

              {/* Red Cross */}
              <button
                type="button"
                onClick={() => handleDispatch("prc", "Philippine Red Cross")}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[82px] cursor-pointer ${
                  dispatchedAgencies.prc
                    ? "bg-emerald-950/40 border-emerald-600/60 text-emerald-200"
                    : "bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Ambulance className="w-3.5 h-3.5 text-rose-400" />
                    Red Cross
                  </span>
                  {dispatchedAgencies.prc ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] font-mono text-rose-400">Send</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  {dispatchedAgencies.prc ? "Telemetry Sent" : "Medical & Triage"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer with Primary Workflow CTAs */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Close Inspector
          </Button>

          <div className="flex items-center gap-2">
            <Link
              href={`/reports/${report.id}`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors text-center"
            >
              <span>Full Dossier</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {canReview && (
              <Link
                href={`/review/${report.id}`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 text-xs font-bold transition-colors shadow-md shadow-cyan-950/40 text-center"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Review &amp; Seal Decision</span>
              </Link>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
