import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("exifr", () => ({ default: { gps: vi.fn().mockResolvedValue(null) } }));
vi.mock("./Dropzone", () => ({
  Dropzone: ({ onFiles }: { onFiles: (files: File[]) => void }) => (
    <button type="button" onClick={() => onFiles([new File(["photo"], "test.jpg", { type: "image/jpeg" })])}>
      Choose test photo
    </button>
  ),
}));
vi.mock("./LocationConfirm", () => ({
  LocationConfirm: ({ onConfirm }: { onConfirm: (choice: "unknown") => void }) => (
    <button type="button" onClick={() => onConfirm("unknown")}>Use unknown location</button>
  ),
}));
vi.mock("./FileCheckList", () => ({ FileCheckList: () => <span>File status</span> }));
vi.mock("./UploadProgress", () => ({ UploadProgress: () => <span>Uploading</span> }));
vi.mock("@/components/report/StatusTimeline", () => ({
  StatusTimeline: ({ status }: { status: string }) => <div>Timeline: {status}</div>,
}));
vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ui-tr", () => ({
  Field: ({ children, label, htmlFor }: { children: React.ReactNode; label: string; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{label}{children}</label>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Button: ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) => (
    <button type="button" disabled={disabled} onClick={onClick}>{children}</button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}));

import { UploadFlow } from "./UploadFlow";

class FakeXMLHttpRequest {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  responseText = JSON.stringify({ ok: true, reportId: "a1111111-1111-4111-8111-111111111111" });
  status = 201;
  open() {}
  send() { queueMicrotask(() => this.onload?.()); }
  abort() { this.onabort?.(); }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("upload → authenticated analysis handoff", () => {
  it("sends one analysis request only after the photo has been saved", async () => {
    const modelCall = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, observation: { needs_review: true } }),
    });
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    vi.stubGlobal("fetch", modelCall);

    render(<UploadFlow eventId="b2222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test photo" }));
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    await waitFor(() => expect(continueButton.disabled).toBe(false));
    expect(modelCall).not.toHaveBeenCalled();
    fireEvent.click(continueButton);
    fireEvent.click(screen.getByRole("button", { name: "Use unknown location" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(modelCall).toHaveBeenCalledTimes(1));
    expect(modelCall).toHaveBeenCalledWith(
      "/api/reports/a1111111-1111-4111-8111-111111111111/analyze",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/AI observations were saved/i)).toBeTruthy();
    expect(screen.getByText("Timeline: needs_review")).toBeTruthy();
  });

  it("treats an exact-duplicate link as an existing report, never new inference", async () => {
    class LinkedXMLHttpRequest extends FakeXMLHttpRequest {
      responseText = JSON.stringify({
        ok: true,
        linkedTo: "c3333333-3333-4333-8333-333333333333",
      });
      status = 200;
    }
    const modelCall = vi.fn();
    vi.stubGlobal("XMLHttpRequest", LinkedXMLHttpRequest);
    vi.stubGlobal("fetch", modelCall);
    render(<UploadFlow eventId="b2222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test photo" }));
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    await waitFor(() => expect(continueButton.disabled).toBe(false));
    fireEvent.click(continueButton);
    fireEvent.click(screen.getByRole("button", { name: "Use unknown location" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Linked to existing report")).toBeTruthy();
    expect(screen.getByText(/No additional report was created/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open existing report" }).getAttribute("href"))
      .toBe("/reports/c3333333-3333-4333-8333-333333333333");
    expect(modelCall).not.toHaveBeenCalled();
  });

  it("retains the uploaded report and shows a real failure if the model is unavailable", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({ error: { code: "NOT_CONFIGURED" } }),
    }));
    render(<UploadFlow eventId="b2222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test photo" }));
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    await waitFor(() => expect(continueButton.disabled).toBe(false));
    fireEvent.click(continueButton);
    fireEvent.click(screen.getByRole("button", { name: "Use unknown location" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText(/report were saved, but automated analysis did not complete/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the report" })).toBeTruthy();
  });
});
