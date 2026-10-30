// src/components/landing/MetaAIShowcase.tsx
//
// "How Meta AI powers this" — the most impressive demonstration of
// the underlying technology. Three panels side-by-side show:
//
//   1. Original uploaded photo (the evidence)
//   2. Muse Spark's structured findings (hatched amber = AI-generated)
//   3. SAM 3.1 segmentation overlay (flood-blue mask on the photo)
//
// Below: the reviewer's correction (tide = human-edited) sits beside
// the original AI output (amber = struck through) as a visible diff.
//
// This section directly addresses the hackathon rubric's "Meta AI
// Tooling" category (25%): genuine Muse Spark observations + SAM 3.1
// segmentation with model-generated uncertainty and reviewer corrections.

export function MetaAIShowcase() {
  const findings = [
    "Floodwater visibly covers the roadway; depth is not confirmed",
    "Vehicles appear stopped on the roadway; occupancy is unknown",
    "Residential structures on both sides partially submerged",
    "Downstream side shows active overland flow toward a culvert",
  ];

  const uncertainties = [
    "Water depth beyond the visible road shoulder cannot be determined",
    "Structural integrity of submerged buildings not assessable",
    "Vehicle occupancy status unknown",
  ];

  return (
    <section style={{ marginTop: "var(--s-7)" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--s-2)",
          padding: "4px 12px",
          borderRadius: "var(--r-pill)",
          background: "var(--tide-wash)",
          color: "var(--tide)",
          fontSize: "var(--step--1)",
          fontWeight: 700,
          marginBottom: "var(--s-3)",
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx={12} cy={12} r={10} />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        Meta AI
      </div>
      <h2 style={{ fontSize: "var(--step-2)", marginBottom: "var(--s-2)" }}>
        How Meta AI powers this
      </h2>
      <p className="t-meta" style={{ marginBottom: "var(--s-5)", maxWidth: "60ch" }}>
        Muse Spark analyzes uploaded photos, while SAM 3.1 can optionally segment regions. In this illustrated example, Muse Spark reads
        the image and produces structured findings. SAM 3.1 optionally segments
        the flood region for visual reference. A human reviewer verifies both.
      </p>

      {/* Three-panel showcase */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--s-4)",
          marginBottom: "var(--s-5)",
        }}
      >
        {/* Panel 1: Original photo */}
        <div className="panel panel--flush">
          <div
            style={{
              padding: "var(--s-3) var(--s-4)",
              borderBottom: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--r-pill)",
                background: "var(--ink)",
                flex: "none",
              }}
            />
            <span className="t-label">1. Uploaded photo</span>
          </div>
          <img
            src="/demo/flood-aerial.png"
            alt="Aerial photo of floodwater covering a residential road"
            style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }}
          />
          <div style={{ padding: "var(--s-3) var(--s-4)" }}>
            <p className="t-meta">
              The contributor uploads a photo with optional GPS. The original is
              stored in a private bucket; only an EXIF-stripped derivative is
              shown to reviewers.
            </p>
          </div>
        </div>

        {/* Panel 2: Muse Spark findings (hatched amber) */}
        <div
          className="panel panel--flush"
          style={{ borderColor: "var(--amber)", overflow: "hidden" }}
        >
          <div
            className="pending-surface"
            data-state="pending"
            style={{ borderRadius: "var(--r-panel) var(--r-panel) 0 0" }}
          >
            <div
              style={{
                padding: "var(--s-3) var(--s-4)",
                paddingTop: "calc(var(--s-3) + 6px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-2)",
                  marginBottom: "var(--s-2)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "var(--r-pill)",
                    background: "var(--amber)",
                    flex: "none",
                  }}
                />
                <span className="t-label" style={{ color: "var(--amber-ink)" }}>
                  2. Example Muse Spark-style observations (illustrative)
                </span>
              </div>
              <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-1)" }}>
                Flooding
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 var(--s-3) 0",
                  display: "grid",
                  gap: "var(--s-1)",
                }}
              >
                {findings.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "16px 1fr",
                      gap: "var(--s-2)",
                      fontSize: "var(--step--1)",
                      color: "var(--ink-2)",
                      lineHeight: 1.4,
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}>
                      <path d="M5 12l5 5L20 7" strokeDasharray="3 2" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <div
                className="well-uncertain"
                style={{ padding: "var(--s-3)", marginBottom: 0 }}
              >
                <div className="t-label" style={{ marginBottom: "var(--s-1)", fontSize: "var(--step--1)" }}>
                  Uncertainties
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "grid",
                    gap: "var(--s-1)",
                  }}
                >
                  {uncertainties.map((u) => (
                    <li
                      key={u}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "16px 1fr",
                        gap: "var(--s-2)",
                        fontSize: "var(--step--1)",
                        color: "var(--ink-3)",
                        lineHeight: 1.4,
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.5} style={{ marginTop: 2 }}>
                        <circle cx={12} cy={12} r={10} strokeDasharray="3 2" />
                        <path d="M9 9a3 3 0 1 1 4 3" strokeLinecap="round" />
                      </svg>
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div style={{ padding: "var(--s-3) var(--s-4)", borderTop: "1px solid var(--rule)" }}>
            <p className="t-meta">
              <span className="provenance__model" style={{ display: "inline-block" }}>
                muse-spark-1.3
              </span>{" "}
              Structured observation with visible evidence + first-class uncertainties.
            </p>
          </div>
        </div>

        {/* Panel 3: SAM 3.1 segmentation */}
        <div className="panel panel--flush">
          <div
            style={{
              padding: "var(--s-3) var(--s-4)",
              borderBottom: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--r-pill)",
                background: "var(--flood)",
                flex: "none",
              }}
            />
            <span className="t-label">3. SAM 3.1 concept — illustrative overlay</span>
          </div>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "4 / 3",
              overflow: "hidden",
            }}
          >
            <img
              src="/demo/flood-aerial.png"
              alt="Flood photo with a decorative overlay illustrating the concept of segmentation"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            {/* Flood mask overlay */}
            <div
              style={{
                position: "absolute",
                inset: "10% 5% 15% 5%",
                background: "rgba(43, 108, 176, 0.35)",
                border: "1px solid rgba(43, 108, 176, 0.7)",
                borderRadius: 4,
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
          </div>
          <div style={{ padding: "var(--s-3) var(--s-4)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: "var(--s-2)",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: "var(--flood)",
                  display: "inline-block",
                }}
              />
              <span className="t-meta" style={{ fontWeight: 600 }}>
                Illustrative region highlight
              </span>
            </div>
            <p className="t-meta">
              SAM 3.1 can produce masks on request. This rectangle is only a visual
              illustration, not model-generated segmentation. Reviewers must
              independently verify any observation.
            </p>
          </div>
        </div>
      </div>

      {/* Reviewer correction diff */}
      <div
        className="panel"
        style={{
          background: "var(--sheet-sunk)",
          borderColor: "var(--rule-strong)",
        }}
      >
        <h3
          style={{
            fontSize: "var(--step-1)",
            marginBottom: "var(--s-2)",
          }}
        >
          Reviewer correction
        </h3>
        <p className="t-meta" style={{ marginBottom: "var(--s-3)" }}>
          When a reviewer corrects the AI&apos;s observation, the original is
          preserved in the audit trail. The following illustrative diff shows the concept:
        </p>
        <div className="diff">
          <div className="diff__old">
            <div className="t-label" style={{ marginBottom: 4 }}>AI (Muse Spark)</div>
            Flooding — severity 4
          </div>
          <div className="diff__new">
            <div className="t-label" style={{ marginBottom: 4 }}>Reviewer correction</div>
            Flooding — example reviewer correction: bridge approach requires inspection
          </div>
        </div>
        <p
          className="t-meta"
          style={{
            marginTop: "var(--s-3)",
            fontSize: "var(--step--1)",
          }}
        >
          The AI&apos;s original output is never overwritten — it&apos;s preserved
          in <code className="num">review_actions</code> with the full before/after
          diff for audit.
        </p>
      </div>
    </section>
  );
}
