// src/components/landing/TrustModelDiagram.tsx
//
// A horizontal three-lane sequence illustrating the trust model:
//
//   Contributor uploads → AI observes → Reviewer decides
//
// The middle lane (AI observes) is hatched (amber); the last
// (Reviewer decides) is solid (green). The first (Contributor
// uploads) is a plain sheet. The visual story: human uploads,
// AI adds an unfinished amber observation, the reviewer finishes
// it (hatch wipes out → solid green).
//
// Server-component friendly.

import { cn } from "@/lib/utils";

export interface TrustModelDiagramProps {
  className?: string;
}

export function TrustModelDiagram({ className }: TrustModelDiagramProps) {
  const lanes = [
    {
      label: "Contributor uploads",
      caption: "A photo with optional GPS. Nothing has been sent to emergency services.",
      variant: "default" as const,
      icon: (
        <svg width={28} height={28} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 9 14 4l9 5v10l-9 5-9-5Z" />
          <path d="M5 9 14 14l9-5M14 14v10" />
        </svg>
      ),
    },
    {
      label: "AI observes",
      caption: "Muse Spark reads the photo. The observation is hatched: AI-generated, not verified.",
      variant: "hatched" as const,
      icon: (
        <svg width={28} height={28} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <rect x={5} y={5} width={18} height={18} rx={2} strokeDasharray="3 2.5" />
          <path d="M9 14h10M14 9v10" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Reviewer decides",
      caption: "A human confirms, corrects, flags, or rejects. The hatch wipes out and the Seal signs it.",
      variant: "resolved" as const,
      icon: (
        <svg width={28} height={28} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 14 12 20 22 8" />
        </svg>
      ),
    },
  ];

  return (
    <section className={cn("trust-model panel", className)}>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-3)" }}>The trust model</h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-4)" }}>
        The reviewer is the authority, not the AI. The interface makes that visible.
      </p>
      <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s-4)", listStyle: "none", padding: 0, margin: 0 }}>
        {lanes.map((lane, i) => (
          <li key={lane.label}>
            <div
              className="panel"
              data-variant={lane.variant}
              style={{
                padding: "var(--s-4)",
                display: "grid",
                gap: "var(--s-2)",
                background:
                  lane.variant === "hatched" ? "var(--amber-wash)" :
                  lane.variant === "resolved" ? "var(--green-wash)" : "var(--sheet)",
                borderColor:
                  lane.variant === "hatched" ? "var(--amber)" :
                  lane.variant === "resolved" ? "var(--green)" : "var(--rule)",
                borderStyle: lane.variant === "hatched" ? "dashed" : "solid",
                color: lane.variant === "hatched" ? "var(--amber-ink)" :
                  lane.variant === "resolved" ? "var(--green-ink)" : "var(--ink)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <span
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "var(--r-pill)",
                    background: "var(--sheet)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  {lane.icon}
                </span>
                <span className="t-label" style={{ fontSize: "var(--step--1)" }}>
                  Step {i + 1}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--step-1)" }}>{lane.label}</div>
              <div className="t-meta">{lane.caption}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
