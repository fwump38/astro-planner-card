import type { NightSummary } from "../astro/night";
import type { CivilDate } from "../astro/time";
import type { HourlyForecast } from "../data/forecast";
import type { SkyHour } from "../data/integration";
import type { NightScore } from "../scoring/score";
import type { HomeAssistant, PlannerSettings, ResolvedConfig, Site } from "../types";

export interface ViewContext {
  hass: HomeAssistant;
  /** The card's own display options. */
  config: ResolvedConfig;
  /** Thresholds configured in the integration. */
  settings: PlannerSettings;
  sites: Site[];
  /** The civil date whose evening starts "tonight" (yesterday until dawn). */
  tonight: CivilDate;
  forecast(entity: string): HourlyForecast;
  /** The calendar's night at the centre of the sites, or undefined while it is still loading. */
  calendarNight(date: CivilDate): NightSummary | null | undefined;
  /** A site's score for a night (only the next `settings.nights` nights are scored). */
  score(site: Site, date: CivilDate): NightScore | null;
  /** Hourly sky conditions for the chart; undefined while loading. */
  skyHours(entity: string, fromMs: number, hours: number): SkyHour[] | undefined;
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

export function formatDrive(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
