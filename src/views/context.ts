import type { NightSummary, SkyOptions } from "../astro/night";
import type { CivilDate } from "../astro/time";
import type { HourlyForecast } from "../data/forecast";
import type { NightScore } from "../scoring/score";
import type { HomeAssistant, ResolvedConfig, Site } from "../types";

export interface ViewContext {
  hass: HomeAssistant;
  config: ResolvedConfig;
  sites: Site[];
  /** A neutral site at the centre of the configured sites, for views that aren't about one particular site. */
  reference: Site;
  /** The civil date whose evening starts "tonight" (yesterday until dawn). */
  tonight: CivilDate;
  forecast(entity: string): HourlyForecast;
  skyOptions(site: Site): SkyOptions;
  night(site: Site, date: CivilDate): NightSummary | null;
  score(site: Site, date: CivilDate): NightScore | null;
  fmtTime(d: Date): string;
  fmtHour(d: Date): string;
  fmtDay(d: Date): string;
  /** Hour of day (fractional) in the Home Assistant time zone. */
  localHour(d: Date): number;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
