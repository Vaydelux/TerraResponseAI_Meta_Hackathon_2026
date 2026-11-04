// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MaskControl } from "./MaskControl";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("reviewer-guided SAM actions", () => {
  it("requires deliberate manual target and does not auto-run paid inference", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<MaskControl reportId="test" status="needs_manual_review"
      samAvailable canRequest analysisTarget={null} />);
    expect((screen.getByRole("button", { name: "Generate optional mask" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Muse analysis was unavailable/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mask target"), { target: { value: "collapsed building" } });
    expect((screen.getByRole("button", { name: "Generate optional mask" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not offer retry for permanent 409 failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 409, json: async () => ({ error: { code: "INVALID_STATE",
        message: "Report changed; reload first." } }),
    }));
    render(<MaskControl reportId="test" status="needs_manual_review" samAvailable
      canRequest analysisTarget={null}/>);
    fireEvent.change(screen.getByLabelText("Mask target"), { target: { value: "debris" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate optional mask" }));
    expect(await screen.findByText(/Report changed; reload first/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });
  it("never sends a paid call without event-level permission", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<MaskControl reportId="test" status="needs_review" samAvailable
      canRequest={false} unavailableReason="Event reviewer access required" analysisTarget="debris" />);
    expect((screen.getByRole("button", { name: "Generate optional mask" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Event reviewer access required")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("treats no match as valid empty output without a fabricated mask", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: false, kind: "no_match" }),
    }));
    render(<MaskControl reportId="test" status="needs_review" samAvailable canRequest
      analysisTarget="debris" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate optional mask" }));
    expect(await screen.findByText(/did not find a matching object/)).toBeTruthy();
    expect(screen.queryByText(/real decoded mask/)).toBeNull();
  });
});
