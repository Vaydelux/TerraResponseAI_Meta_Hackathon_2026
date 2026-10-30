// src/components/landing/DemoFlow.tsx
//
// Interactive demo flow — a visual 4-step walkthrough showing the
// product's core pipeline:
//   1. Upload photo
//   2. AI observation (Muse Spark)
//   3. Review decision (human)
//   4. Incident appears on map
//
// Each step is a panel with an icon + description. The "AI observation"
// step shows the amber-hatched Seal; the "Review decision" step shows
// the resolved green Seal. The "Map" step shows a pin.
//
// Server component — the interactivity is in the Hero demo card above
// this section. This is a visual narrative, not a clickable flow.

export function DemoFlow() {
  const steps = [
    {
      n: 1,
      label: "Upload photo",
      detail: "A contributor uploads a disaster photo with optional GPS. Nothing is sent to emergency services.",
      icon: (
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      ),
      bg: "var(--sheet)",
      border: "var(--rule)",
      color: "var(--ink)",
    },
    {
      n: 2,
      label: "AI observes",
      detail: "Muse Spark reads the photo and produces a structured observation. The result is hatched amber: AI-generated, not verified.",
      icon: (
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <rect x={4} y={4} width={16} height={16} rx={2} strokeDasharray="3 2.5" />
          <path d="M8 12h8M12 8v8" strokeLinecap="round" />
        </svg>
      ),
      bg: "var(--amber-wash)",
      border: "var(--amber)",
      color: "var(--amber-ink)",
    },
    {
      n: 3,
      label: "Reviewer decides",
      detail: "A reviewer confirms, corrects, flags, or rejects. The hatch wipes out and the Seal signs it green.",
      icon: (
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      ),
      bg: "var(--green-wash)",
      border: "var(--green)",
      color: "var(--green-ink)",
    },
    {
      n: 4,
      label: "Incident on map",
      detail: "Confirmed incidents appear as solid pins on the PostGIS-powered map. Pending ones stay hatched until reviewed.",
      icon: (
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
          <circle cx={12} cy={9} r={2.5} fill="currentColor" />
        </svg>
      ),
      bg: "var(--tide-wash)",
      border: "var(--tide)",
      color: "var(--tide)",
    },
  ];

  return (
    <section style={{ marginTop: "var(--s-6)" }}>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-2)" }}>
        How it works
      </h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-4)" }}>
        Four steps from photo to verified incident. The reviewer&apos;s decision is the only moment the Seal resolves.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--s-3)",
        }}
      >
        {steps.map((s, i) => (
          <div key={s.label}>
            <div
              className="panel"
              style={{
                padding: "var(--s-4)",
                display: "grid",
                gap: "var(--s-2)",
                height: "100%",
                background: s.bg,
                borderColor: s.border,
                color: s.color,
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: 40,
                    height: 40,
                    borderRadius: "var(--r-pill)",
                    background: "var(--sheet)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                  }}
                >
                  {s.icon}
                </span>
                <span
                  className="num"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "var(--step-2)",
                    color: "var(--ink-3)",
                  }}
                >
                  {String(s.n).padStart(2, "0")}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--step-0)", color: "var(--ink)" }}>
                {s.label}
              </div>
              <p className="t-meta" style={{ color: "var(--ink-2)" }}>
                {s.detail}
              </p>
              {s.n === 3 && (
                <div
                  style={{
                    marginTop: "var(--s-1)",
                    padding: "2px 8px",
                    borderRadius: "var(--r-pill)",
                    background: "var(--green)",
                    color: "#fff",
                    fontSize: "var(--step--1)",
                    fontWeight: 700,
                    display: "inline-block",
                    justifySelf: "start",
                  }}
                >
                  Human authority
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  display: "none",
                }}
                aria-hidden="true"
              >
                {/* Arrow rendered as CSS pseudo-element on larger screens */}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
