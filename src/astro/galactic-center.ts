export type Orientation = "arch" | "angled" | "upright";

export interface GalacticCenterPosition {
  altitude: number;
  azimuth: number;
  /** Angle of the galactic plane to the horizon at the core, 0 = flat, 90 = vertical. */
  tilt: number;
}

export function classifyOrientation(tilt: number): Orientation {
  if (tilt < 30) return "arch";
  if (tilt < 60) return "angled";
  return "upright";
}
