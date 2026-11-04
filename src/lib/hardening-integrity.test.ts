import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const file = (path: string) => readFileSync(path, "utf8");

describe("hackathon UX and evidence safeguards", () => {
  it("never overrides report evidence retention as active", () => {
    const ui = file("src/components/review/ReviewWorkbench.tsx");
    const api = file("src/app/api/reports/[id]/route.ts");
    expect(ui).toContain('retentionState={detail.retention_state ?? "active"}');
    expect(api).toContain("retention_state");
  });
  it("never injects map API data into innerHTML", () => {
    const map = file("src/components/map/IncidentMap.tsx");
    expect(map).not.toMatch(/\.innerHTML\s*=/);
    expect(map).toContain('document.createElement("button")');
    // The newer read-only map uses an already authorized server snapshot.
    // Validate real MapLibre listener cleanup instead of a removed viewport fetch.
    expect(map).toContain('map.on("error", onMapError)');
    expect(map).toContain('canvas.addEventListener("webglcontextlost", onContextLost)');
    expect(map).toContain('observer?.disconnect()');
  });
  it("has real browser-side EXIF parsing with a no-location fallback", () => {
    const upload = file("src/components/upload/UploadFlow.tsx");
    expect(upload).toContain('import("exifr")');
    expect(upload).toContain('setExif(null)');
    expect(upload).toContain('fileSequenceRef.current');
    expect(upload).toContain('meta.locationSource = "unknown"');
  });
  it("keeps migration verification dry-run only", () => {
    const action = file(".github/workflows/supabase-staging-preview.yml");
    expect(action).toContain("workflow_dispatch:");
    expect(action).toContain("inputs.project_ref");
    expect(action).toContain("supabase db push --dry-run");
    expect(action).not.toMatch(/run:\s*supabase db push\s*$/m);
  });
});
