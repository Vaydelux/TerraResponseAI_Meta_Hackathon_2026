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
} from "lucide-react";
import { IncidentTriageCard } from "./IncidentTriageCard";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

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
    </div>
  );
}
