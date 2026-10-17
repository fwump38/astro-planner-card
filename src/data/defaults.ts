import type { CardConfig, ResolvedConfig, TabId } from "../types";

export const ALL_TABS: TabId[] = ["ranking", "chart", "calendar", "targets"];

export const DEFAULT_FORECAST_DAYS = 3;

export function resolveConfig(config: CardConfig): ResolvedConfig {
  const tabs = ALL_TABS.filter((t) => (config.tabs ?? ALL_TABS).includes(t));
  const enabled = tabs.length ? tabs : ALL_TABS;
  return {
    ...config,
    tabs: enabled,
    default_tab: enabled.includes(config.default_tab as TabId) ? config.default_tab! : enabled[0],
    default_sort: config.default_sort ?? "score",
    forecast_days: Math.max(1, Math.floor(Number(config.forecast_days)) || DEFAULT_FORECAST_DAYS),
    site_filter: (config.sites ?? []).map((s) => (typeof s === "string" ? s : s.entity)).filter(Boolean),
    calendar_highlight: config.calendar_highlight ?? true,
  };
}
