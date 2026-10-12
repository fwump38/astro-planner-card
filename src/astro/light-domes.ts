import type { LightDome, Observer } from "../types";

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

export interface DomeGeometry {
  dome: LightDome;
  distanceKm: number;
  bearing: number;
  /** Walker's-law glow index: population × distance^-2.5, normalised so 100k people at 30 km = 1. */
  glow: number;
}

export function distanceKm(a: Observer, b: { latitude: number; longitude: number }): number {
  const dLat = (b.latitude - a.latitude) * RAD;
  const dLon = (b.longitude - a.longitude) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees clockwise from north. */
export function bearing(a: Observer, b: { latitude: number; longitude: number }): number {
  const φ1 = a.latitude * RAD;
  const φ2 = b.latitude * RAD;
  const Δλ = (b.longitude - a.longitude) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

export function glowIndex(population: number, km: number): number {
  return (population / 1e5) * Math.pow(Math.max(km, 5) / 30, -2.5);
}

export function domeGeometry(site: Observer, domes: LightDome[]): DomeGeometry[] {
  return domes.map((dome) => {
    const d = distanceKm(site, dome);
    return { dome, distanceKm: d, bearing: bearing(site, dome), glow: glowIndex(dome.population, d) };
  });
}

export interface DomeImpact {
  /** 0 (no interference) … 1 (shooting straight through a bright dome). */
  penalty: number;
  /** The dome contributing most at this moment, if any. */
  worst?: DomeGeometry;
}

/**
 * Light-dome interference when pointing at azimuth/altitude. Domes hug the horizon,
 * so interference falls off as the target climbs, and with angular separation in azimuth.
 */
export function domeImpact(geoms: DomeGeometry[], azimuth: number, altitude: number, sigma = 25): DomeImpact {
  if (altitude < 0 || geoms.length === 0) return { penalty: 0 };
  const altFactor = Math.exp(-altitude / 25);
  let total = 0;
  let worst: DomeGeometry | undefined;
  let worstContribution = 0;
  for (const g of geoms) {
    const dAz = angularDiff(azimuth, g.bearing);
    const c = g.glow * Math.exp(-(dAz * dAz) / (2 * sigma * sigma)) * altFactor;
    total += c;
    if (c > worstContribution) {
      worstContribution = c;
      worst = g;
    }
  }
  // Calibrated so a ~500k city ~140 km away, straight behind a 25°-high core, costs about a third.
  return { penalty: 1 - Math.exp(-total / 0.15), worst };
}

export function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function compassPoint(deg: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(deg / 22.5) % 16];
}
