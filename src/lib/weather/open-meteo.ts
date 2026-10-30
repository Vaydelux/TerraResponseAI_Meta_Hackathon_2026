// src/lib/weather/open-meteo.ts
//
// Open-Meteo Forecast API client. Server-only — never imported by
// client components. The browser calls the application's own API
// route (/api/weather), which uses this module.
//
// Open-Meteo is free, no API key required, supports global coverage.
// Docs: https://open-meteo.com/en/docs

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 8000;

export interface WeatherForecast {
  provider: string;
  providerModel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  retrievedAt: string;
  forecastReferenceTime: string;
  validFrom: string;
  validUntil: string;
  current: {
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    weatherCode: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    isDay: boolean;
  };
  hourly: Array<{
    time: string;
    precipitation: number;
    precipitationProbability: number;
    windSpeed: number;
    windGusts: number;
    weatherCode: number;
  }>;
  daily24h: {
    totalPrecipitation: number;
    maxPrecipitationProbability: number;
    maxWindSpeed: number;
    maxWindGusts: number;
  };
}

export async function fetchWeatherForecast(
  lat: number,
  lon: number,
): Promise<WeatherForecast> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid coordinates");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Coordinates out of bounds");
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day",
    ].join(","),
    hourly: [
      "precipitation",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "weather_code",
    ].join(","),
    timezone: "auto",
    forecast_days: "2",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
  });

  const url = `${OPEN_METEO_BASE}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Weather API request timed out");
    }
    throw new Error(`Weather API request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Weather API returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseWeatherResponse(data, lat, lon);
}

function parseWeatherResponse(data: unknown, lat: number, lon: number): WeatherForecast {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== "object") throw new Error("Invalid weather response");

  const current = d.current as Record<string, unknown> | undefined;
  const hourly = d.hourly as Record<string, unknown> | undefined;
  const daily = d.daily as Record<string, unknown> | undefined;
  if (!current || !hourly) throw new Error("Missing current or hourly data");

  const hourlyTimes = (hourly.time as string[]) ?? [];
  const hourlyPrecip = (hourly.precipitation as number[]) ?? [];
  const hourlyPrecipProb = (hourly.precipitation_probability as number[]) ?? [];
  const hourlyWind = (hourly.wind_speed_10m as number[]) ?? [];
  const hourlyGusts = (hourly.wind_gusts_10m as number[]) ?? [];
  const hourlyCodes = (hourly.weather_code as number[]) ?? [];

  const now = new Date();
  const hourlyData: WeatherForecast["hourly"] = [];
  for (let i = 0; i < hourlyTimes.length && i < 48; i++) {
    const t = new Date(hourlyTimes[i]);
    if (t < now) continue;
    hourlyData.push({
      time: hourlyTimes[i],
      precipitation: hourlyPrecip[i] ?? 0,
      precipitationProbability: hourlyPrecipProb[i] ?? 0,
      windSpeed: hourlyWind[i] ?? 0,
      windGusts: hourlyGusts[i] ?? 0,
      weatherCode: hourlyCodes[i] ?? 0,
    });
    if (hourlyData.length >= 24) break;
  }

  const next24 = hourlyData.slice(0, 24);
  const totalPrecip = next24.reduce((sum, h) => sum + h.precipitation, 0);
  const maxPrecipProb = Math.max(...next24.map((h) => h.precipitationProbability), 0);
  const maxWind = Math.max(...next24.map((h) => h.windSpeed), 0);
  const maxGusts = Math.max(...next24.map((h) => h.windGusts), 0);

  return {
    provider: "Open-Meteo",
    providerModel: (d.model as string) ?? "Best-match",
    latitude: (d.latitude as number) ?? lat,
    longitude: (d.longitude as number) ?? lon,
    timezone: (d.timezone as string) ?? "UTC",
    retrievedAt: new Date().toISOString(),
    forecastReferenceTime:
      (daily?.time?.[0] as string) ?? new Date().toISOString().slice(0, 10),
    validFrom: hourlyData[0]?.time ?? new Date().toISOString(),
    validUntil: hourlyData[hourlyData.length - 1]?.time ?? new Date().toISOString(),
    current: {
      temperature: (current.temperature_2m as number) ?? null,
      apparentTemperature: (current.apparent_temperature as number) ?? null,
      precipitation: (current.precipitation as number) ?? null,
      weatherCode: (current.weather_code as number) ?? null,
      windSpeed: (current.wind_speed_10m as number) ?? null,
      windGusts: (current.wind_gusts_10m as number) ?? null,
      isDay: Boolean(current.is_day ?? true),
    },
    hourly: hourlyData,
    daily24h: {
      totalPrecipitation: Math.round(totalPrecip * 10) / 10,
      maxPrecipitationProbability: maxPrecipProb,
      maxWindSpeed: Math.round(maxWind * 10) / 10,
      maxWindGusts: Math.round(maxGusts * 10) / 10,
    },
  };
}

export const WMO_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

export function weatherCodeLabel(code: number): string {
  return WMO_CODES[code] ?? "Unknown";
}
