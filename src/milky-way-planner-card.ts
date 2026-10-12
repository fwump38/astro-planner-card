import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { computeNight, type NightSummary, type SkyOptions } from "./astro/night";
import { distanceKm, domeGeometry } from "./astro/light-domes";
import { addDays, type CivilDate, civilDateIn, dateKey, makeDayFormatter, makeHourFormatter, makeTimeFormatter } from "./astro/time";
import { resolveConfig } from "./data/defaults";
import { EMPTY_FORECAST, type HourlyForecast, subscribeForecasts } from "./data/forecast";
import { type DriveEstimate, getDriveTime } from "./data/drive-time";
import { findAstroWeatherEntities, homeObserver, resolveSite } from "./data/sites";
import { scoreNight, type NightScore } from "./scoring/score";
import { cardStyles } from "./styles";
import type { CardConfig, HomeAssistant, Observer, ResolvedConfig, Site, TabId } from "./types";
import { renderCalendar } from "./views/calendar-view";
import type { ViewContext } from "./views/context";
import { renderRanking } from "./views/ranking-view";
import { renderSkyChart } from "./views/sky-chart-view";
import "./editor/card-editor";

declare const __CARD_VERSION__: string;
console.info(
  `%c MILKY-WAY-PLANNER-CARD %c v${__CARD_VERSION__} `,
  "color:#fff;background:#3a2a6e;font-weight:700",
  "color:#3a2a6e;background:#e8d9ff",
);

const REFERENCE_ENTITY = "__reference__";

const driveKey = (from: Observer, to: Observer) => `${from.latitude},${from.longitude}>${to.latitude},${to.longitude}`;

/** A neutral stand-in at the centre of the sites (or home when none), used by views that aren't about one site. */
function referenceSite(sites: Site[], home: Observer): Site {
  const located = sites.filter((s) => s.observer);
  const observer: Observer = located.length
    ? {
        latitude: located.reduce((a, s) => a + s.observer!.latitude, 0) / located.length,
        longitude: located.reduce((a, s) => a + s.observer!.longitude, 0) / located.length,
        elevation: located.reduce((a, s) => a + (s.observer!.elevation ?? 0), 0) / located.length,
      }
    : home;
  return { entity: REFERENCE_ENTITY, name: "centre of your sites", bortle: 2, observer };
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "ranking", label: "Tonight", icon: "mdi:format-list-numbered" },
  { id: "chart", label: "Sky chart", icon: "mdi:chart-timeline" },
  { id: "calendar", label: "Calendar", icon: "mdi:calendar-month" },
];

export class MilkyWayPlannerCard extends LitElement {
  static styles = [cardStyles, css``];

  static getConfigElement(): HTMLElement {
    return document.createElement("milky-way-planner-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Partial<CardConfig> {
    return { sites: findAstroWeatherEntities(hass).map((entity) => ({ entity })) };
  }

  @state() private _tab: TabId = "ranking";
  @state() private _selectedNight = 0;
  @state() private _chartEntity = "";
  @state() private _calYear = 0;
  @state() private _calMonth = 0;

  private _config?: ResolvedConfig;
  private _hass?: HomeAssistant;
  private _forecasts = new Map<string, HourlyForecast>();
  private _unsubscribe?: () => void;
  private _subscribedKey = "";
  private _nightCache = new Map<string, NightSummary>();
  private _scoreCache = new Map<string, NightScore>();
  private _domeCache = new Map<string, ReturnType<typeof domeGeometry>>();
  private _hassSignature = "";
  private _driveTimes = new Map<string, DriveEstimate>();
  private _drivePending = new Set<string>();
  private _driveQueue: Promise<void> = Promise.resolve();

  setConfig(config: CardConfig): void {
    if (!config || !Array.isArray(config.sites)) {
      throw new Error("milky-way-planner-card: `sites` must be a list of AstroWeather weather entities");
    }
    this._config = resolveConfig(config);
    this._tab = this._config.default_tab;
    this._nightCache.clear();
    this._scoreCache.clear();
    this._domeCache.clear();
    this._subscribedKey = "";
    this._ensureSubscriptions();
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    // Re-render only when something we display changed (HA pushes `hass` on every state change).
    const sig = (this._config?.sites ?? [])
      .map((s) => `${s.entity}:${hass.states[s.entity]?.last_updated ?? ""}`)
      .join("|") + `${hass.config.latitude},${hass.config.longitude},${hass.config.time_zone}`;
    if (first || sig !== this._hassSignature) {
      this._hassSignature = sig;
      this._scoreCache.clear();
      this.requestUpdate();
    }
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
    this._ensureSubscriptions();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._subscribedKey = "";
  }

  private _ensureSubscriptions(): void {
    const hass = this._hass;
    const cfg = this._config;
    if (!hass || !cfg || !this.isConnected) return;
    const entities = [...new Set(cfg.sites.map((s) => s.entity).filter((e) => hass.states[e]))];
    const key = entities.join(",");
    if (key === this._subscribedKey) return;
    this._subscribedKey = key;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (entities.length === 0) return;
    subscribeForecasts(hass, entities, (entity, forecast) => {
      this._forecasts.set(entity, forecast);
      this._scoreCache.clear();
      this.requestUpdate();
    }).then((unsub) => {
      // If the subscription set changed while we were connecting, drop this one.
      if (this._subscribedKey !== key) unsub();
      else this._unsubscribe = unsub;
    });
  }

  protected willUpdate(changed: PropertyValues): void {
    if (this._calYear === 0 && this._hass && this._config) {
      const t = this._tonight();
      this._calYear = t.y;
      this._calMonth = t.m;
    }
    super.willUpdate(changed);
  }

  private _tonight(): CivilDate {
    const hass = this._hass!;
    const tz = hass.config.time_zone;
    const now = new Date();
    const today = civilDateIn(now, tz);
    // Before ~6am the night that matters began yesterday evening.
    return this._localHour(now) < 6 ? addDays(today, -1) : today;
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

  private _context(): ViewContext {
    const hass = this._hass!;
    const config = this._config!;
    const tz = hass.config.time_zone;
    const lang = hass.locale?.language ?? hass.language ?? "en";
    const fmt = hass.locale?.time_format;
    const home = homeObserver(hass);
    const sites: Site[] = config.sites
      .filter((s) => hass.states[s.entity])
      .map((cfg) => {
        const site = resolveSite(hass, cfg);
        if (cfg.drive_minutes === undefined && config.auto_drive_time && site.observer) {
          const est = this._driveTimes.get(driveKey(home, site.observer));
          if (est && est.minutes >= 5) {
            site.drive_minutes = est.minutes;
            site.drive_estimated = true;
          } else if (!est) this._requestDriveTime(home, site.observer);
        }
        return site;
      });
    const reference = referenceSite(sites, home);

    const skyOptions = (site: Site): SkyOptions => ({
      // The calendar answers "which nights", measured like Capture the Atlas (core above the horizon); the ranking uses your usable altitude.
      minGcAltitude: site.entity === REFERENCE_ENTITY ? config.calendar_min_altitude : config.min_gc_altitude,
      maxMoonIllumination: config.max_moon_illumination,
      bortle: site.bortle,
      domes: this._domes(site, config),
      domeSigma: config.dome_sigma,
    });
    const optsKey = (site: Site) =>
      `${site.entity}|${site.observer?.latitude},${site.observer?.longitude}|${site.bortle}|${site.entity === REFERENCE_ENTITY ? config.calendar_min_altitude : config.min_gc_altitude}|${config.max_moon_illumination}|${config.dome_sigma}|${config.light_domes.length}`;

    const night = (site: Site, date: CivilDate): NightSummary | null => {
      if (!site.observer) return null;
      const key = `${optsKey(site)}|${dateKey(date)}`;
      let n = this._nightCache.get(key);
      if (!n) {
        n = computeNight(date, site.observer, skyOptions(site));
        if (this._nightCache.size > 600) this._nightCache.clear();
        this._nightCache.set(key, n);
      }
      return n;
    };
    const forecast = (entity: string) => this._forecasts.get(entity) ?? EMPTY_FORECAST;

    return {
      hass,
      config,
      sites,
      reference,
      tonight: this._tonight(),
      forecast,
      skyOptions,
      night,
      score: (site, date) => {
        const n = night(site, date);
        if (!n) return null;
        const key = `${optsKey(site)}|${dateKey(date)}`;
        let s = this._scoreCache.get(key);
        if (!s) {
          s = scoreNight(site, n, forecast(site.entity), config.weights, config.dome_warning_threshold);
          this._scoreCache.set(key, s);
        }
        return s;
      },
      fmtTime: makeTimeFormatter(tz, lang, fmt),
      fmtHour: makeHourFormatter(tz, lang, fmt),
      fmtDay: makeDayFormatter(tz, lang),
      localHour: this._localHour,
    };
  }

  private _domes(site: Site, config: ResolvedConfig) {
    if (!site.observer || site.entity === REFERENCE_ENTITY) return [];
    const key = `${site.observer.latitude},${site.observer.longitude}|${JSON.stringify(config.light_domes)}`;
    let g = this._domeCache.get(key);
    if (!g) {
      g = domeGeometry(site.observer, config.light_domes);
      this._domeCache.set(key, g);
    }
    return g;
  }

  protected render(): TemplateResult {
    if (!this._config || !this._hass) return html``;
    const config = this._config;
    if (config.sites.length === 0) {
      return html`<ha-card>
        <div class="empty">
          Add one or more AstroWeather <code>weather.*</code> entities as sites in the card editor.
        </div>
      </ha-card>`;
    }
    const ctx = this._context();
    const missing = config.sites.filter((s) => !this._hass!.states[s.entity]).map((s) => s.entity);

    return html`<ha-card>
      ${config.title ? html`<div class="header"><div class="title">${config.title}</div></div>` : nothing}
      <div class="tabs" role="tablist">
        ${TABS.map(
          (t) => html`<button
            class="tab ${this._tab === t.id ? "active" : ""}"
            role="tab"
            aria-selected=${this._tab === t.id}
            @click=${() => (this._tab = t.id)}
          >
            ${t.label}
          </button>`,
        )}
      </div>
      ${missing.length
        ? html`<div class="warn small" style="margin-bottom:8px">Entity not found: ${missing.join(", ")}</div>`
        : nothing}
      ${this._tab === "ranking"
        ? renderRanking(ctx, {
            selectedNight: this._selectedNight,
            onSelectNight: (i) => (this._selectedNight = i),
            onOpenChart: (entity) => this._openChart(entity),
          })
        : this._tab === "chart"
          ? renderSkyChart(ctx, {
              selectedEntity: this._chartEntity || ctx.sites[0]?.entity || "",
              onSelectSite: (e) => (this._chartEntity = e),
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

  /** Drive times are looked up one at a time (the public routing server asks for modest use) and cached in the browser. */
  private _requestDriveTime(home: Observer, to: Observer): void {
    const key = driveKey(home, to);
    if (this._drivePending.has(key) || distanceKm(home, to) < 1) return;
    this._drivePending.add(key);
    this._driveQueue = this._driveQueue.then(async () => {
      this._driveTimes.set(key, await getDriveTime(home, to));
      this._drivePending.delete(key);
      this.requestUpdate();
    });
  }

  private _openChart(entity: string): void {
    this._chartEntity = entity;
    this._tab = "chart";
  }

  private _navigate(delta: number): void {
    const d = new Date(Date.UTC(this._calYear, this._calMonth - 1 + delta, 1));
    this._calYear = d.getUTCFullYear();
    this._calMonth = d.getUTCMonth() + 1;
  }
}

if (!customElements.get("milky-way-planner-card")) {
  customElements.define("milky-way-planner-card", MilkyWayPlannerCard);
}

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean; documentationURL?: string }[];
  }
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "milky-way-planner-card",
  name: "Milky Way Planner",
  description: "Rank dark-sky sites, chart hourly sky conditions and plan Milky Way core nights using AstroWeather.",
  preview: false,
});
