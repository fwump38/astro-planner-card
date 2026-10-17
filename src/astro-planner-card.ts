import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { NightSummary } from "./astro/night";
import { addDays, dateKey, daysInMonth, makeDayFormatter, makeHourFormatter, makeTimeFormatter } from "./astro/time";
import { resolveConfig } from "./data/defaults";
import { EMPTY_FORECAST, type HourlyForecast, subscribeForecasts } from "./data/forecast";
import { fetchCalendar, fetchOverview, fetchShowers, fetchSkyHours, fetchTargets, INTEGRATION_URL, integrationInstalled, type Overview, type SkyHour } from "./data/integration";
import type { ShowerOutlook, TargetGroup, TargetsResult, TargetSort } from "./data/targets";
import { cardStyles, targetStyles } from "./styles";
import type { CardConfig, HomeAssistant, ResolvedConfig, Site, SortId, TabId } from "./types";
import { renderCalendar } from "./views/calendar-view";
import type { ViewContext } from "./views/context";
import { renderRanking } from "./views/ranking-view";
import { renderSkyChart } from "./views/sky-chart-view";
import { renderTargets } from "./views/targets-view";
import "./editor/card-editor";

declare const __CARD_VERSION__: string;
console.info(
  `%c ASTRO-PLANNER-CARD %c v${__CARD_VERSION__} `,
  "color:#fff;background:#3a2a6e;font-weight:700",
  "color:#3a2a6e;background:#e8d9ff",
);

const REFRESH_MS = 5 * 60e3;
const RETRY_MS = 60e3;
const MAX_SKY_CACHE = 40;

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String((err as { message?: string; code?: string })?.message ?? (err as { code?: string })?.code ?? err);

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "ranking", label: "Tonight", icon: "mdi:format-list-numbered" },
  { id: "chart", label: "Sky chart", icon: "mdi:chart-timeline" },
  { id: "calendar", label: "Calendar", icon: "mdi:calendar-month" },
  { id: "targets", label: "Targets", icon: "mdi:telescope" },
];

export class AstroPlannerCard extends LitElement {
  static styles = [cardStyles, targetStyles, css``];

  static getConfigElement(): HTMLElement {
    return document.createElement("astro-planner-card-editor");
  }

  static getStubConfig(): Partial<CardConfig> {
    return {};
  }

  @state() private _tab: TabId = "ranking";
  @state() private _selectedNight = 0;
  @state() private _sort: SortId = "score";
  @state() private _chartEntity = "";
  @state() private _calYear = 0;
  @state() private _calMonth = 0;
  @state() private _error = "";
  @state() private _targetOffset = 0;
  @state() private _targetGroup: TargetGroup = "all";
  @state() private _targetSort: TargetSort = "placement";
  @state() private _framingOnly = false;
  @state() private _showAll = false;

  private _config?: ResolvedConfig;
  private _hass?: HomeAssistant;
  private _overview?: Overview;
  private _overviewSignature = "";
  private _loading = false;
  private _retryAt = 0;
  private _timer?: ReturnType<typeof setInterval>;
  private _forecasts = new Map<string, HourlyForecast>();
  private _unsubscribe?: () => void;
  private _subscribedKey = "";
  private _calendar = new Map<string, NightSummary>();
  private _calendarRequested = new Set<string>();
  private _sky = new Map<string, SkyHour[]>();
  private _skyRequested = new Set<string>();
  private _hassSignature = "";
  private _targets = new Map<string, TargetsResult>();
  private _targetsRequested = new Set<string>();
  private _showers?: ShowerOutlook[];
  private _showersRequested = false;

  setConfig(config: CardConfig): void {
    if (!config) throw new Error("astro-planner-card: missing configuration");
    this._config = resolveConfig(config);
    this._tab = this._config.default_tab;
    this._sort = this._config.default_sort;
    this._subscribedKey = "";
    this._ensureSubscriptions();
    this._refresh();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Re-fetch when a site's weather entity changed (HA pushes `hass` on every state change, so compare only what we care about).
    const sig = (this._overview?.sites ?? []).map((s) => `${s.entity}:${hass.states[s.entity]?.last_updated ?? ""}`).join("|");
    if (sig !== this._hassSignature) {
      this._hassSignature = sig;
      if (this._overview) this._refresh();
    }
    if (!this._overview) this._refresh();
    this.requestUpdate();
    this._ensureSubscriptions();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  getCardSize(): number {
    return 8;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._timer = setInterval(() => this._refresh(), REFRESH_MS);
    this._ensureSubscriptions();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._subscribedKey = "";
  }

  /** Ask the integration for the sites and their scored nights (one request at a time, backed off after an error). */
  private _refresh(): void {
    const hass = this._hass;
    if (!hass || !this._config || this._loading || Date.now() < this._retryAt || !integrationInstalled(hass)) return;
    this._loading = true;
    fetchOverview(hass)
      .then((overview) => {
        // Anything derived from the integration's settings is stale once those change.
        const sig = JSON.stringify([overview.settings, overview.reference, overview.sites.map((s) => [s.entity, s.bortle, s.observer])]);
        if (sig !== this._overviewSignature) {
          this._overviewSignature = sig;
          this._calendar.clear();
          this._calendarRequested.clear();
          this._sky.clear();
          this._skyRequested.clear();
          this._targets.clear();
          this._targetsRequested.clear();
          this._showers = undefined;
          this._showersRequested = false;
        }
        this._overview = overview;
        this._error = "";
        if (this._calYear === 0) {
          this._calYear = overview.tonight.y;
          this._calMonth = overview.tonight.m;
        }
        this._ensureSubscriptions();
      })
      .catch((err) => {
        this._error = errorText(err);
        this._retryAt = Date.now() + RETRY_MS;
        console.warn("astro-planner-card: couldn't read the integration", err);
      })
      .finally(() => {
        this._loading = false;
        this.requestUpdate();
      });
  }

  private _visibleSites(): Site[] {
    const all = this._overview?.sites ?? [];
    const only = this._config?.site_filter ?? [];
    return only.length ? all.filter((s) => only.includes(s.entity)) : all;
  }

  private _ensureSubscriptions(): void {
    const hass = this._hass;
    if (!hass || !this._overview || !this.isConnected) return;
    const entities = this._visibleSites().map((s) => s.entity).filter((e) => hass.states[e]);
    const key = entities.join(",");
    if (key === this._subscribedKey) return;
    this._subscribedKey = key;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (entities.length === 0) return;
    subscribeForecasts(hass, entities, (entity, forecast) => {
      this._forecasts.set(entity, forecast);
      this.requestUpdate();
    }).then((unsub) => {
      // If the subscription set changed while we were connecting, drop this one.
      if (this._subscribedKey !== key) unsub();
      else this._unsubscribe = unsub;
    });
  }

  /** Load the calendar's nights for a month once. */
  private _ensureCalendar(year: number, month: number): void {
    const hass = this._hass;
    const key = `${year}-${month}`;
    if (!hass || !this._overview || this._calendarRequested.has(key)) return;
    this._calendarRequested.add(key);
    fetchCalendar(hass, dateKey({ y: year, m: month, d: 1 }), daysInMonth(year, month))
      .then((nights) => {
        for (const n of nights) this._calendar.set(n.key, n);
        this.requestUpdate();
      })
      .catch((err) => {
        this._error = errorText(err);
        setTimeout(() => this._calendarRequested.delete(key), RETRY_MS);
      });
  }

  /** Load the targets up on a night once, plus the meteor showers. */
  private _ensureTargets(key: string): void {
    const hass = this._hass;
    if (!hass || !this._overview) return;
    if (!this._targetsRequested.has(key)) {
      this._targetsRequested.add(key);
      fetchTargets(hass, key)
        .then((res) => {
          this._targets.set(key, res);
          this.requestUpdate();
        })
        .catch((err) => {
          this._error = errorText(err);
          setTimeout(() => this._targetsRequested.delete(key), RETRY_MS);
        });
    }
    if (!this._showersRequested) {
      this._showersRequested = true;
      fetchShowers(hass, 3)
        .then((res) => {
          this._showers = res;
          this.requestUpdate();
        })
        .catch(() => setTimeout(() => (this._showersRequested = false), RETRY_MS));
    }
  }

  private _skyHours(entity: string, from: number, hours: number): SkyHour[] | undefined {
    const key = `${entity}|${from}|${hours}`;
    const hit = this._sky.get(key);
    if (hit) return hit;
    const hass = this._hass;
    if (!hass || this._skyRequested.has(key)) return undefined;
    this._skyRequested.add(key);
    fetchSkyHours(hass, entity, from, hours)
      .then((res) => {
        if (this._sky.size >= MAX_SKY_CACHE) this._sky.clear();
        this._sky.set(key, res);
        this.requestUpdate();
      })
      .catch((err) => {
        this._error = errorText(err);
        setTimeout(() => this._skyRequested.delete(key), RETRY_MS);
      });
    return undefined;
  }

  private _localHour = (d: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: this._hass!.config.time_zone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return get("hour") + get("minute") / 60;
  };

  private _context(overview: Overview): ViewContext {
    const hass = this._hass!;
    const tz = hass.config.time_zone;
    const lang = hass.locale?.language ?? hass.language ?? "en";
    const fmt = hass.locale?.time_format;
    return {
      hass,
      config: this._config!,
      settings: overview.settings,
      sites: this._visibleSites(),
      tonight: overview.tonight,
      forecast: (entity) => this._forecasts.get(entity) ?? EMPTY_FORECAST,
      calendarNight: (date) => this._calendar.get(dateKey(date)),
      score: (site, date) => overview.scores.get(site.entity)?.get(dateKey(date)) ?? null,
      skyHours: (entity, from, hours) => this._skyHours(entity, from, hours),
      fmtTime: makeTimeFormatter(tz, lang, fmt),
      fmtHour: makeHourFormatter(tz, lang, fmt),
      fmtDay: makeDayFormatter(tz, lang),
      localHour: this._localHour,
    };
  }

  protected render(): TemplateResult {
    if (!this._config || !this._hass) return html``;
    const config = this._config;
    if (!integrationInstalled(this._hass)) {
      return html`<ha-card>
        <div class="empty">
          This card needs the <a href=${INTEGRATION_URL} target="_blank" rel="noreferrer">Astro Planner integration</a>, which
          does the astronomy and scoring. Install it from HACS, then add it under Settings → Devices &amp; services.
        </div>
      </ha-card>`;
    }
    const overview = this._overview;
    if (!overview) {
      return html`<ha-card>
        <div class="empty">${this._error ? html`<span class="warn">${this._error}</span>` : "Loading from the Astro Planner integration…"}</div>
      </ha-card>`;
    }
    if (overview.sites.length === 0) {
      return html`<ha-card>
        <div class="empty">
          The Astro Planner integration has no sites yet. Add your AstroWeather sites in its settings (Settings → Devices &amp; services
          → Astro Planner → Configure).
        </div>
      </ha-card>`;
    }
    const ctx = this._context(overview);
    if (this._tab === "calendar") this._ensureCalendar(this._calYear, this._calMonth);
    const targetKey = dateKey(addDays(overview.tonight, this._targetOffset));
    if (this._tab === "targets") this._ensureTargets(targetKey);

    return html`<ha-card>
      ${config.title ? html`<div class="header"><div class="title">${config.title}</div></div>` : nothing}
      ${config.tabs.length > 1
        ? html`<div class="tabs" role="tablist">
        ${TABS.filter((t) => config.tabs.includes(t.id)).map(
          (t) => html`<button
            class="tab ${this._tab === t.id ? "active" : ""}"
            role="tab"
            aria-selected=${this._tab === t.id}
            @click=${() => (this._tab = t.id)}
          >
            ${t.label}
          </button>`,
        )}
      </div>`
        : nothing}
      ${this._error ? html`<div class="warn small" style="margin-bottom:8px">${this._error}</div>` : nothing}
      ${this._tab === "ranking"
        ? renderRanking(ctx, {
            selectedNight: this._selectedNight,
            days: this._config.forecast_days,
            sort: this._sort,
            onSort: (s) => (this._sort = s),
            onSelectNight: (i) => (this._selectedNight = i),
            onOpenChart: (entity) => this._openChart(entity),
          })
        : this._tab === "chart"
          ? renderSkyChart(ctx, {
              selectedEntity: this._chartEntity || ctx.sites[0]?.entity || "",
              onSelectSite: (e) => (this._chartEntity = e),
            })
          : this._tab === "targets"
            ? renderTargets(ctx, {
                offset: this._targetOffset,
                group: this._targetGroup,
                sort: this._targetSort,
                framingOnly: this._framingOnly,
                showAll: this._showAll,
                data: this._targets.get(targetKey),
                showers: this._showers,
                onNavigate: (d) => (this._targetOffset = Math.max(0, this._targetOffset + d)),
                onToday: () => (this._targetOffset = 0),
                onGroup: (g) => ((this._targetGroup = g), (this._showAll = false)),
                onSort: (v) => (this._targetSort = v),
                onFramingOnly: (on) => (this._framingOnly = on),
                onShowAll: () => (this._showAll = true),
              })
          : renderCalendar(ctx, {
              year: this._calYear,
              month: this._calMonth,
              onNavigate: (d) => this._navigate(d),
              onToday: () => {
                const t = ctx.tonight;
                this._calYear = t.y;
                this._calMonth = t.m;
              },
              onOpenChart: (entity) => this._openChart(entity),
            })}
    </ha-card>`;
  }

  private _openChart(entity: string): void {
    this._chartEntity = entity;
    if (this._config?.tabs.includes("chart")) this._tab = "chart";
  }

  private _navigate(delta: number): void {
    const d = new Date(Date.UTC(this._calYear, this._calMonth - 1 + delta, 1));
    this._calYear = d.getUTCFullYear();
    this._calMonth = d.getUTCMonth() + 1;
  }
}

if (!customElements.get("astro-planner-card")) {
  customElements.define("astro-planner-card", AstroPlannerCard);
}

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean; documentationURL?: string }[];
  }
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "astro-planner-card",
  name: "Astro Planner",
  description: "Rank dark-sky sites, chart hourly sky conditions, plan Milky Way nights and see which Messier objects are up, from the Astro Planner integration.",
  preview: false,
});
