// src/lib/demo-mode.ts
//
// Server-side read of the DEMO_MODE env var. When "1", the app is
// in demo mode: a "Demonstration Data — not a live disaster" banner
// is shown on every page, and the report cards / detail views show
// a "DEMO" badge. Per the brief:
//   - "Any simulation must be visibly identified as demonstration
//     data, not a live disaster report."
//   - "Precomputed mock outputs must never be falsely labeled as
//     live Meta inference."
//
// This module is server-only (no NEXT_PUBLIC_ prefix). The
// isDemoMode() function is called from server components (the
// app shell, the report-detail page) to decide whether to render
// the demo banner + the demo badge. The client components read
// the flag via a prop passed from the server (no env var is
// exposed to the browser).

/**
 * Returns true when DEMO_MODE=1 is set in the environment. Server-only.
 * The value is read once per call (no caching — env vars don't
 * change at runtime).
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * The model_id of the precomputed mock analysis (set by
 * scripts/seed-demo.ts). The report-detail UI uses this to
 * decide whether to show the "Demo mock" label vs the live
 * "Muse Spark 1.3" label.
 */
export const DEMO_MOCK_MODEL_ID = "demo-mock-v1";

/**
 * Returns true when the given model_id is the demo mock. Used by
 * the report-detail UI to switch the "Model:" label.
 */
export function isDemoMockModelId(modelId: string | undefined | null): boolean {
  return modelId === DEMO_MOCK_MODEL_ID;
}
