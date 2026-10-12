import type { NightSummary } from "../astro/night";
import type { Site } from "../types";

/** A night's score at one site, as calculated by the integration. */
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
