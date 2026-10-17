import { html, nothing, type TemplateResult } from "lit";
import { addDays, type CivilDate, solarNoon } from "../astro/time";
import {
  filterAndSort,
  monthOf,
  placement,
  TARGET_GROUPS,
  TARGET_SORTS,
  type ShowerOutlook,
  type Target,
  type TargetGroup,
  type TargetsResult,
  type TargetSort,
} from "../data/targets";
import { scoreColorBand } from "../scoring/score";
import { SCORE_COLORS } from "./colors";
import { formatDuration, type ViewContext } from "./context";

export interface TargetsHandlers {
  /** Days after tonight whose sky is shown. */
  offset: number;
  group: TargetGroup;
  sort: TargetSort;
  /** Hide objects too big for the field of view set in the integration. */
  framingOnly: boolean;
  showAll: boolean;
  data: TargetsResult | undefined;
  showers: ShowerOutlook[] | undefined;
  onNavigate(days: number): void;
  onToday(): void;
  onGroup(group: TargetGroup): void;
  onSort(sort: TargetSort): void;
  onFramingOnly(on: boolean): void;
  onShowAll(): void;
}

/** Rows shown before "Show all". */
export const TARGET_ROWS = 40;

const FRAMING_TEXT = { fits: "fits", too_large: "too big", too_small: "small" } as const;

export function renderTargets(ctx: ViewContext, h: TargetsHandlers): TemplateResult {
  const date: CivilDate = addDays(ctx.tonight, h.offset);
  const label = h.offset === 0 ? "Tonight" : ctx.fmtDay(solarNoon(date, ctx.hass.config.longitude));
  const data = h.data;
  const fov = data?.settings.fovArcmin ?? 0;
  const rows = data ? filterAndSort(data.targets, h.group, h.sort, h.framingOnly && fov > 0) : [];
  const shown = h.showAll ? rows : rows.slice(0, TARGET_ROWS);

  return html`
    <div class="tg-head">
      <button class="text-btn" @click=${() => h.onNavigate(-7)} title="A week earlier">«</button>
      <button class="text-btn" @click=${() => h.onNavigate(-1)} title="Previous night">‹</button>
      <span class="tg-date">${label}</span>
      <button class="text-btn" @click=${() => h.onNavigate(1)} title="Next night">›</button>
      <button class="text-btn" @click=${() => h.onNavigate(7)} title="A week later">»</button>
      ${h.offset !== 0 ? html`<button class="text-btn" @click=${h.onToday}>Tonight</button>` : nothing}
    </div>
    ${data?.dark ? darkLine(ctx, data) : nothing}
    <div class="sort-bar" role="group" aria-label="Kind of object">
      ${TARGET_GROUPS.map(
        (g) => html`<button class="chip ${h.group === g.id ? "active" : ""}" aria-pressed=${h.group === g.id} @click=${() => h.onGroup(g.id)}>${g.label}</button>`,
      )}
    </div>
    <div class="sort-bar" role="group" aria-label="Sort objects">
      <span class="muted small">Sort by</span>
      ${TARGET_SORTS.map(
        (s) => html`<button class="chip ${h.sort === s.id ? "active" : ""}" aria-pressed=${h.sort === s.id} @click=${() => h.onSort(s.id)}>${s.label}</button>`,
      )}
      ${fov > 0
        ? html`<button class="chip ${h.framingOnly ? "active" : ""}" aria-pressed=${h.framingOnly} @click=${() => h.onFramingOnly(!h.framingOnly)} title="Hide objects larger than your ${fov}′ field of view">
            Fits my FOV
          </button>`
        : nothing}
    </div>
    ${!data
      ? html`<div class="empty">Loading targets…</div>`
      : rows.length === 0
        ? html`<div class="empty">Nothing in this group is up after dark ${h.offset === 0 ? "tonight" : "that night"}.</div>`
        : html`<div class="tg-list">${shown.map((t) => renderRow(ctx, t, fov))}</div>
            ${rows.length > shown.length
              ? html`<div class="tg-more">${rows.length - shown.length} more. <button class="text-btn" @click=${h.onShowAll}>Show all ${rows.length}</button></div>`
              : nothing}`}
    ${data
      ? html`<div class="legend">
          Objects above ${data.settings.minAltitude}° during astronomical darkness at your Home Assistant location, fainter than magnitude
          ${data.settings.maxMagnitude} left out${fov > 0 ? `; field of view ${fov}′` : ""}. “Best placed” weighs time up, height and the moon. These are set under
          Configure → Targets in the integration.
        </div>`
      : nothing}
    ${renderShowers(ctx, h.showers)}
  `;
}

function darkLine(ctx: ViewContext, data: TargetsResult): TemplateResult {
  const d = data.dark!;
  return html`<div class="tg-dark">
    ${d.dusk && d.dawn ? html`Dark ${ctx.fmtTime(d.dusk)}–${ctx.fmtTime(d.dawn)} (${formatDuration(d.darkMinutes)})` : "No astronomical darkness"}
    · moon ${Math.round(d.moonIllumination * 100)}% lit${d.darkMinutes ? `, ${formatDuration(d.moonFreeMinutes)} of moon-free dark` : ""}
  </div>`;
}

function renderRow(ctx: ViewContext, t: Target, fov: number): TemplateResult {
  const n = t.night;
  const meta = [t.kindLabel, t.constellation, t.magnitude !== null ? `mag ${t.magnitude}` : null, t.size ? `${t.size >= 10 ? Math.round(t.size) : t.size}′` : null]
    .filter(Boolean)
    .join(" · ");
  const best = t.bestDate ? `best in ${monthOf(t.bestDate)}` : "";
  return html`<div class="tg-row">
    <div>
      <div class="tg-name" title=${t.label}>
        ${t.name === t.designation ? html`<span class="tg-desig">${t.designation}</span>` : html`<span class="tg-desig">${t.designation}</span> – ${t.name}`}${fov > 0 && t.framing
          ? html`<span class="tg-badge" title="Compared with your ${fov}′ field of view">${FRAMING_TEXT[t.framing]}</span>`
          : nothing}${n.moonPenalty >= 0.3
          ? html`<span class="tg-badge" title=${n.moonSeparation !== null ? `Moon ${n.moonSeparation}° away` : "Moon is up"}>moon</span>`
          : nothing}
      </div>
      <div class="tg-meta">${meta}${best ? ` · ${best}` : ""}</div>
      <div class="tg-bar" title="How well placed it is tonight"><span style="width:${Math.round(placement(n) * 100)}%"></span></div>
    </div>
    <div class="tg-when">
      <div>${Math.round(n.peakAltitude)}°${n.direction ? ` ${n.direction}` : ""}</div>
      <div class="muted small">${n.start && n.end ? `${ctx.fmtTime(n.start)}–${ctx.fmtTime(n.end)}` : ""}</div>
      <div class="muted small">${formatDuration(n.minutes)} up</div>
    </div>
  </div>`;
}

function renderShowers(ctx: ViewContext, showers: ShowerOutlook[] | undefined): TemplateResult | typeof nothing {
  if (!showers?.length) return nothing;
  const fmtPeak = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return ctx.fmtDay(solarNoon({ y, m, d }, ctx.hass.config.longitude));
  };
  return html`<div class="tg-showers">
    <h4>Meteor showers</h4>
    ${showers.map(
      (s) => html`<div class="sh-row">
        <div>
          <div class="tg-name">${s.name}${s.active ? html`<span class="tg-badge">active</span>` : nothing}</div>
          <div class="tg-meta">
            peaks ${fmtPeak(s.peak)} (${s.daysUntil === 0 ? "tonight" : `in ${s.daysUntil} d`}) · up to ${s.zhr}/h · radiant ${s.radiantPeakAltitude}° · moon
            ${s.moonIllumination}%
          </div>
        </div>
        <span class="score-pill" style="background:${SCORE_COLORS[scoreColorBand(s.rating)]}" title="Outlook for the peak night here">${s.rating}</span>
      </div>`,
    )}
  </div>`;
}
