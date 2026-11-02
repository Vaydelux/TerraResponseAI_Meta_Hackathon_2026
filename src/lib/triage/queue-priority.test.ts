import { describe, expect, it } from "vitest";
import { rankQueue, triageLabel, type QueueTriageInput } from "./queue-priority";
import { readFileSync } from "node:fs";

function row(label: QueueTriageInput["report_triage"], score = 25, age = "2026-10-31T00:00:00Z") {
  return { priority_score: score, uploaded_at: age, report_triage: label };
}
const ofClass = (triage_class: NonNullable<QueueTriageInput["report_triage"]>["triage_class"]) =>
  ({ triage_class, verification_status: "awaiting_human" });

describe("human review queue prioritization", () => {
  it("places provisional critical and high observations before moderate/low/uncertain classes", () => {
    const unordered = [
      row(ofClass("low_review")),
      row(ofClass("moderate_review")),
      row(ofClass("critical_provisional")),
      row(ofClass("uncertain_review")),
      row(ofClass("high_review")),
      row(ofClass("unrelated_review")),
    ];
    expect(rankQueue(unordered).map(x => x.report_triage?.triage_class)).toEqual([
      "critical_provisional", "high_review", "moderate_review",
      "uncertain_review", "low_review", "unrelated_review",
    ]);
    expect(unordered[0].report_triage?.triage_class).toBe("low_review"); // unchanged input
  });

  it("uses existing priority score then oldest upload within matching classes", () => {
    const a = row(ofClass("moderate_review"), 40, "2026-11-01T00:00:00Z");
    const b = row(ofClass("moderate_review"), 80, "2026-11-02T00:00:00Z");
    const c = row(ofClass("moderate_review"), 40, "2026-10-30T00:00:00Z");
    expect(rankQueue([a,b,c])).toEqual([b,c,a]);
  });

  it("does not mislabel a predicted critical hazard as verified", () => {
    expect(triageLabel(row(ofClass("critical_provisional")))).toBe("Critical · AI-assessed");
    expect(triageLabel(row(null))).toBe("Awaiting triage");
  });

  it("queries triage only when migrations are feature enabled", () => {
    const api = readFileSync("src/app/api/reports/route.ts", "utf8");
    const ui = readFileSync("src/components/review/ReviewQueueTable.tsx", "utf8");
    expect(api).toContain('isTriageEnabled() && url.searchParams.get("include_triage") === "true"');
    expect(api).toContain("report_triage(triage_class,preliminary_severity,verification_status)");
    expect(ui).toContain('include_triage: "true"');
    expect(ui).toContain("rankQueue([...unique.values()])");
    expect(ui).toContain("triageLabel(r)");
  });
});
