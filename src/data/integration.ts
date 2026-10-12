import type { NightSummary, SkySample } from "../astro/night";
import { classifyOrientation } from "../astro/galactic-center";
import type { DomeGeometry } from "../astro/light-domes";
import { addDays, type CivilDate, dateKey } from "../astro/time";
import type { HomeAssistant, LightDome, Observer } from "../types";

/** The Milky Way Planner integration (https://github.com/fwump38/milky-way-planner) computes the same nights server-side. */
export const INTEGRATION_DOMAIN = "milky_way_planner";
const API_VERSION = 1;
const RETRY_AFTER_MS = 5 * 60e3;
const MAX_DAYS = 62;

export interface NightRequest {
  /** Matches the card's own night-cache key, so a result can be served in place of a local computation. */
  key: string;
  /** Requests with the same group key share observer and options, and are batched into one call. */
  group: string;
  date: CivilDate;
  observer: Observer;
  bortle: number;
  minGcAltitude: number;
  maxMoonIllumination: number;
  domes: LightDome[];
  domeSigma: number;
}

interface WireSample {
  t: number;
  sun: number;
  moon: number;
  ill: number;
  alt: number;
  az: number;
  tilt: number;
  dark: boolean;
  vis: boolean;
  lm: number;
  dp: number;
}

interface WireNight {
  date: string;
  dusk: string | null;
  dawn: string | null;
  step_minutes: number;
  moon_phase: number;
  moon_illumination: number;
  moon_rise: string | null;
  moon_set: string | null;
  dark_minutes: number;
  gc_minutes: number;
  gc_start: string | null;
  gc_end: string | null;
  gc_peak_altitude: number | null;
  gc_tilt: number | null;
  orientation: NightSummary["orientation"];
  gc_azimuth_start: number | null;
  gc_azimuth_end: number | null;
  dome_penalty: number;
  worst_dome: { name: string; latitude: number; longitude: number; population: number; distance_km: number; bearing: number; glow: number } | null;
  samples?: WireSample[];
}

const toDate = (s: string | null): Date | null => (s ? new Date(s) : null);

export function nightFromWire(w: WireNight): NightSummary {
  const [y, m, d] = w.date.split("-").map(Number);
  const worst: DomeGeometry | undefined = w.worst_dome
    ? {
        dome: { name: w.worst_dome.name, latitude: w.worst_dome.latitude, longitude: w.worst_dome.longitude, population: w.worst_dome.population },
        distanceKm: w.worst_dome.distance_km,
        bearing: w.worst_dome.bearing,
        glow: w.worst_dome.glow,
      }
    : undefined;
  const samples: SkySample[] = (w.samples ?? []).map((s) => ({
    time: new Date(s.t),
    sunAltitude: s.sun,
    moonAltitude: s.moon,
    moonIllumination: s.ill,
    gc: { altitude: s.alt, azimuth: s.az, tilt: s.tilt },
    dark: s.dark,
    gcVisible: s.vis,
    limitingMagnitude: s.lm,
    dome: { penalty: s.dp },
  }));
  return {
    key: w.date,
    date: { y, m, d },
    dusk: toDate(w.dusk),
    dawn: toDate(w.dawn),
    samples,
    stepMinutes: w.step_minutes,
    moonPhase: w.moon_phase,
    moonIllumination: w.moon_illumination,
    moonRise: toDate(w.moon_rise),
    moonSet: toDate(w.moon_set),
    darkMinutes: w.dark_minutes,
    gcMinutes: w.gc_minutes,
    gcStart: toDate(w.gc_start),
    gcEnd: toDate(w.gc_end),
    gcPeakAltitude: w.gc_peak_altitude,
    gcTilt: w.gc_tilt,
    orientation: w.orientation ?? (w.gc_tilt !== null ? classifyOrientation(w.gc_tilt) : null),
    gcAzimuthStart: w.gc_azimuth_start,
    gcAzimuthEnd: w.gc_azimuth_end,
    domePenalty: w.dome_penalty,
    worstDome: worst,
  };
}

/** Groups sorted dates into runs of consecutive days, each at most `max` long. */
export function contiguousRuns(dates: CivilDate[], max = MAX_DAYS): CivilDate[][] {
  const sorted = [...dates].sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  const runs: CivilDate[][] = [];
  for (const d of sorted) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && dateKey(addDays(last, 1)) === dateKey(d) && run.length < max) run.push(d);
    else runs.push([d]);
  }
  return runs;
}

export function integrationInstalled(hass: HomeAssistant): boolean {
  return Boolean(hass.config.components?.includes(INTEGRATION_DOMAIN) && hass.callWS);
}

/**
 * Fetches nights from the integration and serves them back by cache key. The card keeps computing locally in the
 * meantime (and whenever the integration is missing or errors), so it never depends on the integration being there.
 */
export class IntegrationNights {
  private results = new Map<string, NightSummary>();
  private requested = new Set<string>();
  private queue = new Map<string, NightRequest[]>();
  private failedUntil = 0;
  private scheduled = false;

  constructor(private onChange: () => void) {}

  get(key: string): NightSummary | undefined {
    return this.results.get(key);
  }

  clear(): void {
    this.results.clear();
    this.requested.clear();
    this.queue.clear();
  }

  /** Queue a request (deduplicated); the batch is sent on the next microtask. */
  request(hass: HomeAssistant, req: NightRequest): void {
    if (!integrationInstalled(hass) || Date.now() < this.failedUntil) return;
    if (this.results.has(req.key) || this.requested.has(req.key)) return;
    this.requested.add(req.key);
    const group = this.queue.get(req.group) ?? [];
    group.push(req);
    this.queue.set(req.group, group);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush(hass));
    }
  }

  private async flush(hass: HomeAssistant): Promise<void> {
    this.scheduled = false;
    const batches = [...this.queue.values()];
    this.queue.clear();
    try {
      const info = await hass.callWS!<{ api_version: number }>({ type: `${INTEGRATION_DOMAIN}/info` });
      if (info.api_version !== API_VERSION) throw new Error(`unsupported integration API ${info.api_version}`);
      let changed = false;
      for (const batch of batches) {
        const byDate = new Map(batch.map((r) => [dateKey(r.date), r]));
        for (const run of contiguousRuns(batch.map((r) => r.date))) {
          const first = byDate.get(dateKey(run[0]))!;
          const res = await hass.callWS!<{ nights: WireNight[] }>({
            type: `${INTEGRATION_DOMAIN}/nights`,
            start: dateKey(run[0]),
            days: run.length,
            observer: first.observer,
            bortle: first.bortle,
            min_gc_altitude: first.minGcAltitude,
            max_moon_illumination: first.maxMoonIllumination,
            dome_sigma: first.domeSigma,
            domes: first.domes,
            step_minutes: 10,
          });
          for (const w of res.nights) {
            const req = byDate.get(w.date);
            if (req) {
              this.results.set(req.key, nightFromWire(w));
              changed = true;
            }
          }
        }
      }
      if (changed) this.onChange();
    } catch (err) {
      console.warn("milky-way-planner-card: integration unavailable, using built-in calculations", err);
      this.failedUntil = Date.now() + RETRY_AFTER_MS;
      for (const batch of batches) for (const r of batch) this.requested.delete(r.key);
    }
  }
}
