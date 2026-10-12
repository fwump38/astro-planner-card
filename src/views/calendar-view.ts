import { html, nothing, type TemplateResult } from "lit";
import { compassPoint } from "../astro/light-domes";
import { addDays, type CivilDate, dateKey, daysInMonth, weekday } from "../astro/time";
import { scoreColorBand, type NightScore } from "../scoring/score";
import type { Site } from "../types";
import { moonGlyph, SCORE_COLORS, tiltGlyph } from "./colors";
import { formatDuration, type ViewContext } from "./context";

export interface CalendarHandlers {
  year: number;
  month: number; // 1–12
  /** Entity id, or "" to use the best of all sites for forecast overlays. */
  siteEntity: string;
  onNavigate(delta: number): void;
  onToday(): void;
  onSelectSite(entity: string): void;
  onOpenChart(entity: string): void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function renderCalendar(ctx: ViewContext, h: CalendarHandlers): TemplateResult {
  const calSite: Site | undefined = ctx.sites.find((s) => s.entity === h.siteEntity) ?? ctx.sites[0];
  const monthName = new Intl.DateTimeFormat(ctx.hass.locale?.language ?? "en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(h.year, h.month - 1, 1)),
  );
  if (!calSite?.observer) {
    return html`<div class="empty">Add an AstroWeather site (or set its coordinates) to see the Milky Way calendar.</div>`;
  }

  const lead = weekday({ y: h.year, m: h.month, d: 1 });
  const count = daysInMonth(h.year, h.month);
  const cells: (CivilDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => ({ y: h.year, m: h.month, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);

  const overlayDates = new Set(Array.from({ length: ctx.config.nights }, (_, i) => dateKey(addDays(ctx.tonight, i))));
  const dayTonight = dateKey(ctx.tonight);

  return html`
    <div class="cal-head">
      <button class="icon-btn" @click=${() => h.onNavigate(-1)} aria-label="Previous month"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
      <div class="cal-title">${monthName}</div>
      <button class="icon-btn" @click=${() => h.onNavigate(1)} aria-label="Next month"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
      <button class="text-btn" @click=${h.onToday}>Today</button>
      <select class="site-select" @change=${(e: Event) => h.onSelectSite((e.target as HTMLSelectElement).value)}>
        ${ctx.sites.map((s) => html`<option value=${s.entity} ?selected=${s.entity === calSite.entity}>${s.name}</option>`)}
      </select>
    </div>
    <div class="cal-grid">
      ${WEEKDAYS.map((d) => html`<div class="cal-dow">${d}</div>`)}
      ${cells.map((c) => (c ? renderDay(ctx, calSite, c, overlayDates.has(dateKey(c)), dateKey(c) === dayTonight, h) : html`<div class="cal-day blank"></div>`))}
    </div>
    <div class="legend">
      Each day is the night that <em>starts</em> that evening, at ${calSite.name}. The bar runs dusk → dawn; purple marks when the core is up
      while the sky is dark (moon below the horizon or under ${ctx.config.max_moon_illumination}% lit, core above ${ctx.config.min_gc_altitude}°).
      Colored badges add the weather forecast score for the next ${ctx.config.nights} nights.
    </div>
  `;
}

function renderDay(ctx: ViewContext, site: Site, date: CivilDate, overlay: boolean, isTonight: boolean, h: CalendarHandlers): TemplateResult {
  const night = ctx.night(site, date);
  if (!night || !night.dusk || !night.dawn) {
    return html`<div class="cal-day"><span class="cal-num">${date.d}</span><span class="muted small">no dark</span></div>`;
  }
  const span = night.dawn.getTime() - night.dusk.getTime();
  const pos = (t: Date) => `${(((t.getTime() - night.dusk!.getTime()) / span) * 100).toFixed(2)}%`;
  const hasCore = night.gcMinutes > 0;
  const moonlit = night.samples.length ? night.samples.filter((s) => !s.dark).length / night.samples.length : 0;
  const newMoonWeek = night.moonIllumination < 0.15;
  const score: NightScore | null = overlay ? ctx.score(site, date) : null;

  // Contiguous visible stretches for the timeline bar.
  const stretches: { from: number; to: number }[] = [];
  const step = night.stepMinutes * 60e3;
  for (const s of night.samples) {
    if (!s.gcVisible) continue;
    const t = s.time.getTime();
    const last = stretches[stretches.length - 1];
    if (last && t - last.to <= step) last.to = t + step;
    else stretches.push({ from: t, to: t + step });
  }
  const pct = (t: number) => `${(((t - night.dusk!.getTime()) / span) * 100).toFixed(2)}%`;
  const dome = night.worstDome;

  return html`<div class="cal-day ${isTonight ? "today" : ""} ${newMoonWeek ? "new-moon" : ""} ${hasCore ? "" : "no-core"}">
    <div class="cal-top">
      <span class="cal-num">${date.d}</span>
      <span class="cal-moon" title="${Math.round(night.moonIllumination * 100)}% lit at midnight">${moonGlyph(night.moonPhase, 14)}</span>
    </div>
    <div class="cal-bar" title="Dusk ${ctx.fmtTime(night.dusk)} → dawn ${ctx.fmtTime(night.dawn)}${moonlit > 0.05 ? `; moonlit ${Math.round(moonlit * 100)}% of the night` : ""}">
      ${stretches.map((r) => html`<span class="cal-core" style="left:${pct(r.from)};width:calc(${pct(r.to)} - ${pct(r.from)})"></span>`)}
      ${moonUp(night, pos)}
    </div>
    ${hasCore
      ? html`<div class="cal-text">
            ${night.gcTilt !== null ? tiltGlyph(night.gcTilt, 12) : nothing}
            ${ctx.fmtTime(night.gcStart!)}–${ctx.fmtTime(night.gcEnd!)}
          </div>
          <div class="cal-text small muted">
            ${formatDuration(night.gcMinutes)} · ${night.orientation}${night.gcAzimuthStart !== null ? ` · ${compassPoint(night.gcAzimuthStart)}→${compassPoint(night.gcAzimuthEnd!)}` : ""}
          </div>
          ${dome && night.domePenalty >= ctx.config.dome_warning_threshold
            ? html`<div class="cal-text small dome-warn" title="Core points toward ${dome.dome.name}">
                <ha-icon icon="mdi:city-variant-outline"></ha-icon>${dome.dome.name}
              </div>`
            : nothing}`
      : html`<div class="cal-text small muted">${night.moonIllumination > 0.5 ? "moonlit" : "no core"}</div>`}
    ${score && score.score !== null ? renderBadge(ctx, score, () => h.onOpenChart(site.entity)) : nothing}
  </div>`;
}

function moonUp(night: { samples: { time: Date; moonAltitude: number }[]; stepMinutes: number }, pos: (t: Date) => string): TemplateResult[] {
  const out: TemplateResult[] = [];
  let startAt: Date | null = null;
  let prev: Date | null = null;
  for (const s of night.samples) {
    if (s.moonAltitude > -0.5) {
      startAt ??= s.time;
      prev = s.time;
    } else if (startAt && prev) {
      out.push(html`<span class="cal-moonup" style="left:${pos(startAt)};width:calc(${pos(prev)} - ${pos(startAt)})"></span>`);
      startAt = prev = null;
    }
  }
  if (startAt && prev) out.push(html`<span class="cal-moonup" style="left:${pos(startAt)};width:calc(${pos(prev)} - ${pos(startAt)})"></span>`);
  return out;
}

function renderBadge(ctx: ViewContext, s: NightScore, onClick: () => void): TemplateResult {
  const ranked = ctx.sites
    .map((site) => ({ site, sc: ctx.score(site, s.night.date) }))
    .filter((x) => x.sc && x.sc.score !== null)
    .sort((a, b) => b.sc!.score! - a.sc!.score!);
  const best = ranked[0];
  return html`<button class="cal-badge ${s.astroOnly ? "astro-only" : ""}" @click=${onClick} title="Open sky chart">
    <span class="score-pill" style="background:${SCORE_COLORS[scoreColorBand(s.score)]}">${s.score}</span>
    ${best && best.site.entity !== s.site.entity ? html`<span class="small muted" title="Best site that night">★ ${best.site.name} ${best.sc!.score}</span>` : nothing}
  </button>`;
}
