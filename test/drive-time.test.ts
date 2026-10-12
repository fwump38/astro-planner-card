import { describe, expect, it, vi } from "vitest";
import { cachedDriveTime, getDriveTime, pairKey, roundCoord, straightLineEstimate, type KeyValueStore } from "../src/data/drive-time";
import { ABIQUIU, CHACO } from "./fixtures/places";

const HOME = { latitude: 35.6528, longitude: -105.9683 };

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("drive time", () => {
  it("rounds coordinates to ~1 km before they leave the browser", () => {
    expect(roundCoord(HOME)).toEqual({ latitude: 35.65, longitude: -105.97 });
    expect(pairKey(HOME, CHACO)).toBe("35.65,-105.97>36.06,-107.96");
  });

  it("asks OSRM with rounded lon,lat pairs and rounds the result to 5 minutes", async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse({ code: "Ok", routes: [{ duration: 12720 }] }));
    const est = await getDriveTime(HOME, CHACO, fetchMock as unknown as typeof fetch, memoryStore());
    expect(est).toEqual({ minutes: 210, source: "route" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://router.project-osrm.org/route/v1/driving/-105.97,35.65;-107.96,36.06?overview=false",
    );
  });

  it("serves repeat requests from the cache without hitting the network", async () => {
    const store = memoryStore();
    const fetchMock = vi.fn(async () => jsonResponse({ code: "Ok", routes: [{ duration: 3600 }] }));
    await getDriveTime(HOME, ABIQUIU, fetchMock as unknown as typeof fetch, store);
    const again = await getDriveTime(HOME, ABIQUIU, fetchMock as unknown as typeof fetch, store);
    expect(again.minutes).toBe(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedDriveTime(HOME, ABIQUIU, store)?.source).toBe("route");
  });

  it("falls back to a labelled straight-line estimate when routing fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const est = await getDriveTime(HOME, CHACO, fetchMock as unknown as typeof fetch, memoryStore());
    expect(est.source).toBe("estimate");
    expect(est.minutes).toBeGreaterThan(120);
    expect(est.minutes).toBeLessThan(300);
    expect(est).toEqual(straightLineEstimate(HOME, CHACO));
  });

  it("re-tries a failed (estimated) route after its short TTL, but keeps real routes for months", async () => {
    const store = memoryStore();
    const failing = vi.fn(async () => {
      throw new TypeError("x");
    });
    const t0 = Date.now();
    await getDriveTime(HOME, CHACO, failing as unknown as typeof fetch, store, t0);
    expect(cachedDriveTime(HOME, CHACO, store, t0 + 3600e3)).not.toBeNull();
    expect(cachedDriveTime(HOME, CHACO, store, t0 + 7 * 3600e3)).toBeNull();

    const ok = vi.fn(async () => jsonResponse({ code: "Ok", routes: [{ duration: 600 }] }));
    await getDriveTime(HOME, ABIQUIU, ok as unknown as typeof fetch, store, t0);
    expect(cachedDriveTime(HOME, ABIQUIU, store, t0 + 60 * 24 * 3600e3)).not.toBeNull();
  });
});
