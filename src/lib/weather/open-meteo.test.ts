import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherForecast, parseWeatherResponse } from "./open-meteo";

const start = Date.parse("2026-10-30T00:00:00Z");
function fixture() {
  const time = Array.from({ length: 72 }, (_, i) =>
    new Date(start + i * 3600000).toISOString().slice(0, 16)
  );
  return {
    latitude: 14.5995,
    longitude: 120.9842,
    timezone: "UTC",
    current: {
      time: "2026-10-30T15:00",
      temperature_2m: 27, apparent_temperature: 29, precipitation: 0,
      weather_code: 61, wind_speed_10m: 12, wind_gusts_10m: 19, is_day: 0,
    },
    hourly: {
      time,
      precipitation: Array(72).fill(2),
      precipitation_probability: Array(72).fill(40),
      wind_speed_10m: Array(72).fill(12),
      wind_gusts_10m: Array(72).fill(20),
      weather_code: Array(72).fill(61),
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T15:30:00Z"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Open-Meteo weather context", () => {
  it("parses UTC provider hours independent of the server's local timezone", () => {
    const forecast = parseWeatherResponse(fixture(), 14.5995, 120.9842);
    expect(forecast.timezone).toBe("UTC");
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.validFrom).toBe("2026-10-30T16:00:00.000Z");
    expect(forecast.validUntil).toBe("2026-10-31T15:00:00.000Z");
    expect(forecast.daily24h.totalPrecipitation).toBe(48);
    expect(forecast.current.isDay).toBe(false);
    expect(forecast.forecastReferenceTime).toBe("2026-10-30T15:00Z");
  });

  it("rejects absent rainfall data rather than misleadingly treating it as zero", () => {
    const response = fixture();
    response.hourly.precipitation = [];
    expect(() => parseWeatherResponse(response, 14.6, 121)).toThrow("precipitation");
  });

  it("rejects out-of-range probabilities and incomplete forecast windows", () => {
    const invalid = fixture();
    invalid.hourly.precipitation_probability[20] = 120;
    expect(() => parseWeatherResponse(invalid, 14.6, 121)).toThrow("out of range");

    const truncated = fixture();
    for (const key of Object.keys(truncated.hourly) as Array<keyof typeof truncated.hourly>) {
      truncated.hourly[key] = truncated.hourly[key].slice(0, 20) as never;
    }
    expect(() => parseWeatherResponse(truncated, 14.6, 121)).toThrow("incomplete");
  });

  it("requests UTC hourly values with a bounded shared-provider cache", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture(),
    });
    vi.stubGlobal("fetch", mock);
    const weather = await fetchWeatherForecast(14.5995, 120.9842);
    expect(weather.hourly).toHaveLength(24);
    const [url, options] = mock.mock.calls[0] as [string, {next:{revalidate:number}}];
    expect(new URL(url).searchParams.get("timezone")).toBe("UTC");
    expect(options.next.revalidate).toBe(600);
  });

  it("rejects invalid locations before contacting providers", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(fetchWeatherForecast(NaN, 121)).rejects.toThrow("coordinates");
    await expect(fetchWeatherForecast(95, 121)).rejects.toThrow("coordinates");
    expect(mock).not.toHaveBeenCalled();
  });
});
