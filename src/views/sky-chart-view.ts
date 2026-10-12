import { html, nothing, type TemplateResult } from "lit";
import { addDays, type CivilDate } from "../astro/time";
import { forecastAt, type HourlyForecast } from "../data/forecast";
import type { SkyHour } from "../data/integration";
import type { AstroForecastHour } from "../types";
import { darknessColor, domeColor, gcColor, goodColor, tempColor } from "./colors";
import type { ViewContext } from "./context";

export interface ChartHandlers {
  selectedEntity: string;
  onSelectSite(entity: string): void;
}

interface Column {
  time: Date;
  fc?: AstroForecastHour;
  sunAlt: number;
  moonAlt: number;
  lm: number;
  gcAlt: number;
  domePenalty: number;
  gcVisible: boolean;
  localHour: number;
  /** Forecast temperatures are in the Home Assistant unit system. */
  fahrenheit: boolean;
}

interface Row {
  label: string;
  title: string;
  cell(c: Column): { bg: string; text?: string; title?: string } | null;
}

const pct = (v: number | undefined) => (v === undefined ? null : Math.max(0, Math.min(100, v)));

const ROWS: Row[] = [
  {
    label: "Cloud",
    title: "Cloud cover — dark blue is clear",
    cell: (c) => {
      const clear = pct(c.fc?.cloudless_percentage ?? (c.fc?.cloudcover_percentage !== undefined ? 100 - c.fc.cloudcover_percentage : undefined));
      return clear === null ? null : { bg: goodColor(clear / 100), title: `${100 - clear}% cloud` };
    },
  },
  {
    label: "Transparency",
    title: "Atmospheric transparency",
    cell: (c) => {
      const v = pct(c.fc?.transparency_percentage);
      return v === null ? null : { bg: goodColor(v / 100), title: `${v}%` };
    },
  },
  {
    label: "Seeing",
    title: "Seeing matters little for wide-field Milky Way work",
    cell: (c) => {
      const v = pct(c.fc?.seeing_percentage);
      return v === null ? null : { bg: goodColor(v / 100), title: `${v}%` };
    },
  },
  {
    label: "Darkness",
    title: "Estimated naked-eye limiting magnitude (sun, moon, Bortle)",
    cell: (c) => ({ bg: darknessColor(c.lm), title: `limiting mag ≈ ${c.lm.toFixed(1)}` }),
  },
  {
    label: "Core alt",
    title: "Galactic core altitude, shown while astronomically dark",
    cell: (c) => {
      if (c.gcAlt <= 0) return { bg: "transparent" };
      return {
        bg: c.gcVisible ? gcColor(c.gcAlt) : "rgba(128,128,128,0.18)",
        text: c.gcVisible ? String(Math.round(c.gcAlt)) : "",
        title: `${Math.round(c.gcAlt)}°`,
      };
    },
  },
  {
    label: "Light dome",
    title: "Interference from configured cities in the core's direction",
    cell: (c) => (c.gcAlt > 0 && c.sunAlt < -12 && c.domePenalty > 0.02 ? { bg: domeColor(c.domePenalty), title: `${Math.round(c.domePenalty * 100)}%` } : { bg: "transparent" }),
  },
  {
    label: "Calm",
    title: "Wind — dark blue is calm",
    cell: (c) => {
      const v = pct(c.fc?.calm_percentage);
      return v === null ? null : { bg: goodColor(v / 100), title: `${v}% calm${c.fc?.wind_speed !== undefined ? `, ${Math.round(c.fc.wind_speed)} wind` : ""}` };
    },
  },
  {
    label: "Humidity",
    title: "Relative humidity — dewing risk above ~85%",
    cell: (c) => {
      const v = pct(c.fc?.humidity);
      return v === null ? null : { bg: goodColor(1 - v / 100), text: String(Math.round(v)), title: `${Math.round(v)}%` };
    },
  },
  {
    label: "Temp",
    title: "Temperature",
    cell: (c) =>
      c.fc?.temperature === undefined
        ? null
        : {
            bg: tempColor(c.fahrenheit ? ((c.fc.temperature - 32) * 5) / 9 : c.fc.temperature),
            text: String(Math.round(c.fc.temperature)),
            title: `${Math.round(c.fc.temperature)}°${c.fahrenheit ? "F" : "C"}`,
          },
  },
];

export function renderSkyChart(ctx: ViewContext, h: ChartHandlers): TemplateResult {
  if (ctx.sites.length === 0) return html`<div class="empty">Add AstroWeather sites in the Milky Way Planner integration's settings.</div>`;
  const site = ctx.sites.find((s) => s.entity === h.selectedEntity) ?? ctx.sites[0];
  const options = html`<select
    class="site-select"
    @change=${(e: Event) => h.onSelectSite((e.target as HTMLSelectElement).value)}
  >
    ${ctx.sites.map((s) => html`<option value=${s.entity} ?selected=${s.entity === site.entity}>${s.name}</option>`)}
  </select>`;

  if (!site.observer) {
    return html`<div class="chart-head">${options}</div>
      <div class="empty">
        Couldn't read ${site.name}'s coordinates. Enable AstroWeather's latitude/longitude sensors, or set them for this site in the integration's site settings.
      </div>`;
  }

  const forecast = ctx.forecast(site.entity);
  if (forecast.hours.length === 0) {
    return html`<div class="chart-head">${options}</div><div class="empty">Waiting for ${site.name}'s forecast…</div>`;
  }
  const range = chartRange(forecast);
  const sky = ctx.skyHours(site.entity, range.from, range.hours);
  const columns = sky ? buildColumns(ctx, forecast, sky) : [];
  if (columns.length === 0) {
    return html`<div class="chart-head">${options}</div><div class="empty">Loading ${site.name}'s sky…</div>`;
  }

  // Day separators: where the local date changes.
  const days: { label: string; span: number }[] = [];
  columns.forEach((c, i) => {
    const label = ctx.fmtDay(c.time);
    const prev = columns[i - 1];
    if (prev && ctx.fmtDay(prev.time) === label) days[days.length - 1].span++;
    else days.push({ label, span: 1 });
  });

  const dayShade = (c: Column) => (c.sunAlt > -0.8 ? "day" : c.sunAlt > -18 ? "twilight" : "night");

  return html`
    <div class="chart-head">
      ${options}
      <span class="muted">forecast through ${ctx.fmtDay(new Date(forecast.end ?? Date.now()))} ${ctx.fmtTime(new Date(forecast.end ?? Date.now()))}</span>
    </div>
    <div class="chart-scroll">
      <div class="chart" style="--cols:${columns.length}">
        <div class="ch-label"></div>
        <div class="ch-days" style="grid-template-columns:repeat(${columns.length},var(--col-w))">
          ${days.map((d) => html`<div class="ch-day" style="grid-column:span ${d.span}">${d.span > 3 ? d.label : ""}</div>`)}
        </div>
        <div class="ch-label"></div>
        <div class="ch-hours" style="grid-template-columns:repeat(${columns.length},var(--col-w))">
          ${columns.map((c) => html`<div class="ch-hour ${dayShade(c)}">${ctx.fmtHour(c.time)}</div>`)}
        </div>
        ${ROWS.map((row) => {
          const cells = columns.map((c) => row.cell(c));
          if (row.label === "Cloud" || row.label === "Transparency" || row.label === "Seeing" || row.label === "Calm" || row.label === "Humidity" || row.label === "Temp") {
            if (cells.every((x) => x === null)) return nothing;
          }
          return html`
            <div class="ch-label" title=${row.title}>${row.label}</div>
            <div class="ch-row" style="grid-template-columns:repeat(${columns.length},var(--col-w))">
              ${cells.map(
                (cell, i) =>
                  html`<div
                    class="ch-cell ${cell ? "" : "empty-cell"} ${dayShade(columns[i])}"
                    style=${cell ? `background:${cell.bg}` : ""}
                    title=${cell?.title ?? ""}
                  >
                    ${cell?.text ?? ""}
                  </div>`,
              )}
            </div>
          `;
        })}
      </div>
    </div>
    <div class="legend">Dark blue is good, white is poor. Core altitude is only filled while the sky is dark and the moon isn't a problem.</div>
  `;
}

/** The hours the chart covers: from about now to the end of the forecast (at least a day, at most three). */
export function chartRange(forecast: HourlyForecast, now = Date.now()): { from: number; hours: number } {
  const startMs = Math.floor((forecast.start ?? now) / 3600e3) * 3600e3;
  const fcEnd = forecast.end ?? startMs + 48 * 3600e3;
  const horizon = Math.max(fcEnd, startMs + 24 * 3600e3);
  const from = Math.max(startMs, Math.floor(now / 3600e3) * 3600e3 - 3600e3);
  const to = Math.min(horizon, from + 72 * 3600e3);
  return { from, hours: Math.max(1, Math.floor((to - from) / 3600e3) + 1) };
}

function buildColumns(ctx: ViewContext, forecast: HourlyForecast, sky: SkyHour[]): Column[] {
  const fahrenheit = ctx.hass.config.unit_system?.temperature?.includes("F") ?? false;
  return sky.map((s) => ({
    time: s.time,
    fc: forecastAt(forecast, s.time),
    sunAlt: s.sunAltitude,
    moonAlt: s.moonAltitude,
    lm: s.limitingMagnitude,
    gcAlt: s.gcAltitude,
    domePenalty: s.domePenalty,
    gcVisible: s.gcVisible,
    localHour: ctx.localHour(s.time),
    fahrenheit,
  }));
}

// Re-export for the card shell, keeps tonight/addDays imports tree-shakeable together.
export type { CivilDate };
export { addDays };
