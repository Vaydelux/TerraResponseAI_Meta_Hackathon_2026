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
import { WorkspaceLink } from "@/components/landing/WorkspaceLink";

export default async function LandingPage() {
  const configured = isSupabaseConfigured();
  let accountUnavailable = false;
  const user = configured ? await getServerUser().catch(() => { accountUnavailable = true; return null; }) : null;
  const signedIn = !!user;

  return (
    <div className="grid min-h-dvh min-w-0 grid-rows-[auto_1fr_auto] bg-[var(--paper)]">
      <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[var(--sheet)]">
        <div className="mx-auto grid w-full max-w-[var(--content-max)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:px-6 lg:px-10">
          <Wordmark />
          <nav className="hidden items-center gap-2 xl:flex" aria-label="Page sections">
            <a className="inline-flex min-h-12 items-center rounded-[var(--r-ctl)] px-3 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tide)] active:bg-[var(--tide-wash)] motion-reduce:transition-none" href="#how-it-works">How it works</a>
            <a className="inline-flex min-h-12 items-center rounded-[var(--r-ctl)] px-3 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--sheet-sunk)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tide)] active:bg-[var(--tide-wash)] motion-reduce:transition-none" href="#incident-map-preview">Sample incidents</a>
          </nav>
          <div className="hidden sm:block sm:flex-1" />
          <ThemeToggle />
          <WorkspaceLink signedIn={signedIn} className="col-span-2 sm:w-auto" />
        </div>
        {accountUnavailable && <p role="status" className="mx-auto w-full max-w-[var(--content-max)] px-4 pb-3 text-sm text-[var(--ink-2)] sm:px-6 lg:px-10">Account status is unavailable. You can explore the public illustration and try signing in again.</p>}
      </header>
      <main id="main-content" tabIndex={-1} className="grid min-w-0">
        {/* 1. Cinematic hero with video background + interactive demo */}
        <Hero signedIn={signedIn} />

        {/* 2. Why this matters */}
        <WhyThisMatters />

        {/* 3. How it works (demo flow) */}
        <div className="mx-auto w-full max-w-[var(--content-max)] min-w-0 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
          <DemoFlow />

          {/* 4. Live incident map preview */}
          <MapPreview signedIn={signedIn} />

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
        <FinalCTA signedIn={signedIn} />
      </main>
      <footer className="border-t border-[var(--rule)] bg-[var(--sheet)] px-4 py-6 text-sm text-[var(--ink-2)] sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-[var(--content-max)] min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
          <p>TerraResponse AI · Disaster-photo intelligence &amp; human review</p>
          <p>Decision-support prototype · Not an emergency dispatch service</p>
        </div>
      </footer>
    </div>
  );
}
