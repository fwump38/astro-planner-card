import type { AstroForecastHour, HomeAssistant } from "../types";

export interface HourlyForecast {
  hours: (AstroForecastHour & { time: number })[];
  start: number | null;
  end: number | null;
}

export const EMPTY_FORECAST: HourlyForecast = { hours: [], start: null, end: null };

export function toHourlyForecast(raw: AstroForecastHour[] | undefined): HourlyForecast {
  const hours = (raw ?? [])
    .map((h) => ({ ...h, time: Date.parse(h.datetime) }))
    .filter((h) => !Number.isNaN(h.time))
    .sort((a, b) => a.time - b.time);
  return { hours, start: hours[0]?.time ?? null, end: hours[hours.length - 1]?.time ?? null };
}

/** The forecast hour covering `time` (nearest within 45 minutes), or undefined beyond the horizon. */
export function forecastAt(f: HourlyForecast, time: Date | number): (AstroForecastHour & { time: number }) | undefined {
  const t = typeof time === "number" ? time : time.getTime();
  if (f.start === null || f.end === null || t < f.start - 45 * 60e3 || t > f.end + 45 * 60e3) return undefined;
  let lo = 0;
  let hi = f.hours.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (f.hours[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [f.hours[lo - 1], f.hours[lo]].filter(Boolean);
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c.time - t) < Math.abs(best.time - t)) best = c;
  return Math.abs(best.time - t) <= 45 * 60e3 ? best : undefined;
}

/** Subscribes to AstroWeather's hourly forecast for each entity; returns an unsubscribe function. */
export async function subscribeForecasts(
  hass: HomeAssistant,
  entities: string[],
  onUpdate: (entity: string, forecast: HourlyForecast) => void,
): Promise<() => void> {
  const unsubs = await Promise.all(
    entities.map((entity_id) =>
      hass.connection
        .subscribeMessage<{ type: string; forecast: AstroForecastHour[] | null }>(
          (msg) => onUpdate(entity_id, toHourlyForecast(msg.forecast ?? [])),
          { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id },
        )
        .catch((err) => {
          console.warn(`astro-planner-card: forecast subscription failed for ${entity_id}`, err);
          return () => undefined;
        }),
    ),
  );
  return () => unsubs.forEach((u) => u());
}
