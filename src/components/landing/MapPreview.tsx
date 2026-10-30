// src/components/landing/MapPreview.tsx
//
// A static (non-interactive) preview of the incident map on the
// landing page. Shows confirmed incidents as solid green pins + a
// few pending ones (hatched amber) so judges see the whole pipeline
// on one screen. Uses the real flood photo as the panel content.
//
// This is a SERVER component — the actual MapLibre map lives at
// /map. The preview is a styled mockup that communicates the map's
// value without the full JS bundle.

export function MapPreview() {
  // Simulated incident pins — placed on a stylized map background.
  const incidents = [
    { x: 22, y: 35, state: "confirmed", sev: 4, label: "Flooded road" },
    { x: 55, y: 48, state: "confirmed", sev: 3, label: "Structural damage" },
    { x: 38, y: 62, state: "pending", sev: 2, label: "Debris" },
    { x: 68, y: 28, state: "confirmed", sev: 5, label: "Bridge collapse" },
    { x: 78, y: 55, state: "pending", sev: 3, label: "Landslide" },
    { x: 45, y: 75, state: "confirmed", sev: 2, label: "Road closure" },
  ];

  return (
    <section id="incident-map-preview" style={{ marginTop: "var(--s-7)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "var(--s-3)",
          flexWrap: "wrap",
          gap: "var(--s-2)",
        }}
      >
        <h2 style={{ fontSize: "var(--step-2)" }}>Illustrative incident-map preview</h2>
        <span className="t-meta">
          Example pins only; no live incident data. Solid = example reviewed, hatched = example pending.
        </span>
      </div>
      <div
        className="panel panel--flush"
        style={{
          position: "relative",
          height: "420px",
          overflow: "hidden",
          background: "#E9EDE8",
        }}
      >
        {/* Stylized map background — muted survey style */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Water areas */}
          <path d="M0,55 Q20,50 30,55 L40,60 Q50,65 60,58 L100,55 L100,100 L0,100 Z" fill="#CFE0E6" opacity="0.5" />
          <path d="M60,0 L65,30 L70,0 Z" fill="#CFE0E6" opacity="0.3" />
          {/* Roads */}
          <path d="M10,20 L90,30 M20,80 L80,70 M50,0 L50,100" stroke="#FFFFFF" strokeWidth="0.8" fill="none" />
          <path d="M10,20 L90,30 M20,80 L80,70 M50,0 L50,100" stroke="#C9D1CB" strokeWidth="0.3" fill="none" />
          {/* Park areas */}
          <ellipse cx="75" cy="70" rx="12" ry="8" fill="#DCE8DB" opacity="0.6" />
          <ellipse cx="15" cy="75" rx="8" ry="5" fill="#DCE8DB" opacity="0.6" />
        </svg>

        {/* Incident pins */}
        {incidents.map((inc) => (
          <div
            key={inc.label}
            style={{
              position: "absolute",
              left: `${inc.x}%`,
              top: `${inc.y}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="pin"
              data-state={inc.state}
              data-sev={inc.sev}
              title={`${inc.label} — ${inc.state === "confirmed" ? "confirmed" : "pending review"}`}
              style={{ position: "static", display: "inline-block" }}
            />
          </div>
        ))}

        {/* Floating panel — selected incident */}
        <div
          className="map-panel"
          style={{
            position: "absolute",
            top: "var(--s-4)",
            right: "var(--s-4)",
            bottom: "var(--s-4)",
            width: "min(320px, 40%)",
            zIndex: 5,
          }}
        >
          <img
            src="/demo/flood-aerial.png"
            alt="Aerial flood photo"
            className="map-panel__thumb"
            style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover" }}
          />
          <div className="map-panel__body">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--s-1)",
                padding: "4px 10px",
                borderRadius: "var(--r-pill)",
                background: "var(--green)",
                color: "#fff",
                fontSize: "var(--step--1)",
                fontWeight: 600,
                marginBottom: "var(--s-2)",
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
              Example: confirmed
            </div>
            <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-1)" }}>
              Flooded road
            </h3>
            <p className="t-meta" style={{ marginBottom: "var(--s-2)" }}>
              Synthetic location · Example severity 4
            </p>
            <p className="t-meta">
              Road submerged by muddy water. Two vehicles stranded. Overland flow toward a culvert.
            </p>
            <a
              className="btn btn--primary"
              href="/map"
              style={{
                marginTop: "var(--s-3)",
                fontSize: "var(--step--1)",
                minHeight: 36,
                padding: "0 var(--s-3)",
              }}
            >
              Open authenticated map
            </a>
          </div>
        </div>

        {/* Legend */}
        <div
          className="legend"
          style={{ left: "var(--s-4)", bottom: "var(--s-4)" }}
        >
          <div className="legend__row">
            <span
              className="pin"
              data-state="confirmed"
              data-sev={3}
              style={{ position: "static", display: "inline-block", width: 16, height: 16 }}
            />
            <span>Confirmed</span>
          </div>
          <div className="legend__row">
            <span
              className="pin"
              data-state="pending"
              data-sev={3}
              style={{ position: "static", display: "inline-block", width: 16, height: 16 }}
            />
            <span>Pending review</span>
          </div>
          <div className="legend__row">
            <span
              className="pin"
              data-state="confirmed"
              data-sev={5}
              style={{ position: "static", display: "inline-block", width: 16, height: 16 }}
            />
            <span>Ring = severity</span>
          </div>
        </div>
      </div>
    </section>
  );
}
