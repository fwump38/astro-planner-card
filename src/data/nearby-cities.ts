import { distanceKm, glowIndex } from "../astro/light-domes";
import type { LightDome, Observer } from "../types";

export type SourceKind = "wikidata" | "overpass";
export interface CitySource {
  kind: SourceKind;
  url: string;
}

/**
 * Where to look for populated places, tried in order. Wikidata (run by the Wikimedia Foundation) is dependable and open to browser
 * requests. The community-run Overpass servers are fallbacks; they are frequently overloaded or reject requests.
 */
export const CITY_SOURCES: CitySource[] = [
  { kind: "wikidata", url: "https://query.wikidata.org/sparql" },
  { kind: "overpass", url: "https://overpass-api.de/api/interpreter" },
  { kind: "overpass", url: "https://overpass.kumi.systems/api/interpreter" },
  { kind: "overpass", url: "https://overpass.private.coffee/api/interpreter" },
  { kind: "overpass", url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter" },
];
export const REQUEST_TIMEOUT_MS = 20000;
/** Places whose glow index at every site is below this are too small/far to matter. */
export const GLOW_CUTOFF = 0.005;
/** Strongest light sources kept for each site, and an overall cap on the list. */
export const PER_POINT_LIMIT = 12;
export const MAX_DOMES = 60;

/** A populated place from any source. */
export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  population: number;
}

export interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface SparqlResults {
  results?: { bindings?: { name?: { value: string }; pop?: { value: string }; coord?: { value: string } }[] };
}

/** [south, west, north, east] covering `radiusKm` around every point. */
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

/**
 * Human settlements with a population and coordinates inside the box. Metropolitan areas are dropped (they'd double count the city
 * they surround), as are anything whose English name says so.
 */
export function wikidataQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox.map((v) => v.toFixed(3));
  return `SELECT DISTINCT ?name ?pop ?coord WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral .
  }
  ?item wdt:P1082 ?pop .
  FILTER(?pop >= 1000)
  ?item wdt:P31/wdt:P279* wd:Q486972 .
  MINUS { ?item wdt:P31/wdt:P279* wd:Q1907114 }
  ?item rdfs:label ?name . FILTER(LANG(?name) = "en")
  FILTER(!REGEX(?name, "(urban|metropolitan|statistical|micropolitan) area|metro|agglomeration", "i"))
}
ORDER BY DESC(?pop)
LIMIT 400`;
}

export function parsePopulation(raw: string | undefined): number {
  if (!raw) return NaN;
  const n = Number.parseInt(raw.replace(/[\s,.'_]/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** WKT "Point(lon lat)" → coordinates. */
export function parseWktPoint(wkt: string | undefined): { latitude: number; longitude: number } | null {
  const m = /^Point\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)$/i.exec(wkt ?? "");
  return m ? { longitude: Number(m[1]), latitude: Number(m[2]) } : null;
}

export function placesFromOverpass(elements: OverpassElement[]): Place[] {
  const places: Place[] = [];
  for (const el of elements) {
    const latitude = el.lat ?? el.center?.lat;
    const longitude = el.lon ?? el.center?.lon;
    const population = parsePopulation(el.tags?.population);
    const name = el.tags?.name;
    if (latitude === undefined || longitude === undefined || !name || !(population > 0)) continue;
    places.push({ name, latitude, longitude, population });
  }
  return places;
}

export function placesFromSparql(json: SparqlResults): Place[] {
  const places: Place[] = [];
  for (const b of json.results?.bindings ?? []) {
    const point = parseWktPoint(b.coord?.value);
    const population = Number(b.pop?.value);
    const name = b.name?.value;
    if (!point || !name || !(population > 0)) continue;
    places.push({ name, ...point, population });
  }
  return places;
}

/**
 * Keep the places that matter for at least one of `points`. Each point contributes its own strongest sources, so a cluster of small
 * suburbs next to one site can't crowd out the big city that dominates another site's horizon.
 */
export function domesFromPlaces(places: Place[], points: Observer[], radiusKm: number): LightDome[] {
  const unique = new Map<string, LightDome>();
  const best = new Map<string, number>();
  for (const point of points) {
    const scored: { key: string; dome: LightDome; glow: number }[] = [];
    for (const p of places) {
      const dome = { name: p.name, latitude: round(p.latitude, 4), longitude: round(p.longitude, 4), population: p.population };
      const d = distanceKm(point, dome);
      if (d > radiusKm) continue;
      const glow = glowIndex(p.population, d);
      if (glow < GLOW_CUTOFF) continue;
      scored.push({ key: `${dome.name.toLowerCase()}|${dome.latitude.toFixed(2)}|${dome.longitude.toFixed(2)}`, dome, glow });
    }
    scored.sort((a, b) => b.glow - a.glow);
    for (const { key, dome, glow } of scored.slice(0, PER_POINT_LIMIT)) {
      unique.set(key, dome);
      best.set(key, Math.max(best.get(key) ?? 0, glow));
    }
  }
  return [...unique.entries()]
    .sort((a, b) => (best.get(b[0]) ?? 0) - (best.get(a[0]) ?? 0))
    .slice(0, MAX_DOMES)
    .map(([, dome]) => dome);
}

/** Turn Overpass elements into light domes that matter for at least one of `points`. */
export function domesFromOverpass(elements: OverpassElement[], points: Observer[], radiusKm: number): LightDome[] {
  return domesFromPlaces(placesFromOverpass(elements), points, radiusKm);
}

export class CityLookupError extends Error {
  constructor(public failures: string[]) {
    super(`all ${failures.length} city data sources failed: ${failures.join("; ")}`);
    this.name = "CityLookupError";
  }
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function queryOverpass(url: string, bbox: [number, number, number, number], fetchImpl: typeof fetch, timeoutMs: number): Promise<Place[]> {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery(bbox))}`,
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
    // Overpass reports a server-side timeout as HTTP 200 with an empty result and a remark.
    if (!json.elements?.length && json.remark) throw new Error(json.remark.slice(0, 80));
    return placesFromOverpass(json.elements ?? []);
  });
}

async function queryWikidata(url: string, bbox: [number, number, number, number], fetchImpl: typeof fetch, timeoutMs: number): Promise<Place[]> {
  return withTimeout(timeoutMs, async (signal) => {
    // A plain GET with only safelisted headers stays a "simple" CORS request (no preflight).
    const res = await fetchImpl(`${url}?format=json&query=${encodeURIComponent(wikidataQuery(bbox))}`, {
      headers: { Accept: "application/sparql-results+json" },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return placesFromSparql((await res.json()) as SparqlResults);
  });
}

function describeFailure(url: string, err: unknown): string {
  const host = new URL(url).hostname;
  const e = err as Error;
  if (e?.name === "AbortError") return `${host}: timed out`;
  if (e instanceof TypeError) return `${host}: network error (blocked, offline or overloaded)`;
  return `${host}: ${e?.message ?? e}`;
}

/** Looks up populated places near `points`, falling through the sources until one answers. */
export async function fetchNearbyDomes(
  points: Observer[],
  radiusKm: number,
  fetchImpl: typeof fetch = fetch,
  sources: CitySource[] = CITY_SOURCES,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<LightDome[]> {
  if (points.length === 0) return [];
  const bbox = boundingBox(points, radiusKm);
  const failures: string[] = [];
  for (const source of sources) {
    try {
      const places =
        source.kind === "wikidata"
          ? await queryWikidata(source.url, bbox, fetchImpl, timeoutMs)
          : await queryOverpass(source.url, bbox, fetchImpl, timeoutMs);
      return domesFromPlaces(places, points, radiusKm);
    } catch (err) {
      failures.push(describeFailure(source.url, err));
    }
  }
  throw new CityLookupError(failures);
}

/** Merge freshly looked-up domes into an existing list, keeping manual edits for places with the same name. */
export function mergeDomes(existing: LightDome[], found: LightDome[]): LightDome[] {
  const seen = new Set(existing.map((d) => d.name.toLowerCase()));
  const merged = [...existing];
  for (const d of found) {
    if (seen.has(d.name.toLowerCase())) continue;
    seen.add(d.name.toLowerCase());
    merged.push(d);
  }
  return merged;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
