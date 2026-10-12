import { describe, expect, it } from "vitest";
import { computeNight } from "../src/astro/night";
import { domeGeometry } from "../src/astro/light-domes";
import { forecastAt, toHourlyForecast } from "../src/data/forecast";
import { domesFromOverpass, domesFromPlaces, mergeDomes, parsePopulation, type OverpassElement } from "../src/data/nearby-cities";
import { DEFAULT_WEIGHTS } from "../src/data/defaults";
import { classifyNight, hourQuality, scoreNight } from "../src/scoring/score";
import type { AstroForecastHour, Site } from "../src/types";
import overpass from "./fixtures/overpass.json";
import realForecast from "./fixtures/astroweather-forecast.json";
import { ABIQUIU, CHACO, TEST_DOMES } from "./fixtures/places";

describe("nearby cities", () => {
  it("parses populations with separators", () => {
    expect(parsePopulation("564,559")).toBe(564559);
    expect(parsePopulation("10 000")).toBe(10000);
    expect(parsePopulation(undefined)).toBeNaN();
  });

  it("keeps big-or-close places and drops small far ones", () => {
    const domes = domesFromOverpass(overpass.elements as OverpassElement[], [ABIQUIU, CHACO], 250);
    const names = domes.map((d) => d.name);
    expect(names).toContain("Albuquerque");
    expect(names).toContain("Española"); // small but close to Abiquiu
    expect(names).not.toContain("Tinytown"); // small and far from every site
    expect(names).not.toContain("No Population");
    expect(names[0]).toBe("Albuquerque");
  });

  it("merges without clobbering manual edits", () => {
    const merged = mergeDomes(
      [{ name: "Albuquerque", latitude: 35, longitude: -106.6, population: 900000 }],
      [
        { name: "albuquerque", latitude: 35.08, longitude: -106.65, population: 560000 },
        { name: "Santa Fe", latitude: 35.68, longitude: -105.94, population: 89000 },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].population).toBe(900000);
  });
});

describe("scoring", () => {
  const opts = (o: typeof CHACO) => ({
    minGcAltitude: 10,
    maxMoonIllumination: 10,
    bortle: 2,
    domes: domeGeometry(o, TEST_DOMES),
    domeSigma: 25,
  });
  const site = (name: string, observer: typeof CHACO, bortle = 2): Site => ({ entity: `weather.${name}`, name, bortle, observer });

  function forecastFor(start: Date, hours: number, h: Partial<AstroForecastHour>) {
    return toHourlyForecast(
      Array.from({ length: hours }, (_, i) => ({
        datetime: new Date(start.getTime() + i * 3600e3).toISOString(),
        ...h,
      })),
    );
  }

  const date = { y: 2026, m: 7, d: 14 };
  const start = new Date(Date.UTC(2026, 6, 14, 18));

  it("finds forecast hours by nearest time", () => {
    const f = forecastFor(start, 4, { cloudless_percentage: 50 });
    expect(forecastAt(f, new Date(start.getTime() + 3600e3 + 20 * 60e3))?.time).toBe(start.getTime() + 3600e3);
    expect(forecastAt(f, new Date(start.getTime() + 10 * 3600e3))).toBeUndefined();
  });

  it("ranks clear Chaco above clear Abiquiu (dome) above cloudy Chaco", () => {
    const clear = forecastFor(start, 24, { cloudless_percentage: 100, transparency_percentage: 90, seeing_percentage: 80, calm_percentage: 90 });
    const cloudy = forecastFor(start, 24, { cloudless_percentage: 10, transparency_percentage: 40, seeing_percentage: 80, calm_percentage: 90 });
    const chacoNight = computeNight(date, CHACO, opts(CHACO));
    const abqNight = computeNight(date, ABIQUIU, opts(ABIQUIU));
    const a = scoreNight(site("chaco", CHACO), chacoNight, clear, DEFAULT_WEIGHTS, 0.15);
    const b = scoreNight(site("abiquiu", ABIQUIU), abqNight, clear, DEFAULT_WEIGHTS, 0.15);
    const c = scoreNight(site("chaco", CHACO), chacoNight, cloudy, DEFAULT_WEIGHTS, 0.15);
    expect(a.score!).toBeGreaterThan(b.score!);
    expect(b.score!).toBeGreaterThan(c.score!);
    expect(b.domeWarning).toBe(true);
    expect(a.domeWarning).toBe(false);
    expect(a.astroOnly).toBe(false);
  });

  it("falls back to an astronomy-only score beyond the forecast horizon", () => {
    const night = computeNight(date, CHACO, opts(CHACO));
    const s = scoreNight(site("chaco", CHACO), night, toHourlyForecast([]), DEFAULT_WEIGHTS, 0.15);
    expect(s.astroOnly).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });

  it("returns null when the core isn't up after dark", () => {
    const night = computeNight({ y: 2026, m: 12, d: 9 }, CHACO, opts(CHACO));
    expect(scoreNight(site("chaco", CHACO), night, toHourlyForecast([]), DEFAULT_WEIGHTS, 0.15).score).toBeNull();
  });
});

describe("real AstroWeather forecast fixture", () => {
  const real = toHourlyForecast(realForecast.forecast as AstroForecastHour[]);

  it("parses into sorted hours with the field names the card reads", () => {
    expect(real.hours).toHaveLength(6);
    expect(real.hours[0]).toMatchObject({ cloudless_percentage: 67, transparency_percentage: 70, humidity: 34 });
    expect(forecastAt(real, Date.parse("2026-10-14T21:10:00Z"))?.cloudless_percentage).toBe(100);
  });

  it("scores clear hours high and keeps every hour within 0–100", () => {
    const quality = real.hours.map((h) => hourQuality(h, DEFAULT_WEIGHTS)!);
    for (const q of quality) {
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(100);
    }
    expect(quality[3]).toBeGreaterThan(quality[0]); // fully clear beats partly cloudy with light rain
  });
});

describe("calendar grading", () => {
  it("grades nights like Capture the Atlas: best / short / none", () => {
    expect(classifyNight(0, 120)).toBe("none");
    expect(classifyNight(45, 120)).toBe("short");
    expect(classifyNight(120, 120)).toBe("best");
    expect(classifyNight(300, 120)).toBe("best");
    expect(classifyNight(100, 90)).toBe("best");
  });
});

describe("city selection across several sites", () => {
  it("keeps the big city near a remote site even when many small places crowd another site", () => {
    const home = { latitude: 35.65, longitude: -105.97 };
    const remote = { latitude: 36.06, longitude: -107.96 };
    // 30 small suburbs within a few km of home, plus one real city ~80 km from the remote site.
    const suburbs = Array.from({ length: 30 }, (_, i) => ({
      name: `Suburb ${i}`,
      latitude: home.latitude + 0.01 * ((i % 6) - 3),
      longitude: home.longitude + 0.01 * (Math.floor(i / 6) - 2),
      population: 2000 + i,
    }));
    const farmington = { name: "Farmington", latitude: 36.728, longitude: -108.219, population: 46000 };
    const names = domesFromPlaces([...suburbs, farmington], [home, remote], 250).map((d) => d.name);
    expect(names).toContain("Farmington");
    expect(names.filter((n) => n.startsWith("Suburb")).length).toBeLessThanOrEqual(12);
  });
});
