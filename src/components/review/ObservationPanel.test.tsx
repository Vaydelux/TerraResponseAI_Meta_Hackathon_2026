import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ObservationPanel } from "./ObservationPanel";

const empty = {
  incidentType: null, summary: null, severity: null,
  visibleEvidence: [], uncertainties: [], analysisAvailable: false,
};

describe("reviewer observation provenance", () => {
  it("never labels unavailable model output as severity 1 or model findings", () => {
    const html = renderToStaticMarkup(<ObservationPanel
      status="needs_manual_review" reviewOutcome={null}
      observation={empty} priorityScore={21} priorityFactors={[]} />);
    expect(html).toContain("Not assessed");
    expect(html).toContain("no validated AI severity");
    expect(html).toContain("No validated model evidence");
    expect(html).not.toContain('aria-label="Severity 1');
    expect(html).not.toContain("The model produced no visible-evidence observations");
  });
  it("labels reviewer-written corrections on a failed model as human-only", () => {
    const html = renderToStaticMarkup(<ObservationPanel
      status="reviewed" reviewOutcome="confirmed"
      observation={{ ...empty, analysisAvailable: true, humanOnlyAssessment: true,
        incidentType: "visible_structural_damage", summary: "Building appears collapsed",
        severity: 4, visibleEvidence: ["Damaged facade"], uncertainties: ["Unverified capture date"] }}
      priorityScore={42} priorityFactors={[]} />);
    expect(html).toContain("Human-recorded assessment");
    expect(html).toContain("What the reviewer recorded");
    expect(html).toContain("Reviewer-recorded uncertainties");
    expect(html).not.toContain("What the model saw");
  });
});
