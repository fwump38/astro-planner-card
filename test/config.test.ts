import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/data/defaults";

describe("tabs config", () => {
  it("shows every tab by default", () => {
    expect(resolveConfig({ type: "x" }).tabs).toEqual(["ranking", "chart", "calendar"]);
  });
  it("keeps canonical order and drops unknown/disabled tabs", () => {
    expect(resolveConfig({ type: "x", tabs: ["calendar", "ranking", "bogus" as any] }).tabs).toEqual(["ranking", "calendar"]);
  });
  it("falls back to all tabs when none are valid", () => {
    expect(resolveConfig({ type: "x", tabs: [] }).tabs).toHaveLength(3);
  });
  it("moves default_tab to the first enabled tab when it is disabled", () => {
    const r = resolveConfig({ type: "x", tabs: ["chart", "calendar"], default_tab: "ranking" });
    expect(r.default_tab).toBe("chart");
  });
  it("defaults forecast_days to 3 and floors invalid values to at least 1", () => {
    expect(resolveConfig({ type: "x" }).forecast_days).toBe(3);
    expect(resolveConfig({ type: "x", forecast_days: 5 }).forecast_days).toBe(5);
    expect(resolveConfig({ type: "x", forecast_days: 0 }).forecast_days).toBe(3);
    expect(resolveConfig({ type: "x", forecast_days: 2.7 }).forecast_days).toBe(2);
  });
  it("defaults sort to score", () => {
    expect(resolveConfig({ type: "x" }).default_sort).toBe("score");
  });
});

describe("site filter", () => {
  it("shows every site by default", () => {
    expect(resolveConfig({ type: "x" }).site_filter).toEqual([]);
  });
  it("accepts entity ids and the older {entity, ...} objects", () => {
    const r = resolveConfig({ type: "x", sites: ["weather.a", { entity: "weather.b", bortle: 2 } as any] });
    expect(r.site_filter).toEqual(["weather.a", "weather.b"]);
  });
});
