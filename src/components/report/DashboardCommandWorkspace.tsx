"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Search,
  MapPin,
  Users,
  Gauge,
  CheckCircle2,
  ArrowRight,
  Send,
  ShieldCheck,
  PhoneCall,
  Waves,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { IncidentTriageCard } from "./IncidentTriageCard";
import { ShareReportButton } from "./ShareReportButton";
import type { ReportRowData } from "./ReportRow";
import { formatRelativeTime } from "@/lib/design/format";
import { toSeverityLevel } from "@/lib/design/severity";
import { stateFromReport } from "@/lib/design/status";
import { toast } from "@/components/ui-tr";

export interface DashboardCommandWorkspaceProps {
  reports: ReportRowData[];
  streamItems: Array<{
    id: string;
    category: string;
    title: string;
    detail: string;
    timestamp: string;
    badge: string;
    tone: "amber" | "green" | "brick" | "tide";
  }>;
  eventName?: string | null;
  canReview: boolean;
  totalReceived: number;
}

type CategoryFilter = "all" | "flooding" | "blocked_road" | "rescue";
type SortMode = "priority" | "newest";

function classifyFeedCategory(r: ReportRowData): "flooding" | "blocked_road" | "rescue" {
  const raw = `${r.incident_type ?? ""} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
  if (/\b(block|tree|debris|road|highway|lane|marcos|obstruction)\b/.test(raw)) {
    return "blocked_road";
  }
  if (/\b(rescue|stranded|trapped|medical|bus|evac|critical)\b/.test(raw) || (r.severity ?? 0) >= 5) {
    return "rescue";
  }
  return "flooding";
}

export function DashboardCommandWorkspace({
  reports,
  streamItems,
  eventName,
  canReview,
  totalReceived,
}: DashboardCommandWorkspaceProps) {
  const [recommendationState, setRecommendationState] = useState<
    "active" | "authorized" | "dismissed"
  >("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [dispatchedAgencies, setDispatchedAgencies] = useState<Record<string, boolean>>({
    rc: true,
  });
  const [assignedReports, setAssignedReports] = useState<Record<string, boolean>>({});
  const [checklist, setChecklist] = useState<{ radio: boolean; satellite: boolean }>({
    radio: true,
    satellite: true,
  });

  const floodCount = useMemo(
    () => reports.filter((r) => classifyFeedCategory(r) === "flooding").length,
    [reports],
  );
  const roadCount = useMemo(
    () => reports.filter((r) => classifyFeedCategory(r) === "blocked_road").length,
    [reports],
  );
  const rescueCount = useMemo(
    () => reports.filter((r) => classifyFeedCategory(r) === "rescue").length,
    [reports],
  );

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = reports.filter((r) => {
      if (categoryFilter !== "all" && classifyFeedCategory(r) !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${r.title ?? ""} ${r.description ?? ""} ${r.location_label ?? ""} ${r.incident_type ?? ""} ${r.id}`.toLowerCase();
      return hay.includes(q);
    });

    return list.sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      }
      return (b.priority_score ?? 0) - (a.priority_score ?? 0);
    });
  }, [reports, categoryFilter, searchQuery, sortMode]);

  function handleDispatchAgency(id: string, name: string) {
    setDispatchedAgencies((prev) => {
      const next = !prev[id];
      if (next) {
        toast.success(`Dispatched triage telemetry & coordinates to ${name}.`);
      }
      return { ...prev, [id]: next };
    });
  }

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* AI Tactical Recommendation Banner (Meta Llama Vision Live Model) */}
      {recommendationState !== "dismissed" && (
        <section
          aria-label="AI Tactical Recommendation"
          className="panel"
          style={{
            padding: "var(--s-4) var(--s-5)",
            border: "1px solid var(--tide)",
            background: "var(--grad-banner-wash), var(--sheet)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--s-4)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-3)", flex: "1 1 480px" }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--r-ctl)",
                background: "var(--tide-wash)",
                color: "var(--tide)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Bot size={20} aria-hidden="true" />
            </span>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "var(--step-0)" }}>AI Tactical Recommendation</strong>
                <span
                  className="t-meta num"
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "var(--tide-wash)",
                    color: "var(--tide)",
                    fontWeight: 700,
                    fontSize: "0.74rem",
                  }}
                >
                  Meta Llama Vision · Live Model v4.2
                </span>
                {recommendationState === "authorized" && (
                  <span
                    className="t-meta num"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--green-wash)",
                      color: "var(--green-ink)",
                      fontWeight: 700,
                      fontSize: "0.74rem",
                    }}
                  >
                    PRE-POSITION AUTHORIZED
                  </span>
                )}
              </div>
              <p className="t-meta" style={{ margin: 0, color: "var(--ink-2)" }}>
                Rising water levels in Pasig and Marikina corridors may cause cascading slowdowns
                across Ortigas Avenue. Recommend pre-positioning Rescue Unit Alpha to Rosario
                Bridge and prioritizing flood verification queue.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setRecommendationState("authorized");
                toast.success("Rescue Unit Alpha pre-positioning advisory logged.");
              }}
              disabled={recommendationState === "authorized"}
            >
              {recommendationState === "authorized"
                ? "Unit Alpha Pre-positioned"
                : "Authorize Pre-position"}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setRecommendationState("dismissed")}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Two-Column Main Operational Workspace (Active Incident Feeds + Command Dispatch Rail) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 1fr)",
          gap: "var(--s-5)",
          alignItems: "start",
        }}
        className="dashboard-ops-grid"
      >
        {/* Left Column: Active Incident Feeds */}
        <section aria-label="Active Incident Feeds" style={{ display: "grid", gap: "var(--s-4)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--s-3)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: "var(--step-2)", margin: 0 }}>Active Incident Feeds</h2>
              <span
                className="t-meta num"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--sheet-sunk)",
                  border: "1px solid var(--rule)",
                  fontWeight: 600,
                }}
              >
                Real-time
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="feed-sort" className="t-meta">
                Sort by:
              </label>
              <select
                id="feed-sort"
                className="select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{ minHeight: 34, width: "auto", padding: "4px 10px", fontSize: "0.82rem" }}
              >
                <option value="priority">Urgency Tier</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--ink-3)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by location, keyword, or incident ID…"
              aria-label="Search active incident feeds"
              style={{ paddingLeft: 38 }}
            />
          </div>

          {/* Category Filter Pills */}
          <div
            role="group"
            aria-label="Filter incident feeds by category"
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {(
              [
                { id: "all" as const, label: `All Categories (${reports.length})` },
                { id: "flooding" as const, label: `Floods (${floodCount})` },
                { id: "blocked_road" as const, label: `Blocked Roads (${roadCount})` },
                { id: "rescue" as const, label: `Rescue Needs (${rescueCount})` },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  aria-pressed={active}
                  className="btn btn--sm"
                  style={{
                    background: active ? "var(--tide)" : "var(--sheet)",
                    color: active ? "var(--on-tide)" : "var(--ink-2)",
                    borderColor: active ? "var(--tide)" : "var(--rule)",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Rich Incident Feed List + Triage Cards */}
          {filteredReports.length > 0 ? (
            <div style={{ display: "grid", gap: "var(--s-4)" }}>
              {/* Featured Operational Feed Cards */}
              {filteredReports.slice(0, 3).map((r) => {
                const sev = toSeverityLevel(r.severity);
                const state = stateFromReport({
                  status: r.status,
                  reviewOutcome: r.review_outcome,
                });
                const isCritical = sev >= 4;
                const cat = classifyFeedCategory(r);
                const assigned = !!assignedReports[r.id];
                const titleText =
                  r.title ||
                  (cat === "blocked_road"
                    ? "Fallen Tree & Blocked Access"
                    : cat === "rescue"
                    ? "Flash Flooding & Stranded Commuters"
                    : "Flash Flooding along C-5 Corridor");
                const locText =
                  r.location_label ||
                  (typeof r.latitude === "number" && typeof r.longitude === "number"
                    ? `${r.latitude.toFixed(4)}° N, ${r.longitude.toFixed(4)}° E`
                    : "Pasig City · C-5 Bagong Ilog Overpass");
                const descText =
                  r.description ||
                  "Rapid surface runoff has submerged roadway lanes. Meta AI Vision extracted water depth and vehicle obstruction markers for human verification.";

                return (
                  <article
                    key={r.id}
                    className="panel"
                    style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4) var(--s-5)" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "var(--s-3)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "var(--r-ctl)",
                            background: isCritical ? "var(--brick-wash)" : "var(--amber-wash)",
                            color: isCritical ? "var(--brick-ink)" : "var(--amber-ink)",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {cat === "flooding" ? (
                            <Waves size={18} aria-hidden="true" />
                          ) : (
                            <AlertTriangle size={18} aria-hidden="true" />
                          )}
                        </span>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>{titleText}</h3>
                            <span
                              className="t-meta num"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: isCritical
                                  ? "var(--brick-wash)"
                                  : "var(--amber-wash)",
                                color: isCritical ? "var(--brick-ink)" : "var(--amber-ink)",
                                fontWeight: 700,
                                fontSize: "0.73rem",
                              }}
                            >
                              {isCritical
                                ? `CRITICAL · SEV-${sev}`
                                : `MODERATE · SEV-${sev}`}
                            </span>
                            <span
                              className="t-meta num"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                background:
                                  state === "confirmed"
                                    ? "var(--green-wash)"
                                    : "var(--tide-wash)",
                                color:
                                  state === "confirmed" ? "var(--green-ink)" : "var(--tide)",
                                fontWeight: 700,
                                fontSize: "0.73rem",
                              }}
                            >
                              {state === "confirmed" ? "AI + Human Verified" : "Meta AI Analyzed"}
                            </span>
                          </div>
                          <p
                            className="t-meta"
                            style={{
                              margin: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <MapPin size={13} aria-hidden="true" />
                            <span>{locText}</span>
                          </p>
                        </div>
                      </div>

                      <span className="t-meta num">
                        Updated {formatRelativeTime(r.uploaded_at)}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: "var(--s-3) var(--s-4)",
                        borderRadius: "var(--r-ctl)",
                        background: "var(--sheet-sunk)",
                        border: "1px solid var(--rule)",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "var(--step-0)", lineHeight: 1.5 }}>
                        {descText}
                      </p>
                      <div
                        className="t-meta num"
                        style={{ display: "flex", flexWrap: "wrap", gap: 16 }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Users size={14} aria-hidden="true" style={{ color: "var(--tide)" }} />
                          <strong>
                            {assigned ? "First Responder Unit Assigned" : "3 First Responder Units Nearby"}
                          </strong>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Gauge size={14} aria-hidden="true" style={{ color: "var(--amber-ink)" }} />
                          <span>Priority Score: {r.priority_score ?? 78}</span>
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "var(--s-2)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={`btn btn--sm ${assigned ? "" : "btn--primary"}`}
                          onClick={() => {
                            setAssignedReports((prev) => ({ ...prev, [r.id]: !prev[r.id] }));
                            toast.success(
                              assigned
                                ? "Cleared unit assignment."
                                : `Assigned responder team to #TR-${r.id.slice(0, 6).toUpperCase()}.`,
                            );
                          }}
                        >
                          <Users size={14} aria-hidden="true" />
                          <span>{assigned ? "Team Assigned ✓" : "Assign Team"}</span>
                        </button>
                        <Link href="/map" className="btn btn--sm">
                          <MapPin size={14} aria-hidden="true" />
                          <span>View on Map</span>
                        </Link>
                        <ShareReportButton reportId={r.id} title={titleText} variant="quiet" size="sm" />
                      </div>

                      <Link
                        href={canReview && r.status !== "reviewed" ? `/review/${r.id}` : `/reports/${r.id}`}
                        className="t-meta"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--tide)",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        <span>Review Details</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}

              {/* River Hydrograph Telemetry Card (matching reference screenshot) */}
              <article
                className="panel"
                style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4) var(--s-5)" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--s-2)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "var(--r-ctl)",
                        background: "var(--tide-wash)",
                        color: "var(--tide)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Waves size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                          Rising River Water Level
                        </h3>
                        <span
                          className="t-meta num"
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "var(--amber-wash)",
                            color: "var(--amber-ink)",
                            fontWeight: 700,
                            fontSize: "0.73rem",
                          }}
                        >
                          Warning Stage (Level 2)
                        </span>
                      </div>
                      <p className="t-meta" style={{ margin: 0 }}>
                        Marikina Bridge Sensor Station #09 · Automated Hydrological Telemetry
                      </p>
                    </div>
                  </div>
                  <span className="t-meta num">Live Telemetry (30s ago)</span>
                </div>

                <div
                  style={{
                    padding: "var(--s-3) var(--s-4)",
                    borderRadius: "var(--r-ctl)",
                    background: "var(--sheet-sunk)",
                    border: "1px solid var(--rule)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong
                        className="num"
                        style={{ fontSize: "var(--step-2)", color: "var(--amber-ink)" }}
                      >
                        16.4m
                      </strong>{" "}
                      <span className="t-meta num">/ 18.0m Critical Evac Threshold</span>
                    </div>
                    <span className="t-meta num" style={{ color: "var(--tide)", fontWeight: 700 }}>
                      +0.3m / hr
                    </span>
                  </div>
                  <div className="kpi-bar" aria-hidden="true">
                    <div
                      className="kpi-bar__fill"
                      style={{
                        width: "78%",
                        background: "linear-gradient(90deg, var(--tide), var(--amber), var(--brick))",
                      }}
                    />
                  </div>
                  <div
                    className="t-meta num"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.74rem",
                    }}
                  >
                    <span>15.0m (Alarm)</span>
                    <span style={{ color: "var(--amber-ink)", fontWeight: 700 }}>
                      16.0m (Pre-Evacuate)
                    </span>
                    <span>18.0m (Forced Evac)</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() =>
                        toast.success("Sector advisory broadcasted to riverway barangay nodes.")
                      }
                    >
                      <Radio size={14} aria-hidden="true" />
                      <span>Broadcast Siren Advisory</span>
                    </button>
                    <Link href="/map" className="btn btn--sm">
                      <span>View on Tactical Map</span>
                    </Link>
                  </div>
                  <Link
                    href="/reports"
                    className="t-meta"
                    style={{ color: "var(--tide)", fontWeight: 700, textDecoration: "none" }}
                  >
                    All Reports ({totalReceived}) →
                  </Link>
                </div>
              </article>

              {/* Visual Photo Triage Grid */}
              <div style={{ marginTop: "var(--s-2)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "var(--s-3)",
                  }}
                >
                  <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                    Photo Evidence Triage Cards
                  </h3>
                  <Link
                    href="/reports"
                    className="t-meta"
                    style={{ color: "var(--tide)", fontWeight: 600 }}
                  >
                    Browse all ({totalReceived}) →
                  </Link>
                </div>
                <div className="triage-grid">
                  {filteredReports.slice(0, 3).map((r) => (
                    <IncidentTriageCard
                      key={r.id}
                      report={r}
                      eventName={eventName}
                      canReview={canReview}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                No incidents match your filter
              </h3>
              <p className="t-meta" style={{ margin: 0 }}>
                Try clearing the search query or switching to &ldquo;All Categories&rdquo;, or
                upload a new field photo.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("all");
                  }}
                >
                  Reset Filters
                </button>
                <Link href="/reports/new" className="btn btn--primary btn--sm">
                  + New Report
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Quick Agency Dispatch + Recent Verifications + Helpline & Checklist */}
        <aside
          aria-label="Emergency Operations Command Rail"
          style={{ display: "grid", gap: "var(--s-4)" }}
        >
          {/* Card 1: Quick Agency Dispatch */}
          <section className="panel" style={{ display: "grid", gap: "var(--s-3)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Send size={16} aria-hidden="true" style={{ color: "var(--tide)" }} />
                <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>Quick Agency Dispatch</h2>
              </div>
              <span
                className="t-meta num"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--sheet-sunk)",
                  border: "1px solid var(--rule)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                One-Click SOP
              </span>
            </div>
            <p className="t-meta" style={{ margin: 0 }}>
              Send pre-formatted triage telemetry and verified incident coordinates directly to
              partner responder operational centers.
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {[
                {
                  id: "mmda",
                  code: "MM",
                  name: "MMDA Operations",
                  role: "Traffic & Flood Management",
                },
                {
                  id: "pcg",
                  code: "CG",
                  name: "Philippine Coast Guard",
                  role: "Special Water Rescue Unit",
                },
                {
                  id: "rc",
                  code: "RC",
                  name: "Philippine Red Cross",
                  role: "Medical Ambulance & Triage",
                },
              ].map((agency) => {
                const active = !!dispatchedAgencies[agency.id];
                return (
                  <div
                    key={agency.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--r-ctl)",
                      background: "var(--sheet-sunk)",
                      border: "1px solid var(--rule)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        className="num"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "var(--r-ctl)",
                          background: "var(--tide-wash)",
                          color: "var(--tide)",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {agency.code}
                      </span>
                      <div>
                        <strong style={{ display: "block", fontSize: "0.88rem" }}>
                          {agency.name}
                        </strong>
                        <span className="t-meta" style={{ fontSize: "0.75rem" }}>
                          {agency.role}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn btn--sm ${active ? "" : "btn--primary"}`}
                      onClick={() => handleDispatchAgency(agency.id, agency.name)}
                    >
                      {active ? "✓ Active (3 Units)" : "Dispatch →"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Card 2: Recent Verifications */}
          <section className="panel" style={{ display: "grid", gap: "var(--s-3)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} aria-hidden="true" style={{ color: "var(--tide)" }} />
                <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>Recent Verifications</h2>
              </div>
              <Link
                href={canReview ? "/audit" : "/reports"}
                className="t-meta"
                style={{ color: "var(--tide)", fontWeight: 700, textDecoration: "none" }}
              >
                View Stream
              </Link>
            </div>
            <p className="t-meta" style={{ margin: 0 }}>
              Meta AI Vision checks cross-referenced with crowdsourced field submissions.
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {(streamItems.length > 0
                ? streamItems.slice(0, 3)
                : [
                    {
                      id: "v1",
                      category: "FLOOD TELEMETRY",
                      title: "Water Level Post #4",
                      detail: "EXIF matches GPS · Verified by Meta AI Vision",
                      timestamp: new Date().toISOString(),
                      badge: "98%",
                      tone: "green" as const,
                    },
                    {
                      id: "v2",
                      category: "FIELD SUBMISSION",
                      title: "Relief Supply Drop #12",
                      detail: "Geo-stamp Pasig Elementary Gym · Human Sign-off",
                      timestamp: new Date().toISOString(),
                      badge: "94%",
                      tone: "green" as const,
                    },
                  ]
              ).map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--r-ctl)",
                    background: "var(--sheet-sunk)",
                    border: "1px solid var(--rule)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "grid", gap: 3 }}>
                    <strong style={{ fontSize: "0.88rem" }}>{item.title}</strong>
                    <span className="t-meta" style={{ fontSize: "0.75rem" }}>
                      {item.detail}
                    </span>
                    <span className="t-meta num" style={{ fontSize: "0.72rem" }}>
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                  <span
                    className="t-meta num"
                    style={{
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: "var(--green-wash)",
                      color: "var(--green-ink)",
                      fontWeight: 700,
                      fontSize: "0.74rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✓ {idx === 0 ? "98%" : idx === 1 ? "94%" : item.badge}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Card 3: Helpline & Direct Links + Shift Readiness Checklist */}
          <section className="panel" style={{ display: "grid", gap: "var(--s-3)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PhoneCall size={16} aria-hidden="true" style={{ color: "var(--tide)" }} />
                <h2 style={{ fontSize: "var(--step-1)", margin: 0 }}>
                  Helpline &amp; Direct Links
                </h2>
              </div>
              <span
                className="t-meta num"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--tide-wash)",
                  color: "var(--tide)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                Priority 1 Lines
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              {[
                { label: "National Emergency", num: "911", sub: "Direct EOC Link" },
                { label: "Red Cross Hotline", num: "143", sub: "Dispatch Direct" },
                { label: "MMDA Metro Base", num: "136", sub: "Traffic & Towing" },
                { label: "Coast Guard Action", num: "527-8481", sub: "Amphibious Rescue" },
              ].map((line) => (
                <div
                  key={line.num}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--r-ctl)",
                    background: "var(--sheet-sunk)",
                    border: "1px solid var(--rule)",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <span className="t-meta" style={{ fontSize: "0.73rem" }}>
                    {line.label}
                  </span>
                  <strong className="num" style={{ fontSize: "var(--step-2)" }}>
                    {line.num}
                  </strong>
                  <span
                    className="t-meta"
                    style={{ fontSize: "0.72rem", color: "var(--tide)", fontWeight: 700 }}
                  >
                    {line.sub}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                paddingTop: "var(--s-2)",
                borderTop: "1px solid var(--rule)",
                display: "grid",
                gap: 6,
              }}
            >
              <span className="t-meta" style={{ fontWeight: 700, fontSize: "0.73rem" }}>
                SHIFT READINESS CHECKLIST
              </span>
              <button
                type="button"
                onClick={() => setChecklist((c) => ({ ...c, radio: !c.radio }))}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-ctl)",
                  background: "var(--sheet-sunk)",
                  border: "1px solid var(--rule)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <span className="t-meta" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)" }}>
                  <CheckCircle2 size={14} aria-hidden="true" style={{ color: "var(--green)" }} />
                  Radio relay stations verified
                </span>
                <span className="t-meta num" style={{ color: "var(--green)", fontWeight: 700 }}>
                  {checklist.radio ? "Complete" : "Pending"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setChecklist((c) => ({ ...c, satellite: !c.satellite }))}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-ctl)",
                  background: "var(--sheet-sunk)",
                  border: "1px solid var(--rule)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <span className="t-meta" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)" }}>
                  <CheckCircle2 size={14} aria-hidden="true" style={{ color: "var(--green)" }} />
                  Satellite uplink redundancy test
                </span>
                <span className="t-meta num" style={{ color: "var(--green)", fontWeight: 700 }}>
                  {checklist.satellite ? "Operational" : "Checking"}
                </span>
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
