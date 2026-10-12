import { clamp } from "../data/defaults";

/** Rough naked-eye limiting magnitude at zenith on a moonless, astronomically dark night per Bortle class. */
const BORTLE_NELM = [7.8, 7.8, 7.3, 6.8, 6.3, 5.8, 5.3, 4.8, 4.3, 4.0];

/**
 * Approximate zenith limiting magnitude given sun/moon state, in the spirit of
 * cleardarksky's "Darkness" row. Not photometrically rigorous: it's a visual guide.
 */
export function limitingMagnitude(
  sunAltitude: number,
  moonAltitude: number,
  moonIllumination: number,
  bortle: number,
): number {
  const base = BORTLE_NELM[clamp(Math.round(bortle), 1, 9)];
  let lm: number;
  if (sunAltitude >= -6) lm = 0;
  else if (sunAltitude >= -18) lm = 1.5 + ((-6 - sunAltitude) / 12) * (base - 1.5);
  else lm = base;

  if (moonAltitude > 0) {
    // Full moon high in the sky costs ~3 magnitudes; scales with phase and altitude.
    const penalty = 3.2 * Math.pow(moonIllumination, 1.5) * Math.sqrt(Math.sin((moonAltitude * Math.PI) / 180));
    lm = Math.min(lm, base - penalty);
  }
  return Math.max(0, lm);
}
