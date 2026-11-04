// src/app/page.tsx
//
// Landing page — Responsive & User-Friendly layout with Day / Night Ops
// theme support in the sticky top bar.

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
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default async function LandingPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getServerUser() : null;
  const signedIn = !!user;

  return (
    <div className="tr-shell" style={{ background: "var(--paper)", gridTemplateRows: "var(--nav-h) 1fr auto" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <nav className="nav" aria-label="Page sections">
          <a className="nav__link" href="#how-it-works">How it works</a>
          <a className="nav__link" href="#incident-map-preview">Map preview</a>
        </nav>
        <div className="topbar__spacer" />
        <ThemeToggle />
        {signedIn ? (
          <a className="btn btn--primary" href="/dashboard">Open workspace</a>
        ) : (
          <a className="btn btn--primary" href="/login">Sign in</a>
        )}
      </header>
      <main id="main-content" tabIndex={-1} style={{ overflowX: "hidden" }}>
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
          <TrustModelDiagram />

          {/* 8. Responsible AI */}
          <BoundariesGrid />
        </div>

        {/* 9. Final CTA */}
        <FinalCTA />
      </main>
      <footer className="tr-status-footer">
        <span>TerraResponse AI · Disaster-Photo Intelligence &amp; Human Review</span>
        <span>Built for Emergency Response Teams · Day &amp; Night Ops Ready</span>
      </footer>
    </div>
  );
}
