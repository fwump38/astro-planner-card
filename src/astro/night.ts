import type { CivilDate } from "./time";
import type { GalacticCenterPosition, Orientation } from "./galactic-center";
import type { DomeGeometry, DomeImpact } from "./light-domes";

/** The shapes the views draw. The integration calculates them; the card only displays them. */
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
  /** First moonrise / moonset between dusk and dawn, if any. */
  moonRise: Date | null;
  moonSet: Date | null;
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
