import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Hero } from "./Hero";
import { MapPreview } from "./MapPreview";
import { SampleImage } from "./SampleImage";
import { CinematicHero } from "./CinematicHero";

function mediaPreference(matches: boolean, media = "") {
  return Object.assign(new EventTarget(), { matches, media });
}

beforeEach(() => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => mediaPreference(query.includes("reduced-motion"), query)));
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("landing demo interactions", () => {
  it("connects focusable native sample pins with selected details and pressed state", () => {
    render(<MapPreview />);
    const flood = screen.getByRole("button", { name: "Select sample: Flooded corridor" });
    const debris = screen.getByRole("button", { name: "Select sample: Debris near an access road" });
    expect(flood.getAttribute("aria-pressed")).toBe("true");
    expect(debris.tagName).toBe("BUTTON");
    debris.focus();
    expect(document.activeElement).toBe(debris);
    fireEvent.click(debris);
    expect(screen.getByRole("heading", { name: "Debris near an access road" })).toBeTruthy();
    expect(debris.getAttribute("aria-pressed")).toBe("true");
    expect(flood.getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById(debris.getAttribute("aria-controls")!)?.contains(screen.getByRole("heading", { name: "Debris near an access road" }))).toBe(true);
    expect(document.activeElement).toBe(debris);
  });

  it("keeps the synthetic disclosure after a local review simulation and reset", () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole("button", { name: "Simulate a reviewer decision" }));
    expect(screen.getByText("AI generated, not verified")).toBeTruthy();
    expect(screen.getByText(/sample remains synthetic and unverified/)).toBeTruthy();
    const reset = screen.getByRole("button", { name: "Reset the local simulation" });
    expect(reset.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(reset);
    expect(screen.getByRole("button", { name: "Simulate a reviewer decision" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("AI generated, not verified")).toBeTruthy();
  });
});

describe("sample image recovery", () => {
  it("shows loading, preserves provenance on failure, and retries a decodable image", async () => {
    render(<SampleImage />);
    expect(screen.getByText("Loading sample image…")).toBeTruthy();
    const failedImage = screen.getByRole("img");
    fireEvent.error(failedImage);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Sample image unavailable/)).toBeTruthy();
    expect(screen.getByText("AI generated, not verified")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry sample image" }));
    const retriedImage = screen.getByRole("img");
    expect(retriedImage).not.toBe(failedImage);
    Object.defineProperty(retriedImage, "naturalWidth", { value: 1200 });
    const decode = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(retriedImage, "decode", { value: decode });
    await act(async () => { fireEvent.load(retriedImage); });
    expect(decode).toHaveBeenCalledOnce();
    expect(screen.queryByText("Loading sample image…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry sample image" })).toBeNull();
  });

  it("treats a decode rejection as unavailable rather than showing corrupt imagery", async () => {
    render(<SampleImage />);
    const image = screen.getByRole("img");
    Object.defineProperty(image, "decode", { value: vi.fn().mockRejectedValue(new Error("decode failed")) });
    await act(async () => { fireEvent.load(image); });
    expect(screen.getByRole("button", { name: "Retry sample image" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("resets on a new source and ignores decoding that finishes for the old source", async () => {
    const { rerender } = render(<SampleImage src="/old-synthetic.png" />);
    const oldImage = screen.getByRole("img");
    let finishOldDecode!: () => void;
    Object.defineProperty(oldImage, "naturalWidth", { value: 1200 });
    Object.defineProperty(oldImage, "decode", { value: () => new Promise<void>((resolve) => { finishOldDecode = resolve; }) });
    fireEvent.load(oldImage);
    rerender(<SampleImage src="/new-synthetic.png" />);
    const newImage = screen.getByRole("img");
    expect(newImage.getAttribute("src")).toBe("/new-synthetic.png");
    expect(screen.getByText("Loading sample image…")).toBeTruthy();
    fireEvent.error(newImage);
    await act(async () => { finishOldDecode(); });
    expect(screen.getByRole("button", { name: "Retry sample image" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("decorative media fallback", () => {
  const sources = [{ src: "/sample.mp4", type: "video/mp4" }];

  it("keeps content and poster without video when motion is reduced or preference detection is absent", async () => {
    const { container, rerender } = render(<CinematicHero poster="/poster.jpg" sources={sources}><h2>Usable product content</h2></CinematicHero>);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector('[style*="poster.jpg"]')).toBeTruthy();
    vi.stubGlobal("matchMedia", undefined);
    rerender(<CinematicHero poster="/replacement-poster.jpg" sources={sources}><h2>Usable product content</h2></CinematicHero>);
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Usable product content" })).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
  });

  it("handles blocked autoplay and removes video if the motion preference changes", async () => {
    const reducedMotion = mediaPreference(false);
    const reducedData = mediaPreference(false);
    vi.stubGlobal("matchMedia", vi.fn((query: string) => query.includes("reduced-motion") ? reducedMotion : reducedData));
    vi.stubGlobal("IntersectionObserver", undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("Autoplay blocked"));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(<CinematicHero poster="/poster.jpg" sources={sources}><h2>Usable product content</h2></CinematicHero>);
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Play background video" })).toBeTruthy();
    act(() => { reducedMotion.matches = true; reducedMotion.dispatchEvent(new Event("change")); });
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("heading", { name: "Usable product content" })).toBeTruthy();
  });
});
