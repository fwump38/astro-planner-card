import { describe, expect, it, vi } from "vitest";
import { CityLookupError, fetchNearbyDomes } from "../src/data/nearby-cities";
import type { HomeAssistant } from "../src/types";
import wikidata from "./fixtures/wikidata.json";
import { ABIQUIU, CHACO } from "./fixtures/places";

const points = [ABIQUIU, CHACO];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hassWith = (callWS: unknown, components = ["milky_way_planner"]) => ({ config: { components }, callWS }) as unknown as HomeAssistant;
const INTEGRATION_DOMES = [{ name: "Albuquerque metro", latitude: 35.1, longitude: -106.65, population: 680000 }];

describe("city lookup", () => {
  it("asks the integration first and doesn't touch Wikidata when it answers", async () => {
    const callWS = vi.fn(async () => ({ source: "geonames", domes: INTEGRATION_DOMES }));
    const fetchMock = vi.fn();
    const res = await fetchNearbyDomes(points, 250, { hass: hassWith(callWS), fetchImpl: fetchMock as unknown as typeof fetch });
    expect(res).toEqual({ domes: INTEGRATION_DOMES, source: "integration" });
    expect(callWS).toHaveBeenCalledWith({
      type: "milky_way_planner/find_light_domes",
      points: [
        { latitude: ABIQUIU.latitude, longitude: ABIQUIU.longitude },
        { latitude: CHACO.latitude, longitude: CHACO.longitude },
      ],
      radius_km: 250,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes straight to Wikidata when the integration isn't installed", async () => {
    const callWS = vi.fn();
    const fetchMock = vi.fn(async () => json(wikidata));
    const res = await fetchNearbyDomes(points, 250, { hass: hassWith(callWS, ["sun"]), fetchImpl: fetchMock as unknown as typeof fetch });
    expect(res.source).toBe("wikidata");
    expect(callWS).not.toHaveBeenCalled();
  });

  it("falls back to Wikidata when the integration fails", async () => {
    const callWS = vi.fn(async () => {
      throw { code: "lookup_failed", message: "geonames: HTTP 503; wikidata: timed out" };
    });
    const fetchMock = vi.fn(async () => json(wikidata));
    const res = await fetchNearbyDomes(points, 250, { hass: hassWith(callWS), fetchImpl: fetchMock as unknown as typeof fetch });
    expect(res.source).toBe("wikidata");
    expect(res.domes.map((d) => d.name)).toContain("Albuquerque");
  });

  it("reports every source's failure when all of them fail", async () => {
    const callWS = vi.fn(async () => {
      throw new Error("lookup_failed");
    });
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    const err = await fetchNearbyDomes(points, 250, { hass: hassWith(callWS), fetchImpl: fetchMock as unknown as typeof fetch, wikidataUrl: "https://wd.test/sparql" }).catch((e) => e);
    expect(err).toBeInstanceOf(CityLookupError);
    expect(err.failures).toEqual(["Milky Way Planner integration: lookup_failed", "wd.test: HTTP 429"]);
  });

  it("gives up on a hung integration and a hung Wikidata after their timeouts", async () => {
    const callWS = vi.fn(() => new Promise(() => {}));
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const err = await fetchNearbyDomes(points, 250, {
      hass: hassWith(callWS),
      fetchImpl: hang as unknown as typeof fetch,
      wikidataUrl: "https://slow.test/sparql",
      timeoutMs: 20,
      integrationTimeoutMs: 20,
    }).catch((e) => e);
    expect(err.failures).toEqual(["Milky Way Planner integration: timed out", "slow.test: timed out"]);
  });

  it("sends Wikidata one simple GET with the box query and deduplicates the rows into domes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(wikidata));
    const { domes } = await fetchNearbyDomes(points, 250, { fetchImpl: fetchMock as unknown as typeof fetch, wikidataUrl: "https://wd.test/sparql" });
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
});
