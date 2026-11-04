import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { ReviewedMapIndex, reviewedLocatedReports } from "./ReviewedMapIndex";
import type { IncidentMapReport } from "./IncidentMap";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    <a href={href} {...rest}>{children}</a>,
}));

const id = "a1111111-1111-4111-8111-111111111111";
function report(overrides: Partial<IncidentMapReport> = {}): IncidentMapReport {
  return {
    id, title: "Staging synthetic report", status: "reviewed",
    review_outcome: "confirmed", latitude: 14.5995, longitude: 120.9842,
    priority_score: 45, ...overrides,
  };
}

describe("human-reviewed map index", () => {
  it("only includes confirmed or resolved, physically located, reviewed rows", () => {
    const reports = [
      report(),
      report({ id: "b2222222-2222-4222-8222-222222222222", review_outcome: "resolved" }),
      report({ id: "c3333333-3333-4333-8333-333333333333", status: "needs_review", review_outcome: null }),
      report({ id: "d4444444-4444-4444-8444-444444444444", review_outcome: "rejected" }),
      report({ id: "e5555555-5555-4555-8555-555555555555", latitude: Number.NaN }),
      report({ id: "f6666666-6666-4666-8666-666666666666", longitude: 181 }),
    ];
    const accepted = reviewedLocatedReports(reports);
    expect(accepted.map((r) => r.id)).toEqual([id, "b2222222-2222-4222-8222-222222222222"]);
  });

  it("renders a real report link and never includes pending AI-only reports", () => {
    const html = renderToStaticMarkup(<ReviewedMapIndex reports={[
      report(), report({ id: "c3333333-3333-4333-8333-333333333333", status: "needs_review", review_outcome: null }),
    ]} />);
    expect(html).toContain("Human-confirmed located reports");
    expect(html).toContain(`data-testid="reviewed-map-report-${id}"`);
    expect(html).toContain(`href="/reports/${id}"`);
    expect(html).not.toContain("reviewed-map-report-c3333333");
    expect(html).toContain("does not authenticate the photo");
  });

  it("provides a clearly fictional fallback when no report is human confirmed", () => {
    const html = renderToStaticMarkup(<ReviewedMapIndex reports={[report({ status: "needs_review", review_outcome: null })]} />);
    expect(html).toContain("No located report has been confirmed");
    expect(html).toContain("fictional map preview");
    expect(html).toContain('href="/#incident-map-preview"');
  });
});
