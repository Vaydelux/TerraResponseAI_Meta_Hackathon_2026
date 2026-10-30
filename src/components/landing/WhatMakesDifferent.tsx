// src/components/landing/WhatMakesDifferent.tsx
//
// "What makes this different" — a comparison row showing that
// TerraResponse is not just image captioning. Contrasts a simple
// image analyzer with TerraResponse's structured, location-aware,
// review-workflow, explainable-priority system.
//
// Server component.

export function WhatMakesDifferent() {
  const rows = [
    {
      label: "Structured observations",
      simple: "Caption text",
      terra: "Schema-validated incident type, severity, evidence list, uncertainties",
    },
    {
      label: "Location-aware",
      simple: "No coordinates",
      terra: "EXIF GPS + manual pin + PostGIS proximity queries",
    },
    {
      label: "Review workflow",
      simple: "AI output is final",
      terra: "Human confirms, corrects, flags, or rejects — Seal resolves",
    },
    {
      label: "Explainable priority",
      simple: "No prioritization",
      terra: "Five-factor score with transparent derivation (not triage)",
    },
    {
      label: "Audit trail",
      simple: "No history",
      terra: "Append-only review_actions preserve before/after diff",
    },
    {
      label: "Event-scoped access",
      simple: "Anyone sees everything",
      terra: "Supabase RLS — cross-event access denied at the database",
    },
  ];

  return (
    <section style={{ marginTop: "var(--s-7)" }}>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-2)" }}>
        What makes this different
      </h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-4)" }}>
        Not just image captioning. TerraResponse is a structured, location-aware,
        human-reviewed incident intelligence platform.
      </p>

      <div className="table" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px var(--s-4)",
                  background: "var(--sheet-sunk)",
                  fontSize: "var(--step--1)",
                  fontWeight: 700,
                  color: "var(--ink-2)",
                  borderBottom: "1px solid var(--rule)",
                  width: "30%",
                }}
              >
                Capability
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px var(--s-4)",
                  background: "var(--sheet-sunk)",
                  fontSize: "var(--step--1)",
                  fontWeight: 700,
                  color: "var(--ink-3)",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                Simple image analyzer
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "12px var(--s-4)",
                  background: "var(--sheet-sunk)",
                  fontSize: "var(--step--1)",
                  fontWeight: 700,
                  color: "var(--tide)",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                TerraResponse AI
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td
                  style={{
                    padding: "12px var(--s-4)",
                    borderBottom: "1px solid var(--rule)",
                    fontWeight: 600,
                    fontSize: "var(--step--1)",
                  }}
                >
                  {r.label}
                </td>
                <td
                  style={{
                    padding: "12px var(--s-4)",
                    borderBottom: "1px solid var(--rule)",
                    color: "var(--ink-3)",
                    fontSize: "var(--step--1)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--graphite)" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    {r.simple}
                  </span>
                </td>
                <td
                  style={{
                    padding: "12px var(--s-4)",
                    borderBottom: "1px solid var(--rule)",
                    color: "var(--ink)",
                    fontSize: "var(--step--1)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--tide)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    {r.terra}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
