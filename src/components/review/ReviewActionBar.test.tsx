// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const spies = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: spies.push, replace: spies.replace, back: spies.back,
    prefetch: spies.prefetch, refresh: spies.refresh }),
}));
vi.mock("@/components/ui-tr", () => ({
  Button: ({ children, onClick, disabled, busy, ...rest }: {
    children: React.ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean;
    [key: string]: unknown;
  }) => <button type="button" onClick={onClick} disabled={disabled || busy}>{children}</button>,
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <section role="dialog">{children}</section> : null,
  DialogActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({ children, label }: { children: React.ReactNode; label: string }) =>
    <label>{label}{children}</label>,
  Textarea: ({ value, onChange }: {
    value: string; onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  }) => <textarea value={value} onChange={onChange} />,
  toast: { success: spies.success, error: spies.error },
}));
vi.mock("./CorrectionForm", () => ({
  CorrectionForm: ({ open, onSubmitted }: {
    open: boolean; onSubmitted?: (x: unknown) => void;
  }) => open ? <button type="button" onClick={() => onSubmitted?.({})}>
    Submit correction (mock success)
  </button> : null,
}));
import { ReviewActionBar } from "./ReviewActionBar";

const observation = { incidentType: null, summary: null, severity: null,
  visibleEvidence: [], uncertainties: [], analysisAvailable: false };
function show(overrides?: Record<string, unknown>) {
  return render(<ReviewActionBar reportId="report-1" isOwnReport={false}
    canReview isLastInQueue queuePosition={{ current: 1, total: 1 }}
    status="needs_manual_review" reviewOutcome={null} observation={observation}
    {...overrides}/>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("human reviewer action wiring", () => {
  it.each(["Confirm", "Flag"] as const)("posts the correct %s action, updates state, prevents double submission", async (title) => {
    const onReviewCommitted = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ ok: true, newStatus: "reviewed",
        reviewOutcome: title === "Confirm" ? "confirmed" : "flagged" }) });
    vi.stubGlobal("fetch", fetcher);
    show({ onReviewCommitted });
    fireEvent.click(screen.getByRole("button", { name: title }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/reports/report-1/review");
    const payload = JSON.parse(String(options.body));
    expect(payload.action).toBe(title.toLowerCase());
    expect(payload.requestId).toBeTruthy();
    await waitFor(() => expect(onReviewCommitted).toHaveBeenCalledWith({
      status: "reviewed", reviewOutcome: title === "Confirm" ? "confirmed" : "flagged",
    }));
    expect((screen.getByRole("button", { name: title }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens correction UI and forwards its successful submission", () => {
    const onReviewCommitted = vi.fn();
    show({ onReviewCommitted });
    fireEvent.click(screen.getByRole("button", { name: "Correct" }));
    expect(screen.getByRole("button", { name: "Submit correction (mock success)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit correction (mock success)" }));
    expect(onReviewCommitted).toHaveBeenCalledWith({
      status: "reviewed", reviewOutcome: "confirmed",
    });
  });

  it("requires an auditable reason for rejection", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ ok: true, newStatus: "reviewed", reviewOutcome: "rejected" }) });
    vi.stubGlobal("fetch", fetcher);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect((screen.getByRole("button", { name: "Reject report" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Not relevant to the incident" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject report" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(payload.action).toBe("reject");
    expect(payload.reason).toBe("Not relevant to the incident");
  });

  it("locks all review actions for unassigned event roles", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    show({ canReview: false, restrictionReason: "Event reviewer access required" });
    expect(screen.getByRole("alert").textContent).toContain("Event reviewer access required");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not offer a repeat call on 403 denial", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403,
      json: async () => ({ error: { code: "FORBIDDEN", message: "Review permission denied" } }) }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Flag" }));
    await waitFor(() => expect(spies.error).toHaveBeenCalled());
    expect(spies.error.mock.calls.at(-1)?.[0]).toContain("Review permission denied");
    expect(spies.error.mock.calls.at(-1)?.[1]).toBeUndefined();
  });
});
