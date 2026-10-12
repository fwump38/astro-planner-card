import { html, nothing, type TemplateResult } from "lit";
import { compassPoint } from "../astro/light-domes";
import type { NightSummary } from "../astro/night";
import { addDays, type CivilDate, dateKey, daysInMonth, weekday } from "../astro/time";
import { classifyNight, scoreColorBand, type NightScore } from "../scoring/score";
import { moonGlyph, SCORE_COLORS, tiltGlyph } from "./colors";
import { formatDuration, type ViewContext } from "./context";

export interface CalendarHandlers {
  year: number;
  month: number; // 1–12
  onNavigate(delta: number): void;
  onToday(): void;
  onOpenChart(entity: string): void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A month of nights. The astronomy (moon, core window, orientation) is nearly identical across sites a few hours' drive apart,
 * so it's computed once for a reference point at the centre of the configured sites; the weather overlay then picks the best site.
 */
export function renderCalendar(ctx: ViewContext, h: CalendarHandlers): TemplateResult {
  const monthName = new Intl.DateTimeFormat(ctx.hass.locale?.language ?? "en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(h.year, h.month - 1, 1)),
  );
  const lead = weekday({ y: h.year, m: h.month, d: 1 });
  const count = daysInMonth(h.year, h.month);
  const cells: (CivilDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => ({ y: h.year, m: h.month, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);

  const overlayDates = new Set(Array.from({ length: ctx.config.nights }, (_, i) => dateKey(addDays(ctx.tonight, i))));
  const dayTonight = dateKey(ctx.tonight);
  const highlight = ctx.config.calendar_highlight;

  return html`
    <div class="cal-head">
      <button class="icon-btn" @click=${() => h.onNavigate(-1)} aria-label="Previous month"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
      <div class="cal-title">${monthName}</div>
      <button class="icon-btn" @click=${() => h.onNavigate(1)} aria-label="Next month"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
      <button class="text-btn" @click=${h.onToday}>Today</button>
    </div>
    <div class="cal-grid">
      ${WEEKDAYS.map((d) => html`<div class="cal-dow">${d}</div>`)}
      ${cells.map((c) =>
        c ? renderDay(ctx, c, overlayDates.has(dateKey(c)), dateKey(c) === dayTonight, highlight, h) : html`<div class="cal-day blank"></div>`,
      )}
    </div>
    ${highlight
      ? html`<div class="cal-key">
          <span class="key best"></span>Best: core up ${formatDuration(ctx.config.calendar_best_minutes)}+ in dark, moonless sky
          <span class="key short"></span>Short window
          <span class="key none"></span>Not visible
        </div>`
      : nothing}
    <div class="legend">
      Each day is the night that <em>starts</em> that evening, computed for the middle of your sites. The bar runs dusk → dawn; purple marks when the
      core is above ${ctx.config.calendar_min_altitude}° in dark sky with the moon down or under ${ctx.config.max_moon_illumination}% lit, and the pale strip
      shows the moon being up. For the next ${ctx.config.nights} nights, the badge is the best-scoring site by forecast.
    </div>
  `;
}

function renderDay(ctx: ViewContext, date: CivilDate, overlay: boolean, isTonight: boolean, highlight: boolean, h: CalendarHandlers): TemplateResult {
  const night = ctx.night(ctx.reference, date);
  if (!night || !night.dusk || !night.dawn) {
    return html`<div class="cal-day"><span class="cal-num">${date.d}</span><span class="muted small">no dark</span></div>`;
  }
  const dusk = night.dusk.getTime();
  const span = night.dawn.getTime() - dusk;
  const pct = (t: number) => `${(((t - dusk) / span) * 100).toFixed(2)}%`;
  const hasCore = night.gcMinutes > 0;
  const grade = classifyNight(night.gcMinutes, ctx.config.calendar_best_minutes);
  const moonlit = night.samples.length ? night.samples.filter((s) => !s.dark).length / night.samples.length : 0;

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

  const best = overlay ? bestSite(ctx, date) : null;

  return html`<div class="cal-day ${isTonight ? "today" : ""} ${highlight ? `grade-${grade}` : hasCore ? "" : "no-core"}">
    <div class="cal-top">
      <span class="cal-num">${date.d}</span>
      <span class="cal-moon" title="${Math.round(night.moonIllumination * 100)}% lit at midnight">${moonGlyph(night.moonPhase, 14)}</span>
    </div>
    <div class="cal-bar" title="Dusk ${ctx.fmtTime(night.dusk)} → dawn ${ctx.fmtTime(night.dawn)}${moonlit > 0.05 ? `; moonlit ${Math.round(moonlit * 100)}% of the night` : ""}">
      ${stretches.map((r) => html`<span class="cal-core" style="left:${pct(r.from)};width:calc(${pct(r.to)} - ${pct(r.from)})"></span>`)}
      ${moonUp(night, pct)}
    </div>
    ${hasCore
      ? html`<div class="cal-text">
            ${night.gcTilt !== null ? tiltGlyph(night.gcTilt, 12) : nothing}
            ${ctx.fmtTime(night.gcStart!)}–${ctx.fmtTime(night.gcEnd!)}
          </div>
          <div class="cal-text small muted">
            ${formatDuration(night.gcMinutes)} · ${night.orientation}${night.gcAzimuthStart !== null ? ` · ${compassPoint(night.gcAzimuthStart)}→${compassPoint(night.gcAzimuthEnd!)}` : ""}
          </div>`
      : html`<div class="cal-text small muted">${night.moonIllumination > 0.5 ? "moonlit" : "no core"}</div>`}
    ${moonNote(ctx, night)}
    ${best ? renderBadge(best, () => h.onOpenChart(best.site.entity)) : nothing}
  </div>`;
}

/** When the moon sets or rises during the night, say so: it's why a bright-moon night can still be a good one. */
function moonNote(ctx: ViewContext, night: NightSummary): TemplateResult | typeof nothing {
  const parts: string[] = [];
  if (night.moonSet) parts.push(`moon sets ${ctx.fmtTime(night.moonSet)}`);
  if (night.moonRise) parts.push(`moon rises ${ctx.fmtTime(night.moonRise)}`);
  return parts.length ? html`<div class="cal-text small muted cal-moonnote">${parts.join(" · ")}</div>` : nothing;
}

function bestSite(ctx: ViewContext, date: CivilDate): NightScore | null {
  let best: NightScore | null = null;
  for (const site of ctx.sites) {
    const s = ctx.score(site, date);
    if (s && s.score !== null && (!best || s.score > best.score!)) best = s;
  }
  return best;
}

function moonUp(night: NightSummary, pct: (t: number) => string): TemplateResult[] {
  const out: TemplateResult[] = [];
  let startAt: Date | null = null;
  let prev: Date | null = null;
  const flush = () => {
    if (startAt && prev) out.push(html`<span class="cal-moonup" style="left:${pct(startAt.getTime())};width:calc(${pct(prev.getTime())} - ${pct(startAt.getTime())})"></span>`);
    startAt = prev = null;
  };
  for (const s of night.samples) {
    if (s.moonAltitude > -0.5) {
      startAt ??= s.time;
      prev = s.time;
    } else flush();
  }
  flush();
  return out;
}

function renderBadge(s: NightScore, onClick: () => void): TemplateResult {
  return html`<button class="cal-badge ${s.astroOnly ? "astro-only" : ""}" @click=${onClick} title="Best site: ${s.site.name} (open sky chart)">
    <span class="score-pill" style="background:${SCORE_COLORS[scoreColorBand(s.score)]}">${s.score}</span>
    <span class="small cal-badge-name">${s.site.name}</span>
  </button>`;
}
