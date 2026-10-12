import type { LightDome } from "../types";

export interface DomeGeometry {
  dome: LightDome;
  distanceKm: number;
  bearing: number;
  /** Walker's-law glow index: population × distance^-2.5, normalised so 100k people at 30 km = 1. */
  glow: number;
}

export interface DomeImpact {
  /** 0 (no interference) … 1 (shooting straight through a bright dome). */
  penalty: number;
}

export function compassPoint(deg: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(deg / 22.5) % 16];
}
