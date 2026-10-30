// src/components/landing/FinalCTA.tsx
//
// Final call-to-action section at the bottom of the landing page.
// Three buttons: Watch 90-sec demo, Explore sample incident, View GitHub.
//
// Server component.

export function FinalCTA() {
  return (
    <section
      style={{
        marginTop: "var(--s-7)",
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
        paddingLeft: "calc(50vw - var(--content-max) / 2)",
        paddingRight: "calc(50vw - var(--content-max) / 2)",
        paddingTop: "var(--s-7)",
        paddingBottom: "var(--s-7)",
        background: "#0F1A22",
        borderTop: "1px solid var(--rule)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "0 clamp(16px, 3vw, 40px)",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "var(--s-5)",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "var(--step-3)",
              color: "#E8EEF0",
              marginBottom: "var(--s-2)",
              lineHeight: 1.1,
            }}
          >
            See it in action
          </h2>
          <p style={{ color: "#B7C4CC", fontSize: "var(--step-1)", maxWidth: "52ch" }}>
            Watch a 90-second walkthrough of the full upload-to-map workflow,
            explore a sample incident, or read the source code on GitHub.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <a
            className="btn btn--primary btn--lg"
            href="/review"
            style={{ whiteSpace: "nowrap" }}
          >
            Watch 90-sec demo
          </a>
          <a
            className="btn btn--lg"
            href="/map"
            style={{
              whiteSpace: "nowrap",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#E8EEF0",
            }}
          >
            Explore sample incident
          </a>
          <a
            className="btn btn--lg"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              whiteSpace: "nowrap",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#E8EEF0",
            }}
          >
            View GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
