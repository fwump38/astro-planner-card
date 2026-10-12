import {
  CombineRotation,
  HorizonFromVector,
  Observer as AeObserver,
  RotateVector,
  Rotation_EQJ_HOR,
  Rotation_GAL_EQJ,
  Spherical,
  VectorFromSphere,
} from "astronomy-engine";

export type Orientation = "arch" | "angled" | "upright";

export interface GalacticCenterPosition {
  altitude: number;
  azimuth: number;
  /** Angle of the galactic plane to the horizon at the core, 0 = flat, 90 = vertical. */
  tilt: number;
}

const GAL_EQJ = Rotation_GAL_EQJ();
// Points on the galactic equator: the core (l=0) and either side of it, used to measure the band's tilt.
const CORE = new Spherical(0, 0, 1);
const BAND_A = new Spherical(0, 5, 1);
const BAND_B = new Spherical(0, -5, 1);

export function galacticCenterPosition(date: Date, observer: AeObserver): GalacticCenterPosition {
  const rot = CombineRotation(GAL_EQJ, Rotation_EQJ_HOR(date, observer));
  const toHor = (s: Spherical) => HorizonFromVector(RotateVector(rot, VectorFromSphere(s, date)), "normal");
  const core = toHor(CORE);
  const a = toHor(BAND_A);
  const b = toHor(BAND_B);
  return { altitude: core.lat, azimuth: core.lon, tilt: bandTilt(a, b, core.lat) };
}

/** Angle between the line a→b (on the sky, in the local tangent plane at the core) and the horizon. */
function bandTilt(a: Spherical, b: Spherical, coreAlt: number): number {
  let dAz = b.lon - a.lon;
  if (dAz > 180) dAz -= 360;
  if (dAz < -180) dAz += 360;
  const dx = dAz * Math.cos((coreAlt * Math.PI) / 180);
  const dy = b.lat - a.lat;
  return (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
}

export function classifyOrientation(tilt: number): Orientation {
  if (tilt < 30) return "arch";
  if (tilt < 60) return "angled";
  return "upright";
}
