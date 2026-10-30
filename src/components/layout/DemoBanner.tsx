// src/components/layout/DemoBanner.tsx
//
// The demo-mode banner. Replaces src/components/terra/demo-banner.tsx
// with the new `.demo-banner` CSS class. The banner reads the env
// flag server-side (no client interaction); the parent (root
// layout) conditionally renders it.
//
// Server-component friendly.

import { isDemoMode } from "@/lib/demo-mode";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="demo-banner" role="alert" aria-live="assertive">
      Demonstration data — not a live disaster report
    </div>
  );
}
