import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/data/defaults";

describe("tabs config", () => {
  it("shows every tab by default", () => {
    expect(resolveConfig({ type: "x", sites: [] }).tabs).toEqual(["ranking", "chart", "calendar"]);
  });
  it("keeps canonical order and drops unknown/disabled tabs", () => {
    expect(resolveConfig({ type: "x", sites: [], tabs: ["calendar", "ranking", "bogus" as any] }).tabs).toEqual(["ranking", "calendar"]);
  });
  it("falls back to all tabs when none are valid", () => {
    expect(resolveConfig({ type: "x", sites: [], tabs: [] }).tabs).toHaveLength(3);
  });
  it("moves default_tab to the first enabled tab when it is disabled", () => {
    const r = resolveConfig({ type: "x", sites: [], tabs: ["chart", "calendar"], default_tab: "ranking" });
    expect(r.default_tab).toBe("chart");
  });
  it("defaults sort to score", () => {
    expect(resolveConfig({ type: "x", sites: [] }).default_sort).toBe("score");
  });
});
