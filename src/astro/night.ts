import { Body, Equator, Horizon, Illumination, MoonPhase, Observer as AeObserver, SearchAltitude } from "astronomy-engine";
import type { Observer } from "../types";
import { limitingMagnitude } from "./darkness";
import { classifyOrientation, galacticCenterPosition, type GalacticCenterPosition, type Orientation } from "./galactic-center";
import { domeImpact, type DomeGeometry, type DomeImpact } from "./light-domes";
import { type CivilDate, dateKey, solarNoon } from "./time";

export interface SkyOptions {
  minGcAltitude: number;
  /** Moon counts as "not a problem" when below the horizon or illuminated ≤ this percentage. */
  maxMoonIllumination: number;
  bortle: number;
  domes: DomeGeometry[];
  domeSigma: number;
}

export interface SkySample {
  time: Date;
  sunAltitude: number;
  moonAltitude: number;
  moonIllumination: number; // 0–1
  gc: GalacticCenterPosition;
  /** Astronomically dark and the moon isn't a problem. */
  dark: boolean;
  /** Dark and the core is above the minimum altitude. */
  gcVisible: boolean;
  limitingMagnitude: number;
  dome: DomeImpact;
}

export interface NightSummary {
  key: string;
  date: CivilDate;
  dusk: Date | null;
  dawn: Date | null;
  samples: SkySample[];
  stepMinutes: number;
  moonPhase: number; // degrees, 0 = new, 180 = full
  moonIllumination: number; // 0–1 at local midnight
  darkMinutes: number;
  gcMinutes: number;
  gcStart: Date | null;
  gcEnd: Date | null;
  gcPeakAltitude: number | null;
  gcTilt: number | null;
  orientation: Orientation | null;
  gcAzimuthStart: number | null;
  gcAzimuthEnd: number | null;
  /** Mean light-dome penalty over the visible-core window. */
  domePenalty: number;
  worstDome?: DomeGeometry;
}

const aeObservers = new WeakMap<Observer, AeObserver>();
export function toAeObserver(o: Observer): AeObserver {
  let ae = aeObservers.get(o);
  if (!ae) {
    ae = new AeObserver(o.latitude, o.longitude, o.elevation ?? 0);
    aeObservers.set(o, ae);
  }
  return ae;
}

function bodyAltitude(body: Body, time: Date, obs: AeObserver): number {
  const eq = Equator(body, time, obs, true, true);
  return Horizon(time, obs, eq.ra, eq.dec, "normal").altitude;
}

export function sampleSky(time: Date, observer: Observer, opts: SkyOptions): SkySample {
  const obs = toAeObserver(observer);
  const sunAltitude = bodyAltitude(Body.Sun, time, obs);
  const moonAltitude = bodyAltitude(Body.Moon, time, obs);
  const moonIllumination = Illumination(Body.Moon, time).phase_fraction;
  const gc = galacticCenterPosition(time, obs);
  const moonOk = moonAltitude < -0.5 || moonIllumination * 100 <= opts.maxMoonIllumination;
  const dark = sunAltitude < -18 && moonOk;
  const gcVisible = dark && gc.altitude >= opts.minGcAltitude;
  return {
    time,
    sunAltitude,
    moonAltitude,
    moonIllumination,
    gc,
    dark,
    gcVisible,
    limitingMagnitude: limitingMagnitude(sunAltitude, moonAltitude, moonIllumination, opts.bortle),
    dome: domeImpact(opts.domes, gc.azimuth, gc.altitude, opts.domeSigma),
  };
}

/** Summarise the night that begins on the evening of `date` at `observer`. */
export function computeNight(date: CivilDate, observer: Observer, opts: SkyOptions, stepMinutes = 10): NightSummary {
  const obs = toAeObserver(observer);
  const noon = solarNoon(date, observer.longitude);
  const duskT = SearchAltitude(Body.Sun, obs, -1, noon, 1, -18);
  const dawnT = duskT ? SearchAltitude(Body.Sun, obs, +1, duskT, 1, -18) : null;
  const dusk = duskT?.date ?? null;
  const dawn = dawnT?.date ?? null;
  const midnight = new Date(noon.getTime() + 12 * 3600e3);

  const samples: SkySample[] = [];
  if (dusk && dawn) {
    for (let t = dusk.getTime(); t <= dawn.getTime(); t += stepMinutes * 60e3) {
      samples.push(sampleSky(new Date(t), observer, opts));
    }
  }

  const visible = samples.filter((s) => s.gcVisible);
  const first = visible[0];
  const last = visible[visible.length - 1];
  let peak: SkySample | undefined;
  for (const s of visible) if (!peak || s.gc.altitude > peak.gc.altitude) peak = s;
  const mid = visible[Math.floor(visible.length / 2)];

  let domePenalty = 0;
  const worstCount = new Map<DomeGeometry, number>();
  for (const s of visible) {
    domePenalty += s.dome.penalty;
    if (s.dome.worst) worstCount.set(s.dome.worst, (worstCount.get(s.dome.worst) ?? 0) + s.dome.penalty);
  }
  domePenalty = visible.length ? domePenalty / visible.length : 0;
  let worstDome: DomeGeometry | undefined;
  let worstScore = 0;
  for (const [g, v] of worstCount) if (v > worstScore) [worstDome, worstScore] = [g, v];

  return {
    key: dateKey(date),
    date,
    dusk,
    dawn,
    samples,
    stepMinutes,
    moonPhase: MoonPhase(midnight),
    moonIllumination: Illumination(Body.Moon, midnight).phase_fraction,
    darkMinutes: samples.filter((s) => s.dark).length * stepMinutes,
    gcMinutes: visible.length * stepMinutes,
    gcStart: first?.time ?? null,
    gcEnd: last ? new Date(last.time.getTime() + stepMinutes * 60e3) : null,
    gcPeakAltitude: peak?.gc.altitude ?? null,
    gcTilt: mid?.gc.tilt ?? null,
    orientation: mid ? classifyOrientation(mid.gc.tilt) : null,
    gcAzimuthStart: first?.gc.azimuth ?? null,
    gcAzimuthEnd: last?.gc.azimuth ?? null,
    domePenalty,
    worstDome: domePenalty > 0.02 ? worstDome : undefined,
  };
}
