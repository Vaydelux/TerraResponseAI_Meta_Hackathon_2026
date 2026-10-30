// Open-Meteo forecasts for trusted report coordinates.
// All hourly timestamps are requested in UTC so they cannot be mistaken
// for the server's timezone. Forecasts are context, never incident evidence.

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requiredNumericArray(value: unknown, expectedLength: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== expectedLength ||
      !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw new Error(`Invalid weather response: ${label}`);
  }
  return value as number[];
}

function parseUtcHour(value: unknown): string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error("Invalid weather response: hourly timestamp");
  }
  const utc = new Date(`${value}Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 16) !== value.slice(0, 16)) {
    throw new Error("Invalid weather response: hourly timestamp");
  }
  return utc.toISOString();
}

export async function fetchWeatherForecast(lat: number, lon: number): Promise<WeatherForecast> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Invalid forecast coordinates");
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: [
      "temperature_2m", "apparent_temperature", "precipitation", "weather_code",
      "wind_speed_10m", "wind_gusts_10m", "is_day",
    ].join(","),
    hourly: [
      "precipitation", "precipitation_probability",
      "wind_speed_10m", "wind_gusts_10m", "weather_code",
    ].join(","),
    timezone: "UTC",
    forecast_days: "3",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 600 }, // Provider forecasts are public; cached by coordinates and variables.
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Weather API request timed out");
    throw new Error(`Weather API request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Weather API returned HTTP ${response.status}`);

  const data: unknown = await response.json();
  return parseWeatherResponse(data, lat, lon);
}

export function parseWeatherResponse(data: unknown, lat: number, lon: number): WeatherForecast {
  if (!isRecord(data) || !isRecord(data.current) || !isRecord(data.hourly)) {
    throw new Error("Invalid weather response: missing current or hourly data");
  }
  const current = data.current;
  const hourly = data.hourly;
  if (!Array.isArray(hourly.time) || hourly.time.length === 0) {
    throw new Error("Invalid weather response: missing hourly times");
  }

  const times = hourly.time.map(parseUtcHour);
  if (new Set(times).size !== times.length) {
    throw new Error("Invalid weather response: duplicate timestamps");
  }
  const precipitation = requiredNumericArray(hourly.precipitation, times.length, "precipitation");
  const probability = requiredNumericArray(hourly.precipitation_probability, times.length, "precipitation_probability");
  const wind = requiredNumericArray(hourly.wind_speed_10m, times.length, "wind_speed_10m");
  const gusts = requiredNumericArray(hourly.wind_gusts_10m, times.length, "wind_gusts_10m");
  const codes = requiredNumericArray(hourly.weather_code, times.length, "weather_code");

  if (precipitation.some((n) => n < 0) ||
      probability.some((n) => n < 0 || n > 100) ||
      wind.some((n) => n < 0) || gusts.some((n) => n < 0)) {
    throw new Error("Invalid weather response: value out of range");
  }

  const now = Date.now();
  const hourlyData: WeatherForecast["hourly"] = [];
  for (let i = 0; i < times.length; i++) {
    // Forecast time is UTC, not browser/server local time.
    if (Date.parse(times[i]) < now) continue;
    hourlyData.push({
      time: times[i],
      precipitation: precipitation[i],
      precipitationProbability: probability[i],
      windSpeed: wind[i],
      windGusts: gusts[i],
      weatherCode: codes[i],
    });
    if (hourlyData.length === 24) break;
  }
  if (hourlyData.length < 24) {
    throw new Error("Weather API returned an incomplete 24-hour forecast");
  }

  const retrievedAt = new Date().toISOString();
  const totalPrecipitation = hourlyData.reduce((sum, item) => sum + item.precipitation, 0);
  return {
    provider: "Open-Meteo",
    providerModel: typeof data.model === "string" ? data.model : "Best-match",
    latitude: optionalFinite(data.latitude) ?? lat,
    longitude: optionalFinite(data.longitude) ?? lon,
    timezone: "UTC",
    retrievedAt,
    // Open-Meteo current.time is the modeled current-condition timestamp,
    // not necessarily the model issuance time. Do not label it "issued at".
    forecastReferenceTime: typeof current.time === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time)
        ? `${current.time.replace(/Z$/, "")}Z`
        : retrievedAt,
    validFrom: hourlyData[0].time,
    validUntil: hourlyData[23].time,
    current: {
      temperature: optionalFinite(current.temperature_2m),
      apparentTemperature: optionalFinite(current.apparent_temperature),
      precipitation: optionalFinite(current.precipitation),
      weatherCode: optionalFinite(current.weather_code),
      windSpeed: optionalFinite(current.wind_speed_10m),
      windGusts: optionalFinite(current.wind_gusts_10m),
      isDay: current.is_day === 1,
    },
    hourly: hourlyData,
    daily24h: {
      totalPrecipitation: Math.round(totalPrecipitation * 10) / 10,
      maxPrecipitationProbability: Math.max(...hourlyData.map((h) => h.precipitationProbability)),
      maxWindSpeed: Math.round(Math.max(...hourlyData.map((h) => h.windSpeed)) * 10) / 10,
      maxWindGusts: Math.round(Math.max(...hourlyData.map((h) => h.windGusts)) * 10) / 10,
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
