// Test data only — the card itself ships no hard-coded places.
import type { LightDome, Observer } from "../../src/types";

export const CHACO: Observer = { latitude: 36.06, longitude: -107.96, elevation: 1890 };
export const ABIQUIU: Observer = { latitude: 36.33, longitude: -106.47, elevation: 1900 };

export const TEST_DOMES: LightDome[] = [
  { name: "Albuquerque", latitude: 35.084, longitude: -106.651, population: 560000 },
  { name: "Rio Rancho", latitude: 35.233, longitude: -106.664, population: 104000 },
  { name: "Santa Fe", latitude: 35.687, longitude: -105.938, population: 89000 },
  { name: "Farmington", latitude: 36.728, longitude: -108.219, population: 46000 },
  { name: "Gallup", latitude: 35.528, longitude: -108.742, population: 21000 },
  { name: "Española", latitude: 35.991, longitude: -106.08, population: 10000 },
];
