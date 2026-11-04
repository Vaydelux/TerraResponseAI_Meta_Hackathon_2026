// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { isUsableAiUsage, SpendCeilings } from "./SpendCeilings";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const payload = {
  ok: true, day: "2026-11-05",
  summary: { totalCostUsd: 0.0123, totalRequests: 2, byOutcome: { succeeded: 1, rate_limited: 1 } },
  ceilings: { dailySpendCeilingUsd: 50, dailyRequestCeiling: 1000, perEventBudget: 500, perUserAiCallsPerHour: 30 },
  caveat: "Provider bill is the source of truth.",
};

describe("auditable admin AI spend view", () => {
  it("validates shape before displaying costs", () => {
    expect(isUsableAiUsage(payload)).toBe(true);
    expect(isUsableAiUsage({ ok: true, summary: {} })).toBe(false);
    expect(isUsableAiUsage({ ...payload, summary: { ...payload.summary, totalCostUsd: NaN } })).toBe(false);
  });

  it("only renders true global totals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<SpendCeilings />);
    expect(await screen.findByText("Global daily recorded estimate")).toBeTruthy();
    expect(screen.getByText("Global daily request records")).toBeTruthy();
    expect(screen.getByText(/Per-user and per-event spend: unavailable/)).toBeTruthy();
    expect(screen.queryByText("Per user")).toBeNull();
  });

  it("shows failure, not fake zero spend, on unavailable backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({ error: { code: "AI_USAGE_UNAVAILABLE" } }),
    }));
    render(<SpendCeilings />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("AI usage is unavailable"));
    expect(screen.queryByText("Global daily recorded estimate")).toBeNull();
  });
});
