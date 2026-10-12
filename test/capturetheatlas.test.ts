import { describe, expect, it } from "vitest";
import { computeNight } from "../src/astro/night";

// Reference: Capture the Atlas "2026 Milky Way Calendar - Southwest USA" (Kanab, UT, 37°N), "Milky Way" Start/End columns.
// Times are local clock (America/Denver); that calendar counts the core as up from the horizon, hence minGcAltitude 0.
const KANAB = { latitude: 37.047, longitude: -112.527, elevation: 1500 };
const OPTS = { minGcAltitude: 0, maxMoonIllumination: 100, bortle: 2, domes: [], domeSigma: 25 };

const REFERENCE: { date: [number, number, number]; start: string; end: string; orientation: string }[] = [
  { date: [2026, 3, 21], start: "02:48", end: "06:02", orientation: "arch" },
  { date: [2026, 4, 11], start: "01:25", end: "05:27", orientation: "arch" },
  { date: [2026, 5, 16], start: "23:08", end: "04:34", orientation: "angled" },
  { date: [2026, 6, 13], start: "22:45", end: "04:15", orientation: "angled" },
  { date: [2026, 7, 11], start: "22:42", end: "04:15", orientation: "upright" },
  { date: [2026, 9, 5], start: "21:23", end: "00:35", orientation: "upright" },
  { date: [2026, 10, 3], start: "20:37", end: "22:45", orientation: "upright" },
  { date: [2026, 10, 10], start: "20:27", end: "22:17", orientation: "upright" },
  { date: [2026, 10, 31], start: "20:02", end: "20:55", orientation: "upright" },
];

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minutesOfDay = (d: Date) => {
  const [h, m] = clock.format(d).split(":").map(Number);
  return h * 60 + m;
};
const parse = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const circularDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
};

describe("matches Capture the Atlas 2026 (Kanab, 37°N)", () => {
  for (const row of REFERENCE) {
    const [y, m, d] = row.date;
    it(`${y}-${m}-${d}: window ${row.start}–${row.end}, ${row.orientation}`, () => {
      const night = computeNight({ y, m, d }, KANAB, OPTS, 2);
      expect(night.gcStart).not.toBeNull();
      expect(circularDiff(minutesOfDay(night.gcStart!), parse(row.start))).toBeLessThanOrEqual(10);
      expect(circularDiff(minutesOfDay(night.gcEnd!), parse(row.end))).toBeLessThanOrEqual(10);
      expect(night.orientation).toBe(row.orientation);
    });
  }
});

describe("calendar grading matches the Capture the Atlas colour rule", () => {
  // Calendar defaults: core counted from the horizon, moonless (≤10% lit counts as fine), best = at least 3 hours.
  const CALENDAR_OPTS = { minGcAltitude: 0, maxMoonIllumination: 10, bortle: 2, domes: [], domeSigma: 25 };
  const BEST_MINUTES = 180;

  it("agrees with the colour of at least 49 of the 52 weekly rows and tracks window length", async () => {
    const { addDays } = await import("../src/astro/time");
    const { classifyNight } = await import("../src/scoring/score");
    const ref = (await import("./fixtures/cta-2026.json")).default as { rows: { color: string; coreMinutes: number }[] };
    let agree = 0;
    let err = 0;
    for (let i = 0; i < ref.rows.length; i++) {
      const night = computeNight(addDays({ y: 2026, m: 1, d: 3 }, 7 * i), KANAB, CALENDAR_OPTS, 5);
      const want = ref.rows[i].color === "pink" ? "best" : ref.rows[i].color === "blue" ? "short" : "none";
      if (classifyNight(night.gcMinutes, BEST_MINUTES) === want) agree++;
      err += Math.abs(night.gcMinutes - ref.rows[i].coreMinutes);
    }
    expect(agree).toBeGreaterThanOrEqual(49);
    expect(err / ref.rows.length).toBeLessThan(10); // minutes, averaged over all rows
  });
});
