import { SearchMoonPhase } from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { classifyOrientation } from "../src/astro/galactic-center";
import { domeGeometry } from "../src/astro/light-domes";
import { computeNight, sampleSky, type SkyOptions } from "../src/astro/night";
import { CHACO, ABIQUIU, TEST_DOMES } from "./fixtures/places";

const baseOpts: SkyOptions = {
  minGcAltitude: 10,
  maxMoonIllumination: 10,
  bortle: 2,
  domes: [],
  domeSigma: 25,
};

describe("moon", () => {
  it("finds the 2026 eclipse new moons (Feb 17 and Aug 12 UTC)", () => {
    const feb = SearchMoonPhase(0, new Date(Date.UTC(2026, 1, 10)), 30)!;
    const aug = SearchMoonPhase(0, new Date(Date.UTC(2026, 7, 5)), 30)!;
    expect(feb.date.toISOString().slice(0, 10)).toBe("2026-02-17");
    expect(aug.date.toISOString().slice(0, 10)).toBe("2026-08-12");
  });
});

describe("galactic center", () => {
  it("transits at ~90 − lat + dec altitude, due south", () => {
    // Chaco, 2026-07-12: GC transits around 22:30 MDT (04:30 UTC next day).
    let best = { alt: -90, az: 0 };
    for (let m = 0; m < 6 * 60; m += 2) {
      const s = sampleSky(new Date(Date.UTC(2026, 6, 13, 2, m)), CHACO, baseOpts);
      if (s.gc.altitude > best.alt) best = { alt: s.gc.altitude, az: s.gc.azimuth };
    }
    const expected = 90 - CHACO.latitude - 29.008;
    expect(best.alt).toBeGreaterThan(expected - 0.5);
    expect(best.alt).toBeLessThan(expected + 0.8); // refraction lifts it slightly
    expect(Math.abs(best.az - 180)).toBeLessThan(2);
  });

  it("is visible for hours around the August new moon", () => {
    const night = computeNight({ y: 2026, m: 8, d: 12 }, CHACO, baseOpts);
    expect(night.dusk).not.toBeNull();
    expect(night.gcMinutes).toBeGreaterThan(120);
    expect(night.gcPeakAltitude!).toBeGreaterThan(20);
  });

  it("is not visible after dark in December", () => {
    const night = computeNight({ y: 2026, m: 12, d: 9 }, CHACO, baseOpts);
    expect(night.gcMinutes).toBe(0);
  });

  it("stands upright in late-season evenings and lies low in spring pre-dawn", () => {
    // Sep 10 2026, ~21:30 MDT at Chaco: core in the SW, band near vertical.
    const sep = sampleSky(new Date(Date.UTC(2026, 8, 11, 3, 30)), CHACO, baseOpts);
    expect(sep.gc.azimuth).toBeGreaterThan(195);
    expect(classifyOrientation(sep.gc.tilt)).toBe("upright");
    // Apr 1 2026, ~04:30 MDT: core just risen in the SE, band low across the east.
    const apr = sampleSky(new Date(Date.UTC(2026, 3, 1, 10, 30)), CHACO, baseOpts);
    expect(apr.gc.azimuth).toBeLessThan(165);
    expect(["arch", "angled"]).toContain(classifyOrientation(apr.gc.tilt));
  });
});

describe("light domes", () => {
  it("penalises Abiquiu (ABQ/Santa Fe to the south) but not Chaco", () => {
    const opts = (o: typeof CHACO) => ({ ...baseOpts, domes: domeGeometry(o, TEST_DOMES) });
    const abq = computeNight({ y: 2026, m: 7, d: 14 }, ABIQUIU, opts(ABIQUIU));
    const chaco = computeNight({ y: 2026, m: 7, d: 14 }, CHACO, opts(CHACO));
    expect(abq.domePenalty).toBeGreaterThan(0.25);
    expect(chaco.domePenalty).toBeLessThan(0.08);
    expect(abq.worstDome?.dome.name).toMatch(/Albuquerque|Santa Fe/);
  });
});
