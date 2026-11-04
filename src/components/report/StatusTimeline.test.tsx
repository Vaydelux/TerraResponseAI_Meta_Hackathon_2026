import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusTimeline } from "./StatusTimeline";

describe("honest report status progression", () => {
  it("never claims schema validation when an analysis has failed", () => {
    const html = renderToStaticMarkup(<StatusTimeline status="needs_manual_review" />);
    expect(html).toContain("Analyzed");
    expect(html).toContain("failed");
    expect(html).toContain("No validated AI observation was saved");
    expect(html).not.toContain("AI observation produced, schema validated");
  });
  it("explains retryable model output without marking file-check stage as failed", () => {
    const html = renderToStaticMarkup(<StatusTimeline status="retryable_error" />);
    expect(html).toContain("saved and can be retried");
    expect(html).not.toContain("AI observation produced, schema validated");
  });
  it("labels successful model observations only when the status supports it", () => {
    const html = renderToStaticMarkup(<StatusTimeline status="needs_review" />);
    expect(html).toContain("AI observation produced, schema validated");
    expect(html).not.toContain("No validated AI observation was saved");
  });
});
