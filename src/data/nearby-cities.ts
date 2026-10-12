import { distanceKm, glowIndex } from "../astro/light-domes";
import type { HomeAssistant, LightDome, Observer } from "../types";
import { INTEGRATION_DOMAIN, integrationInstalled } from "./integration";

/** Where the card's own Wikidata lookup goes. The integration, when installed, is asked first (it uses GeoNames, which browsers can't fetch). */
export const WIKIDATA_URL = "https://query.wikidata.org/sparql";
export type CitySource = "integration" | "wikidata";
export const REQUEST_TIMEOUT_MS = 20000;
/** The integration may need to download the GeoNames file on its first lookup. */
export const INTEGRATION_TIMEOUT_MS = 180000;
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

/** WKT "Point(lon lat)" → coordinates. */
export function parseWktPoint(wkt: string | undefined): { latitude: number; longitude: number } | null {
  const m = /^Point\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)$/i.exec(wkt ?? "");
  return m ? { longitude: Number(m[1]), latitude: Number(m[2]) } : null;
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

export class CityLookupError extends Error {
  constructor(public failures: string[]) {
    super(`all city data sources failed: ${failures.join("; ")}`);
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

async function queryWikidata(bbox: [number, number, number, number], fetchImpl: typeof fetch, timeoutMs: number, url: string): Promise<Place[]> {
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

interface IntegrationDomes {
  source: string;
  domes: LightDome[];
}

/** The integration does the lookup server-side (GeoNames, then Wikidata) and folds suburbs into metro areas. */
async function queryIntegration(hass: HomeAssistant, points: Observer[], radiusKm: number, timeoutMs: number): Promise<IntegrationDomes> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timed out"), { name: "AbortError" })), timeoutMs);
  });
  try {
    return await Promise.race([
      hass.callWS!<IntegrationDomes>({
        type: `${INTEGRATION_DOMAIN}/find_light_domes`,
        points: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        radius_km: radiusKm,
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(label: string, err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === "AbortError") return `${label}: timed out`;
  if (err instanceof TypeError) return `${label}: network error (blocked, offline or overloaded)`;
  return `${label}: ${e?.message ?? String(err)}`;
}

export interface NearbyOptions {
  /** When the Milky Way Planner integration is installed, it is asked first. */
  hass?: HomeAssistant;
  fetchImpl?: typeof fetch;
  wikidataUrl?: string;
  timeoutMs?: number;
  integrationTimeoutMs?: number;
}

export interface NearbyResult {
  domes: LightDome[];
  source: CitySource;
}

/** Looks up populated places near `points`: the integration first (if installed), then Wikidata directly. */
export async function fetchNearbyDomes(points: Observer[], radiusKm: number, opts: NearbyOptions = {}): Promise<NearbyResult> {
  if (points.length === 0) return { domes: [], source: "wikidata" };
  const { hass, fetchImpl = fetch, wikidataUrl = WIKIDATA_URL, timeoutMs = REQUEST_TIMEOUT_MS, integrationTimeoutMs = INTEGRATION_TIMEOUT_MS } = opts;
  const failures: string[] = [];

  if (hass && integrationInstalled(hass)) {
    try {
      const res = await queryIntegration(hass, points, radiusKm, integrationTimeoutMs);
      return { domes: res.domes, source: "integration" };
    } catch (err) {
      failures.push(describeFailure("Milky Way Planner integration", err));
    }
  }
  try {
    const places = await queryWikidata(boundingBox(points, radiusKm), fetchImpl, timeoutMs, wikidataUrl);
    return { domes: domesFromPlaces(places, points, radiusKm), source: "wikidata" };
  } catch (err) {
    failures.push(describeFailure(new URL(wikidataUrl).hostname, err));
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
