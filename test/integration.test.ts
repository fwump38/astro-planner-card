import { describe, expect, it, vi } from "vitest";
import { chartRange } from "../src/views/sky-chart-view";
import { toHourlyForecast } from "../src/data/forecast";
import { fetchCalendar, fetchOverview, fetchShowers, fetchSkyHours, fetchTargets, integrationInstalled, overviewFromWire } from "../src/data/integration";
import { filterAndSort, monthOf, placement } from "../src/data/targets";
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
  api_version: 3,
  tonight: "2026-10-10",
  reference: { latitude: 36, longitude: -106, elevation: 1800 },
  settings: { nights: 2, min_gc_altitude: 10, max_moon_illumination: 10, calendar_min_altitude: 0, calendar_best_minutes: 180, dome_warning_threshold: 0.15 },
  sites: [
    { entity: "weather.a", name: "Chaco", bortle: 2, drive_minutes: 150, drive_estimated: true, latitude: 36.06, longitude: -107.96, elevation: 1900, source: { coordinates: "astroweather", bortle: "estimated", drive_time: "route" } },
    { entity: "weather.b", name: "Nowhere", bortle: 3, drive_minutes: null, drive_estimated: false, latitude: null, longitude: null, elevation: null, source: { coordinates: null, bortle: "configured", drive_time: null } },
  ],
  scores: {
    "weather.a": [{ date: "2026-10-10", score: 71, milky_way: false, sky: 0.6, targets: [{ id: "m31", label: "M31 – Andromeda Galaxy", kind: "galaxy", score: 64, minutes: 480, peak_altitude: 82, direction: "S" }], astro_only: false, weather: 0.9, cloud: 12, dome_warning: true, night: wireNight("2026-10-10") }],
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
    expect(s.milkyWay).toBe(false);
    expect(s.targets[0]).toMatchObject({ label: "M31 – Andromeda Galaxy", score: 64, peakAltitude: 82, direction: "S" });
    expect(o.scores.get("weather.b")!.size).toBe(0);
  });

  it("carries the integration's thresholds and 'tonight'", () => {
    expect(o.tonight).toEqual({ y: 2026, m: 10, d: 10 });
    expect(o.settings.nights).toBe(2);
  });
});

describe("talking to the integration", () => {
  const hassWith = (callWS: (msg: any) => Promise<any>, components = ["astro_planner"]) =>
    ({ config: { components }, callWS: vi.fn(callWS) }) as unknown as HomeAssistant;

  it("detects whether the integration is installed", () => {
    expect(integrationInstalled(hassWith(async () => ({})))).toBe(true);
    expect(integrationInstalled(hassWith(async () => ({}), ["other"]))).toBe(false);
  });

  it("namespaces commands and rejects an incompatible API version", async () => {
    const ok = hassWith(async () => WIRE);
    await fetchOverview(ok);
    expect((ok.callWS as any).mock.calls[0][0]).toEqual({ type: "astro_planner/overview" });
    await expect(fetchOverview(hassWith(async () => ({ ...WIRE, api_version: 1 })))).rejects.toThrow(/needs 3/);
  });

  it("fetches calendar nights and hourly sky", async () => {
    const hass = hassWith(async (msg) =>
      msg.type.endsWith("calendar")
        ? { api_version: 3, nights: [wireNight("2026-10-01"), wireNight("2026-10-02")] }
        : { api_version: 3, hours: [{ t: 0, sun: -30, moon: -5, lm: 6.8, alt: 12, vis: true, dp: 0.1 }] },
    );
    const nights = await fetchCalendar(hass, "2026-10-01", 2);
    expect(nights.map((n) => n.key)).toEqual(["2026-10-01", "2026-10-02"]);
    expect((hass.callWS as any).mock.calls[0][0]).toMatchObject({ type: "astro_planner/calendar", start: "2026-10-01", days: 2 });
    const hours = await fetchSkyHours(hass, "weather.a", 0, 1);
    expect(hours[0]).toMatchObject({ sunAltitude: -30, limitingMagnitude: 6.8, gcVisible: true, domePenalty: 0.1 });
    expect((hass.callWS as any).mock.calls[1][0]).toMatchObject({ type: "astro_planner/sky_hours", entity: "weather.a", start: "1970-01-01T00:00:00.000Z", hours: 1 });
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

describe("targets", () => {
  const night = (extra = {}) => ({ date: "2026-10-17", minutes: 480, peak_altitude: 82, peak_time: "2026-10-18T05:00:00+00:00", direction: "S", start: "2026-10-18T01:00:00+00:00", end: "2026-10-18T09:00:00+00:00", moon_penalty: 0.1, moon_separation: 70, ...extra });
  const wireTarget = (id: string, designation: string, kind: string, mag: number, nights = [night()]) => ({
    id, designation, name: designation, label: designation, kind, kind_label: kind, magnitude: mag, size: 10, constellation: "Andromeda", best_date: "2026-10-01", framing: null, nights,
  });
  const WIRE_TARGETS = {
    api_version: 3,
    settings: { min_altitude: 30, max_magnitude: 12, fov_arcmin: 0 },
    dark: [{ date: "2026-10-17", dusk: "2026-10-18T01:00:00+00:00", dawn: "2026-10-18T11:00:00+00:00", dark_minutes: 600, moon_free_minutes: 400, moon_illumination: 0.46 }],
    targets: [wireTarget("m31", "M31", "galaxy", 3.4), wireTarget("m42", "M42", "nebula", 4, [night({ peak_altitude: 45, minutes: 200 })]), wireTarget("jupiter", "Jupiter", "planet", -2.3, [])],
  };

  it("maps the wire format, dropping targets that aren't up", async () => {
    const hass = { config: { components: ["astro_planner"] }, callWS: vi.fn(async () => WIRE_TARGETS) } as unknown as HomeAssistant;
    const r = await fetchTargets(hass, "2026-10-17");
    expect((hass.callWS as any).mock.calls[0][0]).toEqual({ type: "astro_planner/targets", start: "2026-10-17", days: 1 });
    expect(r.targets.map((t) => t.id)).toEqual(["m31", "m42"]);
    expect(r.dark).toMatchObject({ darkMinutes: 600, moonFreeMinutes: 400 });
    expect(r.targets[0].night.start).toEqual(new Date("2026-10-18T01:00:00+00:00"));
    expect(r.settings.minAltitude).toBe(30);
  });

  it("filters by group and sorts", async () => {
    const hass = { config: { components: ["astro_planner"] }, callWS: vi.fn(async () => WIRE_TARGETS) } as unknown as HomeAssistant;
    const { targets } = await fetchTargets(hass, "2026-10-17");
    expect(filterAndSort(targets, "galaxy", "placement", false).map((t) => t.id)).toEqual(["m31"]);
    expect(filterAndSort(targets, "all", "placement", false).map((t) => t.id)).toEqual(["m31", "m42"]); // higher and longer up
    expect(filterAndSort(targets, "all", "brightness", false)[0].id).toBe("m31");
    expect(filterAndSort(targets, "all", "name", false).map((t) => t.designation)).toEqual(["M31", "M42"]);
    expect(filterAndSort([{ ...targets[0], framing: "too_large" }, targets[1]], "all", "name", true).map((t) => t.id)).toEqual(["m42"]);
  });

  it("scores placement by time, height and moon", () => {
    const base = { date: "d", minutes: 180, peakAltitude: 70, peakTime: null, direction: null, start: null, end: null, moonPenalty: 0, moonSeparation: null };
    expect(placement({ ...base, minutes: 0 })).toBe(0);
    expect(placement(base)).toBeCloseTo(1);
    expect(placement({ ...base, moonPenalty: 1 })).toBeCloseTo(0.2);
    expect(placement({ ...base, peakAltitude: 30 })).toBeLessThan(placement(base));
    expect(monthOf("2026-10-01")).toBe("Oct");
  });

  it("fetches meteor showers", async () => {
    const hass = { config: { components: ["astro_planner"] }, callWS: vi.fn(async () => ({ api_version: 3, showers: [{ id: "orionids", name: "Orionids", peak: "2026-10-21", days_until: 4, active: true, zhr: 20, radiant_peak_altitude: 66, moon_illumination: 83, moon_free_minutes: 150, rating: 48 }] })) } as unknown as HomeAssistant;
    expect((await fetchShowers(hass))[0]).toMatchObject({ name: "Orionids", daysUntil: 4, rating: 48, active: true });
  });
});
