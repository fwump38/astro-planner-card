import { distanceKm, glowIndex } from "../astro/light-domes";
import type { LightDome, Observer } from "../types";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Places whose glow index at every site is below this are too small/far to matter. */
export const GLOW_CUTOFF = 0.005;
export const MAX_DOMES = 40;

export interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function boundingBox(points: Observer[], radiusKm: number): [number, number, number, number] {
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const p of points) {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.max(0.1, Math.cos((p.latitude * Math.PI) / 180)));
    south = Math.min(south, p.latitude - dLat);
    north = Math.max(north, p.latitude + dLat);
    west = Math.min(west, p.longitude - dLon);
    east = Math.max(east, p.longitude + dLon);
  }
  return [Math.max(-90, south), Math.max(-180, west), Math.min(90, north), Math.min(180, east)];
}

export function overpassQuery(bbox: [number, number, number, number]): string {
  const b = bbox.map((v) => v.toFixed(3)).join(",");
  return `[out:json][timeout:25];node["place"~"^(city|town)$"]["population"](${b});out body;`;
}

export function parsePopulation(raw: string | undefined): number {
  if (!raw) return NaN;
  const n = Number.parseInt(raw.replace(/[\s,.'_]/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** Turn Overpass elements into light domes that matter for at least one of `points`. */
export function domesFromOverpass(elements: OverpassElement[], points: Observer[], radiusKm: number): LightDome[] {
  const domes: (LightDome & { maxGlow: number })[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const population = parsePopulation(el.tags?.population);
    const name = el.tags?.name;
    if (lat === undefined || lon === undefined || !name || !(population > 0)) continue;
    const dome = { name, latitude: round(lat, 4), longitude: round(lon, 4), population };
    let maxGlow = 0;
    for (const p of points) {
      const d = distanceKm(p, dome);
      if (d <= radiusKm) maxGlow = Math.max(maxGlow, glowIndex(population, d));
    }
    if (maxGlow >= GLOW_CUTOFF) domes.push({ ...dome, maxGlow });
  }
  return domes
    .sort((a, b) => b.maxGlow - a.maxGlow)
    .slice(0, MAX_DOMES)
    .map(({ maxGlow: _maxGlow, ...d }) => d);
}

export async function fetchNearbyDomes(points: Observer[], radiusKm: number, fetchImpl: typeof fetch = fetch): Promise<LightDome[]> {
  if (points.length === 0) return [];
  const res = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(overpassQuery(boundingBox(points, radiusKm)))}`,
  });
  if (!res.ok) throw new Error(`Overpass API returned ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  return domesFromOverpass(json.elements ?? [], points, radiusKm);
}

/** Merge freshly looked-up domes into an existing list, keeping manual edits for places with the same name. */
export function mergeDomes(existing: LightDome[], found: LightDome[]): LightDome[] {
  const byName = new Map(existing.map((d) => [d.name.toLowerCase(), d]));
  const merged = [...existing];
  for (const d of found) if (!byName.has(d.name.toLowerCase())) merged.push(d);
  return merged;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
