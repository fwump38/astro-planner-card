import { distanceKm } from "../astro/light-domes";
import type { Observer } from "../types";

export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const CACHE_KEY = "milky-way-planner-card:drive-times:v1";
const ROUTE_TTL_MS = 90 * 24 * 3600e3;
const ESTIMATE_TTL_MS = 6 * 3600e3;
const REQUEST_TIMEOUT_MS = 15000;

export interface DriveEstimate {
  minutes: number;
  /** "route" comes from a driving route, "estimate" is a straight-line guess used when routing is unavailable. */
  source: "route" | "estimate";
}

interface CacheEntry extends DriveEstimate {
  at: number;
}

/** Minimal storage interface so tests (and private-mode browsers) don't need a real `localStorage`. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Rounded to 0.01° (~1 km): plenty for a multi-hour drive, and avoids sending an exact home address to a third party. */
export function roundCoord(o: Observer): { latitude: number; longitude: number } {
  return { latitude: Math.round(o.latitude * 100) / 100, longitude: Math.round(o.longitude * 100) / 100 };
}

export function pairKey(from: Observer, to: Observer): string {
  const a = roundCoord(from);
  const b = roundCoord(to);
  return `${a.latitude},${a.longitude}>${b.latitude},${b.longitude}`;
}

/** Rough driving time from straight-line distance: roads wind (×1.35) and average ~70 km/h on rural roads. */
export function straightLineEstimate(from: Observer, to: Observer): DriveEstimate {
  const km = distanceKm(from, to) * 1.35;
  return { minutes: Math.round(((km / 70) * 60) / 5) * 5, source: "estimate" };
}

function safeStore(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readCache(store: KeyValueStore | undefined): Record<string, CacheEntry> {
  try {
    return JSON.parse(store?.getItem(CACHE_KEY) ?? "{}") as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

export function cachedDriveTime(from: Observer, to: Observer, store: KeyValueStore | undefined = safeStore(), now = Date.now()): DriveEstimate | null {
  const entry = readCache(store)[pairKey(from, to)];
  if (!entry) return null;
  const ttl = entry.source === "route" ? ROUTE_TTL_MS : ESTIMATE_TTL_MS;
  return now - entry.at < ttl ? { minutes: entry.minutes, source: entry.source } : null;
}

function remember(from: Observer, to: Observer, est: DriveEstimate, store: KeyValueStore | undefined, now: number): void {
  try {
    const cache = readCache(store);
    cache[pairKey(from, to)] = { ...est, at: now };
    store?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage may be unavailable or full; the estimate is still returned for this session.
  }
}

/**
 * Driving minutes from `from` to `to`. Uses a cached value when fresh, otherwise asks OSRM,
 * and falls back to a straight-line estimate if the routing server can't be reached.
 */
export async function getDriveTime(
  from: Observer,
  to: Observer,
  fetchImpl: typeof fetch = fetch,
  store: KeyValueStore | undefined = safeStore(),
  now = Date.now(),
): Promise<DriveEstimate> {
  const cached = cachedDriveTime(from, to, store, now);
  if (cached) return cached;

  const a = roundCoord(from);
  const b = roundCoord(to);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${OSRM_URL}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { code?: string; routes?: { duration: number }[] };
    const seconds = json.routes?.[0]?.duration;
    if (json.code !== "Ok" || typeof seconds !== "number") throw new Error(`no route (${json.code})`);
    const est: DriveEstimate = { minutes: Math.round(seconds / 60 / 5) * 5, source: "route" };
    remember(from, to, est, store, now);
    return est;
  } catch {
    const est = straightLineEstimate(from, to);
    remember(from, to, est, store, now);
    return est;
  } finally {
    clearTimeout(timer);
  }
}

export function formatDrive(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
