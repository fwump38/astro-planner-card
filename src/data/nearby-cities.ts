import { distanceKm, glowIndex } from "../astro/light-domes";
import type { LightDome, Observer } from "../types";

/** Public Overpass instances, tried in order. They are community-run and often overloaded, so we fall through them. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
export const REQUEST_TIMEOUT_MS = 20000;
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
  return `[out:json][timeout:20];node["place"~"^(city|town)$"]["population"](${b});out body qt;`;
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

export class OverpassError extends Error {
  constructor(public failures: string[]) {
    super(`all ${failures.length} Overpass servers failed: ${failures.join("; ")}`);
    this.name = "OverpassError";
  }
}

async function queryEndpoint(url: string, query: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
    // Overpass reports a server-side timeout as HTTP 200 with an empty result and a remark.
    if (!json.elements?.length && json.remark) throw new Error(json.remark.slice(0, 80));
    return json.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(url: string, err: unknown): string {
  const host = new URL(url).hostname;
  const e = err as Error;
  if (e?.name === "AbortError") return `${host}: timed out`;
  if (e instanceof TypeError) return `${host}: network error (blocked, offline or overloaded)`;
  return `${host}: ${e?.message ?? e}`;
}

export async function fetchNearbyDomes(
  points: Observer[],
  radiusKm: number,
  fetchImpl: typeof fetch = fetch,
  endpoints: string[] = OVERPASS_ENDPOINTS,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<LightDome[]> {
  if (points.length === 0) return [];
  const query = overpassQuery(boundingBox(points, radiusKm));
  const failures: string[] = [];
  for (const url of endpoints) {
    try {
      return domesFromOverpass(await queryEndpoint(url, query, fetchImpl, timeoutMs), points, radiusKm);
    } catch (err) {
      failures.push(describeFailure(url, err));
    }
  }
  throw new OverpassError(failures);
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
