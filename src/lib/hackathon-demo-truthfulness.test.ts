import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const file = (path: string) => readFileSync(path, "utf8");

describe("hackathon demo must not fabricate real operations", () => {
  it("shows real upload results instead of false pre-upload Meta inference", () => {
    const upload = file("src/components/upload/UploadFlow.tsx");
    expect(upload).not.toContain("applyAiSuggestions");
    expect(upload).not.toContain("auto-drafted by Meta AI Vision");
    expect(upload).not.toContain("Extracting hazard vectors & confidence telemetry");
    expect(upload).toContain("Real Meta analysis happens after the photo is saved");
  });
  it("never fakes rescue dispatch, water levels or confirmations", () => {
    const workspace = file("src/components/report/DashboardCommandWorkspace.tsx");
    expect(workspace).not.toContain("Dispatched triage telemetry");
    expect(workspace).not.toContain("Broadcast Siren Advisory");
    expect(workspace).not.toContain("Marikina Bridge Sensor Station");
    expect(workspace).not.toContain("Authorize Pre-position");
    expect(workspace).not.toContain("Meta Llama Vision · Live Model");
    expect(workspace).not.toContain('badge: "98%"');
    expect(workspace).toContain("No review activity recorded yet");
  });
  it("never claims verification with no submitted reports or from rejection", () => {
    const dashboard = file("src/app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain('.eq("review_outcome", "confirmed")');
    expect(dashboard).toContain('totalReviewed / totalReceived) * 100) : 0');
    expect(dashboard).not.toContain("Metro Manila Sector 04");
    expect(dashboard).not.toContain("Live Telemetry Synced");
    expect(dashboard).not.toContain('Math.max(1, awaitingReview)');
    expect(dashboard).not.toContain('badge: "98%"');
  });
});
