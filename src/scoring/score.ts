import type { NightSummary } from "../astro/night";
import type { Site } from "../types";

/** A night's score at one site, as calculated by the integration. */
export interface NightScore {
  site: Site;
  night: NightSummary;
  /** 0–100 sky and weather quality for the night; null only for a site without coordinates. */
  score: number | null;
  /** True when the Milky Way core is up in dark, moonless sky, which lifts the score above what the sky alone can reach. */
  milkyWay: boolean;
  /** Target-independent sky quality 0–1 (Bortle class, moon-free darkness and city glow). */
  sky: number;
  /** The best-placed targets at the site that night, best first. */
  targets: ScoredTarget[];
  /** True when no forecast covers the scored hours, so the score is astronomy-only. */
  astroOnly: boolean;
  /** Mean weather quality 0–1 over the scored hours (null without forecast). */
  weather: number | null;
  /** Mean total cloud cover % over the same hours. */
  cloud: number | null;
  domeWarning: boolean;
}

export interface ScoredTarget {
  id: string;
  label: string;
  kind: string;
  score: number;
  minutes: number;
  peakAltitude: number;
  direction: string | null;
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
