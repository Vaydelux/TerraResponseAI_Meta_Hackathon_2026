// src/components/landing/Hero.tsx
//
// The landing hero — redesigned for maximum visual impact. The hero
// is now a full-bleed dark section with the real flood photo as a
// dramatic background, large display typography, and a floating
// glass-free demo card.
//
// Client component — the demo's Confirm button needs the resolve
// animation state.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui-tr";
import { VerificationSeal } from "@/components/seal/VerificationSeal";
import { SeverityMeter } from "@/components/report/SeverityMeter";
import { EvidenceList } from "@/components/review/EvidenceList";
import { UncertaintyList } from "@/components/review/UncertaintyList";
import { CinematicHero } from "./CinematicHero";
import type { VerificationState } from "@/lib/design/status";
import { cn } from "@/lib/utils";

export interface HeroProps {
  signedIn?: boolean;
  className?: string;
}

const DEMO_EVIDENCE = [
  "Floodwater covering a two-lane road, approximately 60 cm deep",
  "Multiple vehicles stranded mid-road, occupants appear to have exited",
  "Residential structures on both sides partially submerged",
];

const DEMO_UNCERTAINTIES = [
  "Water depth beyond the road shoulder cannot be determined",
  "Structural integrity of submerged buildings not assessable",
];

export function Hero({ signedIn = false, className }: HeroProps) {
  const [state, setState] = useState<VerificationState>("pending");
  const [resolving, setResolving] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  function handleConfirm() {
    if (resolving || state !== "pending") return;
    setResolving(true);
    setTimeout(() => {
      setConfirmedAt(new Date().toISOString());
      setState("confirmed");
      setResolving(false);
    }, 640);
  }

  function handleReset() {
    setState("pending");
    setResolving(false);
    setConfirmedAt(null);
  }

  const ctaHref = signedIn ? "/review" : "/login";
  const uploadHref = signedIn ? "/reports/new" : "/login";

  return (
    <section
      className={cn("hero-hero", className)}
      style={{
        position: "relative",
        minHeight: "min(90vh, 760px)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
        paddingLeft: "calc(50vw - var(--content-max) / 2)",
        paddingRight: "calc(50vw - var(--content-max) / 2)",
        paddingTop: "var(--s-7)",
        paddingBottom: "var(--s-7)",
      }}
    >
      {/* Cinematic disaster montage background */}
      <CinematicHero
        poster="/hero/terraresponse-poster.jpg"
        sources={[
          { src: "/hero/terraresponse-bg.mp4", type: "video/mp4" },
        ]}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      />

      {/* Content layer */}
      <div
        className="hero"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "0 clamp(16px, 3vw, 40px)",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
        }}
      >
        {/* Left: headline + CTAs */}
        <div className="hero__text" style={{ color: "var(--ink-inverse)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--s-2)",
              padding: "5px 14px",
              borderRadius: "var(--r-pill)",
              background: "rgba(79, 179, 194, 0.15)",
              border: "1px solid rgba(79, 179, 194, 0.4)",
              color: "#72C6D3",
              fontSize: "var(--step--1)",
              fontWeight: 700,
              marginBottom: "var(--s-4)",
              letterSpacing: "0.04em",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
            </svg>
            META AI · DISASTER INTELLIGENCE
          </div>

          <h1
            className="hero__title"
            style={{
              color: "#E8EEF0",
              fontSize: "clamp(2.2rem, 1.4rem + 3.6vw, 4rem)",
              lineHeight: 1.04,
              fontWeight: 780,
              letterSpacing: "-0.02em",
            }}
          >
            From disaster photos
            <br />
            to actionable
            <br />
            <span style={{ color: "#72C6D3" }}>incident reports.</span>
          </h1>

          <p
            style={{
              marginTop: "var(--s-4)",
              fontSize: "clamp(1rem, 0.92rem + 0.3vw, 1.15rem)",
              color: "#B7C4CC",
              lineHeight: 1.5,
              maxWidth: "44ch",
            }}
          >
            AI organizes the evidence. Humans verify the findings.
            Teams see what&apos;s happening on the map.
          </p>

          <div
            className="hero__cta"
            style={{ marginTop: "var(--s-5)", gap: "var(--s-3)" }}
          >
            <Button variant="primary" size="lg" href={ctaHref}>
              Explore live demo
            </Button>
            <a
              href={uploadHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--s-2)",
                minHeight: 52,
                padding: "0 var(--s-5)",
                fontSize: "var(--step-1)",
                fontWeight: 600,
                color: "#E8EEF0",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "var(--r-ctl)",
                textDecoration: "none",
                transition: "background 120ms",
              }}
            >
              Upload a photo
            </a>
          </div>

          <div
            style={{
              display: "flex",
              gap: "var(--s-5)",
              marginTop: "var(--s-5)",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Human-reviewed", icon: "M5 12l5 5L20 7" },
              { label: "Location-aware", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2" },
              { label: "Evidence-preserving", icon: "M3 7l9 6 9-6M3 7v10l9 6 9-6V7" },
            ].map((tag) => (
              <span
                key={tag.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--step--1)",
                  color: "#8C9BA6",
                  fontWeight: 600,
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#72C6D3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={tag.icon} />
                </svg>
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right: floating demo card */}
        <div
          className="hero__demo"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "var(--r-panel)",
            background: "var(--sheet)",
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          {/* Photo header */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              background: "#0C1218",
              padding: "var(--s-3)",
            }}
          >
            <div
              className="viewer__chip viewer__chip--amber"
              style={{ justifySelf: "start" }}
            >
              Unverified · AI-generated
            </div>
            <div
              style={{
                position: "relative",
                aspectRatio: "4 / 3",
                marginTop: "var(--s-3)",
                borderRadius: "var(--r-viewer)",
                overflow: "hidden",
              }}
            >
              <img
                src="/demo/flood-aerial.png"
                alt="Aerial photo of floodwater covering a residential road with stranded vehicles"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none",
                }}
              />
              {/* SAM mask overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: "15% 10% 20% 10%",
                  background: "rgba(43, 108, 176, 0.4)",
                  border: "1px solid rgba(43, 108, 176, 0.7)",
                  borderRadius: 4,
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              />
              {/* Model badge */}
              <div
                style={{
                  position: "absolute",
                  bottom: "var(--s-2)",
                  left: "var(--s-2)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px",
                  borderRadius: "var(--r-pill)",
                  background: "rgba(12,18,24,0.8)",
                  color: "#72C6D3",
                  fontSize: "var(--step--1)",
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--flood)", display: "inline-block" }} />
                SAM 3.1 mask
              </div>
            </div>
          </div>

          {/* Observation panel */}
          <div
            className="obs"
            data-state={state}
            style={{ padding: "var(--s-4)" }}
          >
            <div className="pending-surface" data-state={state}>
              <VerificationSeal
                state={state}
                reviewerName={state === "confirmed" ? "you" : null}
                at={confirmedAt}
                resolving={resolving}
                modelName="muse-spark-1.3"
                isDemo={false}
              />
              <h2 className="obs__type" style={{ marginTop: "var(--s-2)", fontSize: "var(--step-1)" }}>
                Flooding
              </h2>
              <p className="obs__summary" style={{ fontSize: "var(--step--1)" }}>
                Floodwater covering a residential road. Multiple vehicles stranded.
                Structures on both sides partially submerged.
              </p>
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <SeverityMeter level={4} state={state} />
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <div className="obs__section-title" style={{ fontSize: "var(--step--1)", fontWeight: 700, marginBottom: "var(--s-1)" }}>
                What the model saw
              </div>
              <EvidenceList items={DEMO_EVIDENCE.slice(0, 2)} />
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <div className="obs__section-title" style={{ fontSize: "var(--step--1)", fontWeight: 700, marginBottom: "var(--s-1)" }}>
                Uncertainties
              </div>
              <UncertaintyList items={DEMO_UNCERTAINTIES.slice(0, 1)} />
            </div>

            {/* Action bar */}
            <div
              style={{
                marginTop: "var(--s-4)",
                paddingTop: "var(--s-3)",
                borderTop: "1px solid var(--rule)",
                display: "flex",
                gap: "var(--s-2)",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {state === "pending" ? (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleConfirm}
                    aria-busy={resolving || undefined}
                    disabled={resolving}
                    style={{ flex: 1, minHeight: 44 }}
                  >
                    Confirm
                    <kbd className="btn__kbd">C</kbd>
                  </button>
                  <span className="t-meta" style={{ fontSize: "var(--step--1)", color: "var(--ink-3)" }}>
                    Human verifies
                  </span>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={handleReset}
                  style={{ flex: 1, minHeight: 44 }}
                >
                  Replay the resolve
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
