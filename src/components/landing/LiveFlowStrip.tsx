// src/components/landing/LiveFlowStrip.tsx
//
// The 7 pipeline steps as a real sequence with numbering:
//
//   Upload → Check → Analyze → Prioritize → Queue → Review → Map
//
// Each step has a small icon + a one-line description. The strip is
// a horizontal flow on desktop, a vertical list on mobile. The
// "Review" step is the only one with a colored badge — that's the
// moment the Seal is resolved (the human authority moment).
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface LiveFlowStripProps {
  className?: string;
}

const STEPS = [
  {
    n: 1,
    label: "Upload",
    caption: "Photo received, signed URL minted, EXIF read.",
  },
  {
    n: 2,
    label: "Check",
    caption: "File signature, decode, size, dedup, GPS bounds.",
  },
  {
    n: 3,
    label: "Analyze",
    caption: "Muse Spark produces a schema-validated observation.",
  },
  {
    n: 4,
    label: "Prioritize",
    caption: "Five-factor score, transparent, provisional.",
  },
  {
    n: 5,
    label: "Queue",
    caption: "Reports land in the reviewer queue by priority.",
  },
  {
    n: 6,
    label: "Review",
    caption: "A reviewer confirms, corrects, flags, or rejects. The Seal resolves.",
    highlighted: true,
  },
  {
    n: 7,
    label: "Map",
    caption: "Confirmed incidents appear on the map. Pending ones do not.",
  },
];

export function LiveFlowStrip({ className }: LiveFlowStripProps) {
  return (
    <section className={cn("live-flow", className)}>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-3)" }}>From photo to decision</h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-4)" }}>
        Seven steps. The reviewer&apos;s decision is the only moment the Seal resolves.
      </p>
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--s-3)",
        }}
      >
        {STEPS.map((s) => (
          <li key={s.n}>
            <div
              className="panel"
              style={{
                padding: "var(--s-4)",
                display: "grid",
                gap: "var(--s-2)",
                height: "100%",
                background: s.highlighted ? "var(--green-wash)" : "var(--sheet)",
                borderColor: s.highlighted ? "var(--green)" : "var(--rule)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "var(--step-2)",
                    color: s.highlighted ? "var(--green-ink)" : "var(--ink-3)",
                  }}
                  className="num"
                >
                  {String(s.n).padStart(2, "0")}
                </span>
                {s.highlighted && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--r-pill)",
                      background: "var(--green)",
                      color: "#fff",
                      fontSize: "var(--step--1)",
                      fontWeight: 700,
                    }}
                  >
                    Human
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700 }}>{s.label}</div>
              <div className="t-meta">{s.caption}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
