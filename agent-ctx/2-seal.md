# Task 2 — Seal components

## Files created
- `src/components/seal/SealIcons.tsx` — per-state inline SVG icons (18×18)
- `src/components/seal/SealBadge.tsx` — `.seal .seal--{state}` pill with hatch overlay + icon + label (aria-live)
- `src/components/seal/ProvenanceLine.tsx` — `.provenance` line with `.provenance__model[--demo]` chip
- `src/components/seal/VerificationSeal.tsx` — composes SealBadge + ProvenanceLine
- `src/components/seal/HatchSurface.tsx` — `.pending-surface[data-state]` wrapper
- `src/components/seal/index.ts` — re-exports

## Notes for next agents
- The seal's `data-resolving="true"` attribute drives the seal-stamp animation; the parent (ReviewActionBar) toggles it during a review action.
- ProvenanceLine reads `SEAL_LABEL` + `COPY.provenance` so the canonical copy never drifts.
- `isDemo` switches the model chip to `.provenance__model--demo` (brick wash) so demo observations are never mistaken for live Meta inference.
- HatchSurface carries `data-state` for the band's color; the parent `.obs[data-state]` carries it for descendant rules (e.g. evidence-list marks).
