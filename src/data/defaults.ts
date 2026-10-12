import type { CardConfig, ResolvedConfig, ScoreWeights } from "../types";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  cloud: 3,
  transparency: 2,
  seeing: 0.5,
  calm: 1,
};

export const DEFAULT_BORTLE = 3;

export function resolveConfig(config: CardConfig): ResolvedConfig {
  return {
    ...config,
    sites: config.sites ?? [],
    default_tab: config.default_tab ?? "ranking",
    light_domes: config.light_domes ?? [],
    nights: clamp(config.nights ?? 3, 1, 7),
    min_gc_altitude: config.min_gc_altitude ?? 10,
    max_moon_illumination: config.max_moon_illumination ?? 10,
    weights: { ...DEFAULT_WEIGHTS, ...(config.weights ?? {}) },
    dome_radius_km: config.dome_radius_km ?? 250,
    auto_drive_time: config.auto_drive_time ?? true,
    calendar_highlight: config.calendar_highlight ?? true,
    calendar_best_minutes: config.calendar_best_minutes ?? 180,
    calendar_min_altitude: config.calendar_min_altitude ?? 0,
    dome_sigma: config.dome_sigma ?? 25,
    dome_warning_threshold: config.dome_warning_threshold ?? 0.15,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
