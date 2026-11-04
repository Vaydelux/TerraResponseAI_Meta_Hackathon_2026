// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlaceSearch } from "./PlaceSearch";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("map place search privacy and coordinate fallback", () => {
  it("locates manually entered coordinates without a provider request", () => {
    const onSelect = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PlaceSearch onSelect={onSelect} />);
    fireEvent.change(screen.getByTestId("location-place-search"), { target: { value: "14.6331, 121.0942" } });
    fireEvent.click(screen.getByRole("button", { name: /Locate coordinates:/ }));
    expect(onSelect).toHaveBeenCalledWith({
      id: "coordinates", source: "coordinates", lat: 14.6331,
      lon: 121.0942, label: "14.63310, 121.09420",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid locations and does not invent matching places", () => {
    const onSelect = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PlaceSearch onSelect={onSelect} />);
    fireEvent.change(screen.getByTestId("location-place-search"), { target: { value: "140, 121" } });
    expect(screen.getByText(/Coordinates outside valid ranges/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Locate coordinates:/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
