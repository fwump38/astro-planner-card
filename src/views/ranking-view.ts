import { html, nothing, type TemplateResult } from "lit";
import { compassPoint } from "../astro/light-domes";
import { addDays, type CivilDate, solarNoon } from "../astro/time";
import type { SortId } from "../types";
import { scoreColorBand, type NightScore } from "../scoring/score";
import { SCORE_COLORS, tiltGlyph } from "./colors";
import { formatDrive, formatDuration, type ViewContext } from "./context";

export interface RankingHandlers {
  /** Nights to show, tonight included; capped at what the integration scores. */
  days: number;
  selectedNight: number;
  sort: SortId;
  onSort(sort: SortId): void;
  onSelectNight(index: number): void;
  onOpenChart(entity: string): void;
}

const SORTS: { id: SortId; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "distance", label: "Distance" },
  { id: "bortle", label: "Bortle" },
];

export function renderRanking(ctx: ViewContext, h: RankingHandlers): TemplateResult {
  const dates: CivilDate[] = Array.from({ length: Math.max(1, Math.min(h.days, ctx.settings.nights)) }, (_, i) => addDays(ctx.tonight, i));
  const selected = Math.min(h.selectedNight, dates.length - 1);
  const rows = ctx.sites.map((site) => ({ site, scores: dates.map((d) => ctx.score(site, d)) }));
  const byScore = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    (b.scores[selected]?.score ?? -1) - (a.scores[selected]?.score ?? -1);
  // Missing values (no drive time) sort last; ties fall back to score.
  const key: Record<SortId, (r: (typeof rows)[number]) => number> = {
    score: () => 0,
    distance: (r) => r.site.drive_minutes ?? Infinity,
    bortle: (r) => r.site.bortle,
  };
  rows.sort((a, b) => {
    const d = key[h.sort](a) - key[h.sort](b);
    return d === 0 || Number.isNaN(d) ? byScore(a, b) : d;
  });
  const bestRow = rows.reduce<(typeof rows)[number] | undefined>((m, r) => (!m || byScore(r, m) < 0 ? r : m), undefined);

  const best = bestRow?.scores[selected];
  const nightLabel = (i: number) => (i === 0 ? "Tonight" : ctx.fmtDay(solarNoon(dates[i], ctx.hass.config.longitude)));

  if (ctx.sites.length === 0) {
    return html`<div class="empty">No sites yet: add AstroWeather sites in the Astro Planner integration's settings.</div>`;
  }

  return html`
    ${best && best.score !== null
      ? html`<div class="summary">
          <span class="summary-label">Best ${selected === 0 ? "tonight" : nightLabel(selected)}:</span>
          <strong>${best.site.name}</strong>
          <span class="score-pill" style="background:${SCORE_COLORS[scoreColorBand(best.score)]}">${best.score}</span>
          ${best.milkyWay ? coreWindowText(ctx, best) : nothing}
        </div>
        ${bestTargetText(best)}`
      : html`<div class="summary muted">No site has a score ${selected === 0 ? "tonight" : "that night"}: check that the sites have coordinates.</div>`}
    <div class="sort-bar" role="group" aria-label="Sort sites">
      <span class="muted small">Sort by</span>
      ${SORTS.map(
        (s) => html`<button class="chip ${h.sort === s.id ? "active" : ""}" aria-pressed=${h.sort === s.id} @click=${() => h.onSort(s.id)}>
          ${s.label}
        </button>`,
      )}
    </div>
    <div class="ranking ${dates.length > 4 ? "stacked" : ""}">
      <div class="rk-headrow">
        <div class="rk-head rk-site">Site</div>
        <div class="rk-nights" style="--nights:${dates.length}">
          ${dates.map(
            (_, i) => html`<button
              class="rk-head rk-night ${i === selected ? "selected" : ""}"
              @click=${() => h.onSelectNight(i)}
              title="Score and summarise this night"
            >
              ${nightLabel(i)}
            </button>`,
          )}
        </div>
      </div>
      ${rows.map(
        ({ site, scores }) => html`
          <div class="rk-row">
            <div class="rk-site">
              <div class="site-name">${site.name}</div>
              <div class="site-meta">
                <span title=${site.bortle_estimated ? "Estimated from nearby towns; set it in the integration's site settings if you know it" : "Bortle class"}>Bortle ${site.bortle_estimated ? "~" : ""}${site.bortle}</span>${site.drive_minutes
                  ? html` · <span title=${site.drive_estimated ? "Estimated driving time from your Home Assistant location" : "Drive time"}>${site.drive_estimated ? "~" : ""}${formatDrive(site.drive_minutes)} drive</span>`
                  : nothing}
                ${site.observer ? nothing : html`<span class="warn"> · no coordinates</span>`}
              </div>
            </div>
            <div class="rk-nights" style="--nights:${dates.length}">
              ${scores.map((s, i) => renderCell(ctx, s, nightLabel(i), () => h.onOpenChart(site.entity)))}
            </div>
          </div>
        `,
      )}
    </div>
    <div class="legend">
      Score combines the forecast (cloud, transparency, seeing, wind) with the site's Bortle class, how much moon-free darkness the night has and
      nearby city glow. A night with the Milky Way core up scores higher (core window shown); otherwise the best-placed target is shown.
      <em>Italic</em> = beyond the forecast (astronomy only).
    </div>
  `;
}

function bestTargetText(s: NightScore): TemplateResult | typeof nothing {
  const t = s.targets[0];
  if (!t) return nothing;
  return html`<div class="summary-target">
    Best target there: <strong>${t.label}</strong>, ${Math.round(t.peakAltitude)}°${t.direction ? ` ${t.direction}` : ""} for ${formatDuration(t.minutes)}${s.milkyWay ? "" : " (Milky Way core isn't up)"}
  </div>`;
}

function coreWindowText(ctx: ViewContext, s: NightScore): TemplateResult {
  const n = s.night;
  if (!n.gcStart || !n.gcEnd) return html``;
  return html`<span class="core-window"
    >core ${ctx.fmtTime(n.gcStart)}–${ctx.fmtTime(n.gcEnd)}${n.orientation ? html`, ${n.orientation}` : nothing}</span
  >`;
}

function renderCell(ctx: ViewContext, s: NightScore | null, label: string, onClick: () => void): TemplateResult {
  if (!s) return html`<div class="rk-cell muted"><span class="cell-night">${label}</span>—</div>`;
  const n = s.night;
  if (s.score === null) {
    return html`<div class="rk-cell muted" title="This site has no coordinates">
      <span class="cell-night">${label}</span>no location
    </div>`;
  }
  const top = s.targets[0];
  const dome = n.worstDome;
  const domeTitle = dome
    ? `Light dome: ${dome.dome.name}, ${Math.round(dome.distanceKm)} km ${compassPoint(dome.bearing)} (${Math.round(n.domePenalty * 100)}% penalty)`
    : "";
  return html`<button class="rk-cell rk-score ${s.astroOnly ? "astro-only" : ""}" @click=${onClick} title="Open sky chart">
    <span class="cell-night">${label}</span>
    <span class="cell-main">
      <span class="score-pill" style="background:${SCORE_COLORS[scoreColorBand(s.score)]}">${s.score}</span>
      <span class="cell-lines">
        <span class="cell-line">
          ${s.milkyWay && n.gcTilt !== null ? tiltGlyph(n.gcTilt, 14) : nothing}
          ${s.milkyWay && n.gcStart && n.gcEnd
            ? html`<span class="cell-time">${ctx.fmtTime(n.gcStart)}–${ctx.fmtTime(n.gcEnd)}</span>`
            : top
              ? html`<span class="cell-target" title=${top.label}>${top.label}</span>`
              : html`<span class="muted">dark sky</span>`}
        </span>
        <span class="cell-line small">
          ${s.cloud !== null ? html`<ha-icon icon="mdi:weather-cloudy"></ha-icon>${Math.round(s.cloud)}%` : s.astroOnly ? "no forecast" : nothing}
          ${s.domeWarning ? html`<ha-icon class="dome-warn" icon="mdi:city-variant-outline" title=${domeTitle}></ha-icon>` : nothing}
        </span>
      </span>
    </span>
  </button>`;
}
