import type { NightSummary } from "../astro/night";
import { forecastAt, type HourlyForecast } from "../data/forecast";
import type { AstroForecastHour, ScoreWeights, Site } from "../types";

export interface NightScore {
  site: Site;
  night: NightSummary;
  /** 0–100, null when the core isn't visible after dark at all. */
  score: number | null;
  /** True when no forecast covers the core window, so the score is astronomy-only. */
  astroOnly: boolean;
  /** Mean weather quality 0–1 over the core window (null without forecast). */
  weather: number | null;
  /** Mean total cloud cover % over the core window. */
  cloud: number | null;
  domeWarning: boolean;
}

/** Weighted 0–100 sky quality for one forecast hour (higher is better). */
export function hourQuality(h: AstroForecastHour, w: ScoreWeights): number | null {
  const parts: [number | undefined, number][] = [
    [h.cloudless_percentage ?? (h.cloudcover_percentage !== undefined ? 100 - h.cloudcover_percentage : undefined), w.cloud],
    [h.transparency_percentage, w.transparency],
    [h.seeing_percentage, w.seeing],
    [h.calm_percentage, w.calm],
  ];
  let sum = 0;
  let weight = 0;
  for (const [v, wt] of parts) {
    if (v === undefined || v === null || Number.isNaN(v) || wt <= 0) continue;
    sum += Math.max(0, Math.min(100, v)) * wt;
    weight += wt;
  }
  if (weight === 0) return null;
  let q = sum / weight;
  // Any measurable precipitation or ground fog ruins the hour regardless of the other numbers.
  if ((h.precipitation_amount ?? 0) > 0.1) q *= 0.3;
  if ((h.fog2m_area_fraction ?? 0) > 50) q *= 0.5;
  return q;
}

export function bortleFactor(bortle: number): number {
  return 1 - (Math.max(1, Math.min(9, bortle)) - 1) * 0.06;
}

/** How much of a "full" session the core window offers (3h+ = full). */
export function windowFactor(minutes: number): number {
  return 0.6 + 0.4 * Math.min(1, minutes / 180);
}

export function scoreNight(
  site: Site,
  night: NightSummary,
  forecast: HourlyForecast,
  weights: ScoreWeights,
  domeWarningThreshold: number,
): NightScore {
  const visible = night.samples.filter((s) => s.gcVisible);
  const base = { site, night, domeWarning: night.domePenalty >= domeWarningThreshold };
  if (visible.length === 0) return { ...base, score: null, astroOnly: false, weather: null, cloud: null };

  let qSum = 0;
  let qCount = 0;
  let cloudSum = 0;
  let cloudCount = 0;
  for (const s of visible) {
    const h = forecastAt(forecast, s.time);
    if (!h) continue;
    const q = hourQuality(h, weights);
    if (q !== null) {
      qSum += q;
      qCount++;
    }
    const cloud = h.cloudcover_percentage ?? (h.cloudless_percentage !== undefined ? 100 - h.cloudless_percentage : undefined);
    if (cloud !== undefined) {
      cloudSum += cloud;
      cloudCount++;
    }
  }
  // Need forecast coverage for at least half the window to call it a weather score.
  const astroOnly = qCount < visible.length / 2;
  const weather = astroOnly ? null : qSum / qCount / 100;
  const astro = windowFactor(night.gcMinutes) * (1 - night.domePenalty) * bortleFactor(site.bortle);
  const score = Math.round(100 * astro * (weather ?? 1));
  return { ...base, score, astroOnly, weather, cloud: cloudCount ? cloudSum / cloudCount : null };
}

export function scoreColorBand(score: number | null): "none" | "poor" | "fair" | "good" | "great" {
  if (score === null) return "none";
  if (score >= 75) return "great";
  if (score >= 55) return "good";
  if (score >= 35) return "fair";
  return "poor";
}

export type NightClass = "best" | "short" | "none";

/**
 * Capture the Atlas-style grading of a night by how long the core is up in dark, moonless sky:
 * "best" (pink), "short" (blue) or "none" (dark).
 */
export function classifyNight(gcMinutes: number, bestMinutes: number): NightClass {
  if (gcMinutes <= 0) return "none";
  return gcMinutes >= bestMinutes ? "best" : "short";
}
