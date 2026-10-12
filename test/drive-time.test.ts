import { describe, expect, it, vi } from "vitest";
import { cachedDriveTime, getDriveTime, pairKey, roundCoord, straightLineEstimate, type KeyValueStore } from "../src/data/drive-time";
import { type CitySource, fetchNearbyDomes, CityLookupError } from "../src/data/nearby-cities";
import wikidata from "./fixtures/wikidata.json";
import overpass from "./fixtures/overpass.json";
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

const ov = (...urls: string[]): CitySource[] => urls.map((url) => ({ kind: "overpass", url }));

describe("city lookup sources", () => {
  const points = [ABIQUIU, CHACO];

  it("falls through failing servers to one that works", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(new URL(url).hostname);
      if (calls.length === 1) return new Response("busy", { status: 504 });
      if (calls.length === 2) throw new TypeError("Failed to fetch");
      return jsonResponse(overpass);
    });
    const domes = await fetchNearbyDomes(points, 250, fetchMock as unknown as typeof fetch, ov("https://a.test/x", "https://b.test/x", "https://c.test/x"));
    expect(calls).toEqual(["a.test", "b.test", "c.test"]);
    expect(domes.map((d) => d.name)).toContain("Albuquerque");
  });

  it("treats an empty result with a server remark as a failure and moves on", async () => {
    const responses = [jsonResponse({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 3" }), jsonResponse(overpass)];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const domes = await fetchNearbyDomes(points, 250, fetchMock as unknown as typeof fetch, ov("https://a.test/x", "https://b.test/x"));
    expect(domes.length).toBeGreaterThan(0);
  });

  it("reports every server's failure when all of them fail", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("a.test")) return new Response("", { status: 429 });
      throw new TypeError("Failed to fetch");
    });
    const err = await fetchNearbyDomes(points, 250, fetchMock as unknown as typeof fetch, ov("https://a.test/x", "https://b.test/x")).catch((e) => e);
    expect(err).toBeInstanceOf(CityLookupError);
    expect(err.failures).toEqual(["a.test: HTTP 429", "b.test: network error (blocked, offline or overloaded)"]);
  });

  it("gives up on a hung server after the timeout", async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const err = await fetchNearbyDomes(points, 250, hang as unknown as typeof fetch, ov("https://slow.test/x"), 20).catch((e) => e);
    expect(err.failures).toEqual(["slow.test: timed out"]);
  });
});

describe("Wikidata source", () => {
  const points = [ABIQUIU, CHACO];

  it("sends one simple GET with the box query and turns rows into deduplicated domes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(wikidata));
    const domes = await fetchNearbyDomes(points, 250, fetchMock as unknown as typeof fetch, [{ kind: "wikidata", url: "https://wd.test/sparql" }]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://wd.test/sparql");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("query")).toContain("wikibase:box");
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined(); // GET, so no CORS preflight
    const names = domes.map((d) => d.name);
    expect(names[0]).toBe("Albuquerque");
    expect(names.filter((n) => n === "Santa Fe")).toHaveLength(1);
    expect(names).toContain("Española");
    expect(names).not.toContain("Radium Springs"); // tiny and far from both sites
  });

  it("is tried first and Overpass is used only when it fails", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      seen.push(new URL(url).hostname);
      if (url.includes("wd.test")) return new Response("", { status: 500 });
      return jsonResponse(overpass);
    });
    const domes = await fetchNearbyDomes(points, 250, fetchMock as unknown as typeof fetch, [
      { kind: "wikidata", url: "https://wd.test/sparql" },
      { kind: "overpass", url: "https://op.test/x" },
    ]);
    expect(seen).toEqual(["wd.test", "op.test"]);
    expect(domes.length).toBeGreaterThan(0);
  });
});
