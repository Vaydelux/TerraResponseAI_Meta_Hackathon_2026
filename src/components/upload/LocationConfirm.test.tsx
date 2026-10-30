import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocationConfirm } from "./LocationConfirm";

describe("disaster report location confirmation", () => {
  it("requires an explicit choice when EXIF location is missing", () => {
    const onConfirm = vi.fn();
    render(<LocationConfirm exif={null} onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Use this location" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Location unknown" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as unknown" }));
    expect(onConfirm).toHaveBeenCalledWith("unknown");
  });

  it("disallows empty, out-of-bounds and partial manual coordinates", () => {
    const onConfirm = vi.fn();
    render(<LocationConfirm exif={null} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Place pin manually" }));
    const confirm = screen.getByRole("button", { name: "Use this location" }) as HTMLButtonElement;
    const lat = screen.getByLabelText("Latitude");
    const lon = screen.getByLabelText("Longitude");
    expect(confirm.disabled).toBe(true);
    fireEvent.change(lat, { target: { value: "14.5995" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(lon, { target: { value: "200" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(lon, { target: { value: "120.9842" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("manual", { lat: 14.5995, lon: 120.9842 });
  });

  it("explicitly confirms a valid photo GPS reading", () => {
    const onConfirm = vi.fn();
    render(<LocationConfirm exif={{ lat: 14.6, lon: 121.2 }} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));
    expect(onConfirm).toHaveBeenCalledWith("gps", { lat: 14.6, lon: 121.2 });
  });
});
