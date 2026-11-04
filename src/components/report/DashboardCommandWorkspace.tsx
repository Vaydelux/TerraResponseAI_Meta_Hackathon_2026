"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  MapPin,
  Gauge,
  ArrowRight,
  ShieldCheck,
  Waves,
  AlertTriangle,
  Flame,
  HeartPulse,
  Building2,
  ShieldAlert,
  Trash2,
  Layers,
} from "lucide-react";
import { IncidentTriageCard } from "./IncidentTriageCard";
import { DetailsModal } from "./DetailsModal";
import { ShareReportButton } from "./ShareReportButton";
import type { ReportRowData } from "./ReportRow";
import { formatRelativeTime } from "@/lib/design/format";
import { toSeverityLevel } from "@/lib/design/severity";
import { stateFromReport } from "@/lib/design/status";

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

export type HazardFilter = "all" | "flood" | "hazmat" | "medical" | "structural" | "road" | "debris";
type SortMode = "priority" | "newest";

export function classifyHazard(r: ReportRowData): "flood" | "hazmat" | "medical" | "structural" | "road" | "debris" {
  const type = (r.incident_type ?? "").toLowerCase();
  const raw = `${type} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();

  if (type === "fire" || /\b(fire|hazmat|chemical|gas|toxic|flame|combustion|fuel|smoke)\b/.test(raw)) {
    return "hazmat";
  }
  if (
    type === "medical" ||
    /\b(rescue|stranded|trapped|medical|casualty|injury|evac|hospital|ambulance)\b/.test(raw) ||
    (r.severity ?? 0) >= 5
  ) {
    return "medical";
  }
  if (
    type === "visible_structural_damage" ||
    /\b(structur|building|collapse|wall|bridge|masonry|crack|column|roof)\b/.test(raw)
  ) {
    return "structural";
  }
  if (
    type === "debris" ||
    /\b(debris|scattered|sheet|corrugated|wires|pole|trash|wreckage)\b/.test(raw)
  ) {
    return "debris";
  }
  if (
    type === "blocked_road" ||
    /\b(block|road|highway|lane|passable|obstruction|traffic|access|street)\b/.test(raw)
  ) {
    return "road";
  }
  return "flood";
}

const HAZARD_TABS = [
  { id: "all" as const, label: "All Hazards", icon: Layers, accentColor: "var(--tide)" },
  { id: "flood" as const, label: "Flood", icon: Waves, accentColor: "var(--flood)" },
  { id: "hazmat" as const, label: "Fire & Hazmat", icon: Flame, accentColor: "var(--brand-signal)" },
  { id: "medical" as const, label: "Medical & Rescue", icon: HeartPulse, accentColor: "var(--brick-ink)" },
  { id: "structural" as const, label: "Structural Damage", icon: Building2, accentColor: "var(--amber-ink)" },
  { id: "road" as const, label: "Blocked Road", icon: ShieldAlert, accentColor: "var(--amber)" },
  { id: "debris" as const, label: "Debris Field", icon: Trash2, accentColor: "var(--graphite)" },
] as const;

export function DashboardCommandWorkspace({
  reports,
  streamItems,
  eventName,
  canReview,
  totalReceived,
}: DashboardCommandWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<HazardFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [selectedReport, setSelectedReport] = useState<ReportRowData | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [visibleFeedCount, setVisibleFeedCount] = useState(4);

  function handleOpenDetails(r: ReportRowData) {
    setSelectedReport(r);
    setIsDetailsOpen(true);
  }

  const hazardCounts = useMemo(() => {
    const counts: Record<HazardFilter, number> = {
      all: reports.length,
      flood: 0,
      hazmat: 0,
      medical: 0,
      structural: 0,
      road: 0,
      debris: 0,
    };
    for (const r of reports) {
      const h = classifyHazard(r);
      counts[h]++;
    }
    return counts;
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = reports.filter((r) => {
      if (categoryFilter !== "all" && classifyHazard(r) !== categoryFilter) {
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

  return (
    <div style={{ display: "grid", gap: "var(--s-5)" }}>
      {/* Two-Column Incident Evidence Workspace */}
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

          {/* Persistent Horizontal Pill Filter Bar */}
          <div
            className="feed-hazard-filter-bar"
            role="toolbar"
            aria-label="Filter active incident feeds by hazard type"
            style={{
              position: "sticky",
              top: "calc(var(--nav-h) + 2px)",
              zIndex: 25,
              background: "var(--sheet)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-ctl)",
              padding: "6px 8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              overflowX: "auto",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {HAZARD_TABS.map((tab) => {
              const active = categoryFilter === tab.id;
              const TabIcon = tab.icon;
              const count = hazardCounts[tab.id];

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  aria-pressed={active}
                  className="btn btn--sm"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: "9999px",
                    fontSize: "0.80rem",
                    fontWeight: active ? 600 : 500,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    minHeight: 34,
                    transition: "all 150ms ease",
                    cursor: "pointer",
                    background: active ? "var(--tide)" : "transparent",
                    color: active ? "var(--on-tide)" : "var(--ink-2)",
                    border: active ? "1px solid var(--tide)" : "1px solid transparent",
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  }}
                >
                  <TabIcon
                    size={15}
                    aria-hidden="true"
                    style={{
                      color: active ? "var(--on-tide)" : tab.accentColor,
                      flexShrink: 0,
                    }}
                  />
                  <span>{tab.label}</span>
                  <span
                    className="num"
                    style={{
                      fontSize: "0.72rem",
                      padding: "1px 6px",
                      borderRadius: "9999px",
                      background: active
                        ? "rgba(255, 255, 255, 0.22)"
                        : "var(--sheet-sunk)",
                      color: active ? "var(--on-tide)" : "var(--ink-3)",
                      fontWeight: 700,
                      lineHeight: "1.2",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rich Incident Feed List + Triage Cards */}
          {filteredReports.length > 0 ? (
            <div style={{ display: "grid", gap: "var(--s-4)" }}>
              {/* Featured Operational Feed Cards */}
              {filteredReports.slice(0, visibleFeedCount).map((r) => {
                const sev = toSeverityLevel(r.severity);
                const state = stateFromReport({
                  status: r.status,
                  reviewOutcome: r.review_outcome,
                });
                const isCritical = sev >= 4;
                const cat = classifyHazard(r);
                const titleText =
                  r.title ||
                  (cat === "road"
                    ? "Fallen Tree & Blocked Access"
                    : cat === "medical"
                    ? "Flash Flooding & Stranded Commuters"
                    : cat === "hazmat"
                    ? "Flammable Vapor & Transformer Flare"
                    : cat === "structural"
                    ? "Masonry Wall & Infrastructure Fracture"
                    : cat === "debris"
                    ? "Scattered Debris & Downed Power Lines"
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
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button, a, input, select") && !target.closest(".card-modal-trigger")) {
                        return;
                      }
                      handleOpenDetails(r);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenDetails(r);
                      }
                    }}
                    style={{
                      display: "grid",
                      gap: "var(--s-3)",
                      padding: "var(--s-4) var(--s-5)",
                      cursor: "pointer",
                      transition: "border-color 150ms ease, box-shadow 150ms ease",
                    }}
                    title="Click anywhere on card to inspect incident details"
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
                          {cat === "flood" && <Waves size={18} aria-hidden="true" />}
                          {cat === "hazmat" && <Flame size={18} aria-hidden="true" />}
                          {cat === "medical" && <HeartPulse size={18} aria-hidden="true" />}
                          {cat === "structural" && <Building2 size={18} aria-hidden="true" />}
                          {cat === "road" && <ShieldAlert size={18} aria-hidden="true" />}
                          {cat === "debris" && <Trash2 size={18} aria-hidden="true" />}
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
                            <h3
                              style={{
                                fontSize: "var(--step-1)",
                                margin: 0,
                                transition: "color 150ms ease",
                              }}
                            >
                              {titleText}
                            </h3>
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
                              {r.severity == null
                                ? "Severity not assessed"
                                : `Provisional severity ${sev}/5`}
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
                              {state === "confirmed" ? "Human confirmed" : state === "rejected" ? "Rejected" : state === "flagged" ? "Flagged for review" : state === "failed" ? "Analysis unavailable" : r.status === "uploaded" ? "Awaiting AI analysis" : r.status === "analyzing" ? "AI analysis in progress" : "AI observation · not verified"}
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
                          <Gauge size={14} aria-hidden="true" style={{ color: "var(--amber-ink)" }} />
                          <span>Priority Score: {r.priority_score ?? "Pending"}</span>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetails(r);
                          }}
                          className="btn btn--primary btn--sm card-modal-trigger"
                          style={{ minHeight: 34, gap: 6, fontWeight: 700 }}
                        >
                          <Search size={14} aria-hidden="true" />
                          <span>Inspect Incident Details</span>
                        </button>
                        <div onClick={(e) => e.stopPropagation()}>
                          <ShareReportButton reportId={r.id} title={titleText} variant="quiet" size="sm" />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetails(r);
                        }}
                        className="t-meta card-modal-trigger"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--tide)",
                          fontWeight: 700,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: "inherit",
                        }}
                        aria-label={`Inspect incident details for ${titleText}`}
                      >
                        <span>Open Incident Modal</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Show more in feed button if there are additional reports */}
              {filteredReports.length > visibleFeedCount && (
                <button
                  type="button"
                  onClick={() => setVisibleFeedCount((prev) => Math.min(filteredReports.length, prev + 4))}
                  className="btn btn--sm"
                  style={{ width: "100%", justifyContent: "center", minHeight: 36, marginTop: "var(--s-1)" }}
                >
                  Load More Feed Items ({filteredReports.length - visibleFeedCount} remaining)
                </button>
              )}

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
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("all");
                      setVisibleFeedCount(reports.length);
                    }}
                    className="t-meta"
                    style={{
                      color: "var(--tide)",
                      fontWeight: 600,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Expand all in feed ({totalReceived}) →
                  </button>
                </div>
                <div className="triage-grid">
                  {filteredReports.slice(0, 6).map((r) => (
                    <IncidentTriageCard
                      key={r.id}
                      report={r}
                      eventName={eventName}
                      canReview={canReview}
                      onOpenDetails={handleOpenDetails}
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

        {/* Right Column: real review activity */}
        <aside
          aria-label="Review Activity Rail"
          style={{ display: "grid", gap: "var(--s-4)" }}
        >
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
              {streamItems.length === 0 && (
                <p className="t-meta">No review activity recorded yet. Upload a report to begin.</p>
              )}
              {streamItems.slice(0, 3).map((item) => (
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
                      background: item.tone === "green" ? "var(--green-wash)" : item.tone === "brick" ? "var(--brick-wash)" : item.tone === "amber" ? "var(--amber-wash)" : "var(--tide-wash)",
                      color: item.tone === "green" ? "var(--green-ink)" : item.tone === "brick" ? "var(--brick-ink)" : item.tone === "amber" ? "var(--amber-ink)" : "var(--tide)",
                      fontWeight: 700,
                      fontSize: "0.74rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </section>

          </aside>
      </div>

      {/* High-Fidelity Incident Details Modal (shadcn Dialog) */}
      <DetailsModal
        report={selectedReport}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        canReview={canReview}
      />
    </div>
  );
}
