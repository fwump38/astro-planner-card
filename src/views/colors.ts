import { svg, type TemplateResult } from "lit";

type Stop = [number, [number, number, number]];

function hex(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolate(stops: Stop[], t: number): string {
  if (t <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    if (t <= t1) {
      const [t0, c0] = stops[i - 1];
      const f = (t - t0) / (t1 - t0);
      return rgb([0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * f) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;

// cleardarksky-style "goodness" scale: white (bad) → deep blue (good).
const GOOD: Stop[] = [
  [0, hex("#f4f4f4")],
  [0.25, hex("#c3d7ec")],
  [0.5, hex("#80a8d8")],
  [0.75, hex("#3c70b8")],
  [1, hex("#0b2c66")],
];
export const goodColor = (fraction: number) => interpolate(GOOD, fraction);

// Darkness: day white → twilight turquoise → moonlit blues → black.
const DARK: Stop[] = [
  [0, hex("#f7f7f7")],
  [2, hex("#8fdbe8")],
  [4, hex("#3a74c4")],
  [5.5, hex("#14306e")],
  [6.5, hex("#000000")],
];
export const darknessColor = (limitingMag: number) => interpolate(DARK, limitingMag);

const GC: Stop[] = [
  [0, hex("#2b1844")],
  [20, hex("#6a3fa8")],
  [45, hex("#b58cf2")],
  [70, hex("#e8d9ff")],
];
export const gcColor = (altitude: number) => interpolate(GC, altitude);

const TEMP: Stop[] = [
  [-20, hex("#3b4cc0")],
  [0, hex("#8db0fe")],
  [15, hex("#dddddd")],
  [28, hex("#f49a7b")],
  [40, hex("#b40426")],
];
export const tempColor = (celsius: number) => interpolate(TEMP, celsius);

export const domeColor = (penalty: number) => `rgba(255, 140, 0, ${Math.min(1, penalty * 1.8).toFixed(2)})`;

export const SCORE_COLORS: Record<string, string> = {
  great: "#1b7f3b",
  good: "#4f9d2f",
  fair: "#c99a13",
  poor: "#b5462e",
  none: "transparent",
};

/** Moon disc with lit portion; phase in degrees (0 new, 180 full). Northern-hemisphere orientation. */
export function moonGlyph(phase: number, size = 16): TemplateResult {
  const r = size / 2 - 1;
  const c = size / 2;
  const cos = Math.cos((phase * Math.PI) / 180);
  const waxing = phase < 180;
  const rx = Math.abs(cos) * r;
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (cos > 0 ? 0 : 1) : cos > 0 ? 1 : 0;
  const d = `M ${c} ${c - r} A ${r} ${r} 0 0 ${limbSweep} ${c} ${c + r} A ${rx} ${r} 0 0 ${termSweep} ${c} ${c - r} Z`;
  return svg`<svg class="moon" width=${size} height=${size} viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx=${c} cy=${c} r=${r} fill="#3a3f4b" stroke="#6b7280" stroke-width="0.5"></circle>
    <path d=${d} fill="#f2ecd0"></path>
  </svg>`;
}

/** A short band drawn at the Milky Way's tilt to the horizon. */
export function tiltGlyph(tilt: number, size = 16): TemplateResult {
  const c = size / 2;
  const len = size / 2 - 1;
  const a = (tilt * Math.PI) / 180;
  const dx = Math.cos(a) * len;
  const dy = Math.sin(a) * len;
  return svg`<svg class="tilt" width=${size} height=${size} viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <line x1="1" y1=${size - 1} x2=${size - 1} y2=${size - 1} stroke="currentColor" stroke-opacity="0.35" stroke-width="1"></line>
    <line x1=${c - dx} y1=${c + dy} x2=${c + dx} y2=${c - dy} stroke="#b58cf2" stroke-width="3" stroke-linecap="round"></line>
  </svg>`;
}
