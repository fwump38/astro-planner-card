/** Targets (Messier objects, planets, custom entries) as the integration reports them for the Home Assistant location. */

export type TargetKind =
  | "milky_way"
  | "galaxy"
  | "globular_cluster"
  | "open_cluster"
  | "planetary_nebula"
  | "nebula"
  | "supernova_remnant"
  | "star_cloud"
  | "double_star"
  | "asterism"
  | "planet"
  | "custom";

export interface TargetNight {
  date: string;
  /** Dark minutes spent above the integration's minimum altitude. */
  minutes: number;
  peakAltitude: number;
  peakTime: Date | null;
  direction: string | null;
  start: Date | null;
  end: Date | null;
  /** 0–1: how much the moon spoils the observable part of the night. */
  moonPenalty: number;
  /** Degrees from the moon at the peak. */
  moonSeparation: number | null;
}

export interface Target {
  id: string;
  /** "M31" */
  designation: string;
  /** "Andromeda Galaxy" */
  name: string;
  /** "M31 – Andromeda Galaxy" */
  label: string;
  kind: TargetKind;
  kindLabel: string;
  magnitude: number | null;
  /** Major axis in arcminutes. */
  size: number | null;
  constellation: string | null;
  /** Roughly when it crosses the meridian at local midnight (its best time of year), as an ISO date. */
  bestDate: string | null;
  /** How it fits the field of view the user set in the integration (null when none is set). */
  framing: "fits" | "too_large" | "too_small" | null;
  night: TargetNight;
}

export interface DarkNight {
  date: string;
  dusk: Date | null;
  dawn: Date | null;
  darkMinutes: number;
  moonFreeMinutes: number;
  moonIllumination: number;
}

export interface TargetsResult {
  settings: { minAltitude: number; maxMagnitude: number; fovArcmin: number };
  dark: DarkNight | null;
  targets: Target[];
}

export interface ShowerOutlook {
  id: string;
  name: string;
  peak: string;
  daysUntil: number;
  active: boolean;
  zhr: number;
  radiantPeakAltitude: number;
  moonIllumination: number;
  moonFreeMinutes: number;
  rating: number;
}

export type TargetGroup = "all" | "galaxy" | "cluster" | "nebula" | "planet" | "custom";
export type TargetSort = "placement" | "brightness" | "altitude" | "name";

export const TARGET_GROUPS: { id: TargetGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "galaxy", label: "Galaxies" },
  { id: "cluster", label: "Clusters" },
  { id: "nebula", label: "Nebulae" },
  { id: "planet", label: "Planets" },
  { id: "custom", label: "Custom" },
];

export const TARGET_SORTS: { id: TargetSort; label: string }[] = [
  { id: "placement", label: "Best placed" },
  { id: "brightness", label: "Brightest" },
  { id: "altitude", label: "Highest" },
  { id: "name", label: "Number" },
];

const GROUP_OF: Record<TargetKind, TargetGroup> = {
  milky_way: "all",
  galaxy: "galaxy",
  globular_cluster: "cluster",
  open_cluster: "cluster",
  star_cloud: "cluster",
  asterism: "cluster",
  double_star: "cluster",
  planetary_nebula: "nebula",
  nebula: "nebula",
  supernova_remnant: "nebula",
  planet: "planet",
  custom: "custom",
};

export const groupOf = (kind: TargetKind): TargetGroup => GROUP_OF[kind] ?? "all";

/**
 * 0–1 for how well placed a target is on the night: time above the minimum altitude, how high it gets and how much the moon
 * interferes. Mirrors the integration's target scoring (without the weather and the site's sky, which don't apply at home).
 */
export function placement(n: TargetNight): number {
  if (n.minutes <= 0) return 0;
  const time = 0.6 + 0.4 * Math.min(1, n.minutes / 180);
  const height = 0.6 + 0.4 * Math.min(1, Math.max(0, n.peakAltitude - 20) / 50);
  return time * height * (1 - 0.8 * n.moonPenalty);
}

const designationNumber = (t: Target): number => {
  const m = /^M(\d+)$/.exec(t.designation);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

export function filterAndSort(targets: Target[], group: TargetGroup, sort: TargetSort, framingOnly: boolean): Target[] {
  const out = targets.filter((t) => (group === "all" || groupOf(t.kind) === group) && (!framingOnly || t.framing !== "too_large"));
  const cmp: Record<TargetSort, (a: Target, b: Target) => number> = {
    // Placement saturates for anything well up all night, so near-ties fall back to the brighter object.
    placement: (a, b) => Math.round((placement(b.night) - placement(a.night)) * 25) || (a.magnitude ?? 99) - (b.magnitude ?? 99),
    brightness: (a, b) => (a.magnitude ?? 99) - (b.magnitude ?? 99),
    altitude: (a, b) => b.night.peakAltitude - a.night.peakAltitude,
    name: (a, b) => designationNumber(a) - designationNumber(b) || a.designation.localeCompare(b.designation),
  };
  return out.sort((a, b) => cmp[sort](a, b) || designationNumber(a) - designationNumber(b));
}

/** "Oct" for an ISO date, in English, independent of the browser's locale. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthOf = (iso: string | null): string => (iso ? MONTHS[Number(iso.slice(5, 7)) - 1] : "");
