import type { NightSummary, SkySample } from "../astro/night";
import { classifyOrientation } from "../astro/galactic-center";
import type { DomeGeometry } from "../astro/light-domes";
import type { CivilDate } from "../astro/time";
import type { NightScore } from "../scoring/score";
import type { HomeAssistant, Observer, PlannerSettings, Site } from "../types";

/**
 * The Milky Way Planner integration (https://github.com/fwump38/milky-way-planner) does all the astronomy and scoring;
 * this card only asks it for the results and draws them.
 */
export const INTEGRATION_DOMAIN = "milky_way_planner";
export const INTEGRATION_URL = "https://github.com/fwump38/milky-way-planner";
const API_VERSION = 2;

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


interface WireSite {
  entity: string;
  name: string;
  bortle: number;
  drive_minutes: number | null;
  drive_estimated: boolean;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  source: { coordinates: string | null; bortle: string; drive_time: string | null };
}

interface WireScore {
  date: string;
  score: number | null;
  astro_only: boolean;
  weather: number | null;
  cloud: number | null;
  dome_warning: boolean;
  night: WireNight;
}

interface WireOverview {
  api_version: number;
  tonight: string;
  reference: Observer;
  settings: PlannerSettings;
  sites: WireSite[];
  scores: Record<string, WireScore[]>;
  forecast_end: Record<string, string>;
}

/** What the card shows: the integration's sites and each site's scored nights, keyed by site entity then date. */
export interface Overview {
  tonight: CivilDate;
  reference: Observer;
  settings: PlannerSettings;
  sites: Site[];
  scores: Map<string, Map<string, NightScore>>;
}

/** One hour of sky conditions at a site, for the sky chart. */
export interface SkyHour {
  time: Date;
  sunAltitude: number;
  moonAltitude: number;
  limitingMagnitude: number;
  gcAltitude: number;
  gcVisible: boolean;
  domePenalty: number;
}

export function integrationInstalled(hass: HomeAssistant): boolean {
  return Boolean(hass.config.components?.includes(INTEGRATION_DOMAIN) && hass.callWS);
}

async function call<T extends { api_version: number }>(hass: HomeAssistant, msg: Record<string, unknown>): Promise<T> {
  const res = await hass.callWS!<T>({ ...msg, type: `${INTEGRATION_DOMAIN}/${msg.type}` });
  if (res.api_version !== API_VERSION) {
    throw new Error(`The Milky Way Planner integration speaks API ${res.api_version}; this card needs ${API_VERSION}. Update both from HACS.`);
  }
  return res;
}

const parseDate = (s: string): CivilDate => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};

export function overviewFromWire(w: WireOverview): Overview {
  const sites: Site[] = w.sites.map((s) => ({
    entity: s.entity,
    name: s.name,
    bortle: s.bortle,
    bortle_estimated: s.source.bortle === "estimated" || s.source.bortle === "default",
    drive_minutes: s.drive_minutes,
    drive_estimated: s.drive_estimated,
    observer: s.latitude !== null && s.longitude !== null ? { latitude: s.latitude, longitude: s.longitude, elevation: s.elevation ?? undefined } : null,
  }));
  const scores = new Map<string, Map<string, NightScore>>();
  for (const site of sites) {
    const rows = new Map<string, NightScore>();
    for (const r of w.scores[site.entity] ?? []) {
      rows.set(r.date, { site, night: nightFromWire(r.night), score: r.score, astroOnly: r.astro_only, weather: r.weather, cloud: r.cloud, domeWarning: r.dome_warning });
    }
    scores.set(site.entity, rows);
  }
  return { tonight: parseDate(w.tonight), reference: w.reference, settings: w.settings, sites, scores };
}

export async function fetchOverview(hass: HomeAssistant): Promise<Overview> {
  return overviewFromWire(await call<WireOverview>(hass, { type: "overview" }));
}

/** Nights at the centre of the sites (what the calendar draws), `days` from `start` (YYYY-MM-DD). */
export async function fetchCalendar(hass: HomeAssistant, start: string, days: number): Promise<NightSummary[]> {
  const res = await call<{ api_version: number; nights: WireNight[] }>(hass, { type: "calendar", start, days });
  return res.nights.map(nightFromWire);
}

export async function fetchSkyHours(hass: HomeAssistant, entity: string, startMs: number, hours: number): Promise<SkyHour[]> {
  const res = await call<{
    api_version: number;
    hours: { t: number; sun: number; moon: number; lm: number; alt: number; vis: boolean; dp: number }[];
  }>(hass, { type: "sky_hours", entity, start: new Date(startMs).toISOString(), hours });
  return res.hours.map((h) => ({
    time: new Date(h.t),
    sunAltitude: h.sun,
    moonAltitude: h.moon,
    limitingMagnitude: h.lm,
    gcAltitude: h.alt,
    gcVisible: h.vis,
    domePenalty: h.dp,
  }));
}
