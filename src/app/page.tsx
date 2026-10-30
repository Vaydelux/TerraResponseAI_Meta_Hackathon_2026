// src/app/page.tsx
//
// Landing page — Phase 19 restructure.
//
// Section order (per the hackathon presentation requirements):
//   1. Cinematic hero with video background + interactive demo
//   2. "Why this matters" strip (disaster photos → overwhelmed → AI → humans)
//   3. "How it works" demo flow (upload → AI → review → map)
//   4. Live incident map preview
//   5. "How Meta AI powers this" (Muse Spark + SAM 3.1 + human correction)
//   6. "What makes this different" comparison table
//   7. Human-review workflow (trust model)
//   8. Responsible AI (condensed)
//   9. Final CTA (Watch demo · Explore incident · View GitHub)
//
// Server Component — server-side identity verification for CTA targets.

import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { Hero } from "@/components/landing/Hero";
import { WhyThisMatters } from "@/components/landing/WhyThisMatters";
import { DemoFlow } from "@/components/landing/DemoFlow";
import { MapPreview } from "@/components/landing/MapPreview";
import { MetaAIShowcase } from "@/components/landing/MetaAIShowcase";
import { WhatMakesDifferent } from "@/components/landing/WhatMakesDifferent";
import { TrustModelDiagram } from "@/components/landing/TrustModelDiagram";
import { BoundariesGrid } from "@/components/landing/BoundariesGrid";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Wordmark } from "@/components/layout/Wordmark";

export default async function LandingPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getServerUser() : null;
  const signedIn = !!user;

  return (
    <div className="tr-shell" style={{ background: "var(--paper)" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <div className="topbar__spacer" />
        {signedIn ? (
          <a className="btn btn--primary" href="/review">Open review queue</a>
        ) : (
          <a className="btn btn--primary" href="/login">Sign in</a>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {/* 1. Cinematic hero with video background + interactive demo */}
        <Hero signedIn={signedIn} />

        {/* 2. Why this matters */}
        <WhyThisMatters />

        {/* 3. How it works (demo flow) */}
        <div className="tr-page" style={{ maxWidth: "var(--content-max)" }}>
          <DemoFlow />

          {/* 4. Live incident map preview */}
          <MapPreview />

          {/* 5. How Meta AI powers this */}
          <MetaAIShowcase />

          {/* 6. What makes this different */}
          <WhatMakesDifferent />

          {/* 7. Human-review workflow */}
          <div style={{ marginTop: "var(--s-7)" }}>
            <TrustModelDiagram />
          </div>

          {/* 8. Responsible AI (condensed) */}
          <div style={{ marginTop: "var(--s-7)" }}>
            <BoundariesGrid />
          </div>
        </div>

        {/* 9. Final CTA */}
        <FinalCTA />
      </main>
    </div>
  );
}
