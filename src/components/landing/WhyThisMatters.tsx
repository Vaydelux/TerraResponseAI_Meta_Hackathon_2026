// src/components/landing/WhyThisMatters.tsx
//
// A short strip under the hero explaining why the product matters:
//   1. Disaster photos arrive fast
//   2. Teams get overwhelmed
//   3. AI helps organize
//   4. Humans verify what's true
//
// Four compact panels in a horizontal row, each with an icon + a
// one-line statement. Server component — no interactivity.

export function WhyThisMatters() {
  const points = [
    {
      icon: "M3 7h18M3 12h18M3 17h18",
      label: "Photos arrive fast",
      detail: "Disaster photos pour in from contributors during floods, typhoons, and landslides.",
    },
    {
      icon: "M12 3v18M3 12h18",
      label: "Teams get overwhelmed",
      detail: "Response teams cannot manually review every photo in time to act.",
    },
    {
      icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
      label: "AI helps organize",
      detail: "Meta AI reads each photo and produces a structured observation with visible uncertainty.",
    },
    {
      icon: "M5 12l5 5L20 7",
      label: "Humans verify",
      detail: "A reviewer confirms, corrects, flags, or rejects. The Seal resolves when they act.",
    },
  ];

  return (
    <section
      style={{
        marginTop: "var(--s-6)",
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
        paddingLeft: "calc(50vw - var(--content-max) / 2)",
        paddingRight: "calc(50vw - var(--content-max) / 2)",
        paddingTop: "var(--s-5)",
        paddingBottom: "var(--s-5)",
        background: "var(--sheet)",
        borderTop: "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "0 clamp(16px, 3vw, 40px)" }}>
        <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-4)" }}>
          Why this matters
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--s-4)",
          }}
        >
          {points.map((p, i) => (
            <div key={p.label} style={{ display: "grid", gap: "var(--s-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <span
                  style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: 36,
                    height: 36,
                    borderRadius: "var(--r-pill)",
                    background: i === 3 ? "var(--green-wash)" : "var(--tide-wash)",
                    color: i === 3 ? "var(--green)" : "var(--tide)",
                    flex: "none",
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d={p.icon} />
                  </svg>
                </span>
                <span
                  className="num"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "var(--step-1)",
                    color: "var(--ink-3)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--step-0)" }}>{p.label}</div>
              <p className="t-meta">{p.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
