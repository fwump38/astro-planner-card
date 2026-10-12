import { describe, expect, it, vi } from "vitest";
import { chartRange } from "../src/views/sky-chart-view";
import { toHourlyForecast } from "../src/data/forecast";
import { fetchCalendar, fetchOverview, fetchSkyHours, integrationInstalled, overviewFromWire } from "../src/data/integration";
import type { HomeAssistant } from "../src/types";

const wireNight = (date: string, extra = {}) => ({
  date,
  dusk: "2026-10-10T02:00:00+00:00",
  dawn: "2026-10-10T12:00:00+00:00",
  step_minutes: 10,
  moon_phase: 90,
  moon_illumination: 0.4,
  moon_rise: null,
  moon_set: "2026-10-10T05:00:00+00:00",
  dark_minutes: 300,
  gc_minutes: 120,
  gc_start: "2026-10-10T02:10:00+00:00",
  gc_end: "2026-10-10T04:10:00+00:00",
  gc_peak_altitude: 20,
  gc_tilt: 80,
  orientation: "upright",
  gc_azimuth_start: 200,
  gc_azimuth_end: 240,
  dome_penalty: 0.2,
  worst_dome: { name: "Albuquerque", latitude: 35.08, longitude: -106.65, population: 560000, distance_km: 140, bearing: 190, glow: 0.4 },
  ...extra,
});

const WIRE = {
  api_version: 2,
  tonight: "2026-10-10",
  reference: { latitude: 36, longitude: -106, elevation: 1800 },
  settings: { nights: 2, min_gc_altitude: 10, max_moon_illumination: 10, calendar_min_altitude: 0, calendar_best_minutes: 180, dome_warning_threshold: 0.15 },
  sites: [
    { entity: "weather.a", name: "Chaco", bortle: 2, drive_minutes: 150, drive_estimated: true, latitude: 36.06, longitude: -107.96, elevation: 1900, source: { coordinates: "astroweather", bortle: "estimated", drive_time: "route" } },
    { entity: "weather.b", name: "Nowhere", bortle: 3, drive_minutes: null, drive_estimated: false, latitude: null, longitude: null, elevation: null, source: { coordinates: null, bortle: "configured", drive_time: null } },
  ],
  scores: {
    "weather.a": [{ date: "2026-10-10", score: 71, astro_only: false, weather: 0.9, cloud: 12, dome_warning: true, night: wireNight("2026-10-10") }],
    "weather.b": [],
  },
  forecast_end: {},
};

describe("overview", () => {
  const o = overviewFromWire(WIRE as any);

  it("maps sites, including the estimate flag and a missing location", () => {
    expect(o.sites[0]).toMatchObject({ entity: "weather.a", bortle: 2, bortle_estimated: true, drive_minutes: 150, drive_estimated: true });
    expect(o.sites[0].observer).toEqual({ latitude: 36.06, longitude: -107.96, elevation: 1900 });
    expect(o.sites[1].observer).toBeNull();
    expect(o.sites[1].bortle_estimated).toBe(false);
  });

  it("indexes scores by site and date, with the night summary the views draw", () => {
    const s = o.scores.get("weather.a")!.get("2026-10-10")!;
    expect(s).toMatchObject({ score: 71, astroOnly: false, cloud: 12, domeWarning: true });
    expect(s.night).toMatchObject({ gcMinutes: 120, orientation: "upright", date: { y: 2026, m: 10, d: 10 } });
    expect(s.night.gcStart).toEqual(new Date("2026-10-10T02:10:00+00:00"));
    expect(s.night.worstDome?.dome.name).toBe("Albuquerque");
    expect(o.scores.get("weather.b")!.size).toBe(0);
  });

  it("carries the integration's thresholds and 'tonight'", () => {
    expect(o.tonight).toEqual({ y: 2026, m: 10, d: 10 });
    expect(o.settings.nights).toBe(2);
  });
});

describe("talking to the integration", () => {
  const hassWith = (callWS: (msg: any) => Promise<any>, components = ["milky_way_planner"]) =>
    ({ config: { components }, callWS: vi.fn(callWS) }) as unknown as HomeAssistant;

  it("detects whether the integration is installed", () => {
    expect(integrationInstalled(hassWith(async () => ({})))).toBe(true);
    expect(integrationInstalled(hassWith(async () => ({}), ["other"]))).toBe(false);
  });

  it("namespaces commands and rejects an incompatible API version", async () => {
    const ok = hassWith(async () => WIRE);
    await fetchOverview(ok);
    expect((ok.callWS as any).mock.calls[0][0]).toEqual({ type: "milky_way_planner/overview" });
    await expect(fetchOverview(hassWith(async () => ({ ...WIRE, api_version: 1 })))).rejects.toThrow(/needs 2/);
  });

  it("fetches calendar nights and hourly sky", async () => {
    const hass = hassWith(async (msg) =>
      msg.type.endsWith("calendar")
        ? { api_version: 2, nights: [wireNight("2026-10-01"), wireNight("2026-10-02")] }
        : { api_version: 2, hours: [{ t: 0, sun: -30, moon: -5, lm: 6.8, alt: 12, vis: true, dp: 0.1 }] },
    );
    const nights = await fetchCalendar(hass, "2026-10-01", 2);
    expect(nights.map((n) => n.key)).toEqual(["2026-10-01", "2026-10-02"]);
    expect((hass.callWS as any).mock.calls[0][0]).toMatchObject({ type: "milky_way_planner/calendar", start: "2026-10-01", days: 2 });
    const hours = await fetchSkyHours(hass, "weather.a", 0, 1);
    expect(hours[0]).toMatchObject({ sunAltitude: -30, limitingMagnitude: 6.8, gcVisible: true, domePenalty: 0.1 });
    expect((hass.callWS as any).mock.calls[1][0]).toMatchObject({ type: "milky_way_planner/sky_hours", entity: "weather.a", start: "1970-01-01T00:00:00.000Z", hours: 1 });
  });
});

describe("chart range", () => {
  const hour = 3600e3;
  const t0 = Date.UTC(2026, 9, 10, 12);
  const forecast = (n: number) =>
    toHourlyForecast(Array.from({ length: n }, (_, i) => ({ datetime: new Date(t0 + i * hour).toISOString() })));

  it("runs from an hour ago to the end of the forecast", () => {
    const r = chartRange(forecast(48), t0 + 5.5 * hour);
    expect(r.from).toBe(t0 + 4 * hour);
    expect(r.hours).toBe(48 - 4);
  });
  it("never exceeds three days", () => {
    expect(chartRange(forecast(200), t0).hours).toBeLessThanOrEqual(73);
  });
});
