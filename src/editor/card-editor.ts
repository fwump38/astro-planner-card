import { html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { resolveConfig } from "../data/defaults";
import { editorStyles } from "../styles";
import type { CardConfig, HomeAssistant, LightDome, SiteConfig } from "../types";
import "./light-domes-editor";
import "./sites-editor";

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  {
    type: "grid",
    name: "",
    schema: [
      {
        name: "default_tab",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "ranking", label: "Tonight / ranking" },
              { value: "chart", label: "Sky chart" },
              { value: "calendar", label: "Calendar" },
            ],
          },
        },
      },
      { name: "nights", selector: { number: { min: 1, max: 7, step: 1, mode: "box" } } },
      { name: "min_gc_altitude", selector: { number: { min: 0, max: 45, step: 1, unit_of_measurement: "°", mode: "box" } } },
      { name: "max_moon_illumination", selector: { number: { min: 0, max: 100, step: 1, unit_of_measurement: "%", mode: "box" } } },
      { name: "dome_radius_km", selector: { number: { min: 25, max: 600, step: 25, unit_of_measurement: "km", mode: "box" } } },
      { name: "calendar_best_minutes", selector: { number: { min: 15, max: 480, step: 15, unit_of_measurement: "min", mode: "box" } } },
    ],
  },
  { name: "calendar_highlight", selector: { boolean: {} } },
  { name: "auto_drive_time", selector: { boolean: {} } },
  {
    type: "expandable",
    name: "",
    title: "Score weights",
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "weight_cloud", selector: { number: { min: 0, max: 10, step: 0.5, mode: "box" } } },
          { name: "weight_transparency", selector: { number: { min: 0, max: 10, step: 0.5, mode: "box" } } },
          { name: "weight_seeing", selector: { number: { min: 0, max: 10, step: 0.5, mode: "box" } } },
          { name: "weight_calm", selector: { number: { min: 0, max: 10, step: 0.5, mode: "box" } } },
        ],
      },
    ],
  },
];

const LABELS: Record<string, string> = {
  title: "Title (optional)",
  default_tab: "Starting tab",
  nights: "Nights to forecast (1–7)",
  min_gc_altitude: "Minimum core altitude",
  max_moon_illumination: "Max moon illumination when up",
  dome_radius_km: "City search radius",
  calendar_best_minutes: "Calendar “best” = core window of at least",
  calendar_highlight: "Colour calendar days pink / blue / dark by core window",
  auto_drive_time: "Look up drive times from your Home Assistant location",
  weight_cloud: "Cloud weight",
  weight_transparency: "Transparency weight",
  weight_seeing: "Seeing weight",
  weight_calm: "Calm (wind) weight",
};

export class MilkyWayPlannerCardEditor extends LitElement {
  static styles = editorStyles;

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: CardConfig;

  setConfig(config: CardConfig): void {
    this._config = config;
  }

  private _fire(config: CardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  private _formData(): Record<string, unknown> {
    const c = this._config!;
    const r = resolveConfig(c);
    return {
      title: c.title,
      default_tab: r.default_tab,
      nights: r.nights,
      min_gc_altitude: r.min_gc_altitude,
      max_moon_illumination: r.max_moon_illumination,
      dome_radius_km: r.dome_radius_km,
      calendar_best_minutes: r.calendar_best_minutes,
      calendar_highlight: r.calendar_highlight,
      auto_drive_time: r.auto_drive_time,
      weight_cloud: r.weights.cloud,
      weight_transparency: r.weights.transparency,
      weight_seeing: r.weights.seeing,
      weight_calm: r.weights.calm,
    };
  }

  private _onForm(e: CustomEvent): void {
    e.stopPropagation();
    const v = e.detail.value as Record<string, any>;
    const { weight_cloud, weight_transparency, weight_seeing, weight_calm, ...rest } = v;
    const next: CardConfig = { ...this._config!, ...rest };
    if (!next.title) delete next.title;
    next.weights = { cloud: weight_cloud, transparency: weight_transparency, seeing: weight_seeing, calm: weight_calm };
    this._fire(next);
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    const c = this._config;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._formData()}
        .schema=${SCHEMA}
        .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
        @value-changed=${this._onForm}
      ></ha-form>
      <milky-way-planner-sites-editor
        .hass=${this.hass}
        .sites=${c.sites ?? []}
        @sites-changed=${(e: CustomEvent<{ sites: SiteConfig[] }>) => this._fire({ ...c, sites: e.detail.sites })}
      ></milky-way-planner-sites-editor>
      <milky-way-planner-domes-editor
        .hass=${this.hass}
        .sites=${c.sites ?? []}
        .domes=${c.light_domes ?? []}
        .radiusKm=${c.dome_radius_km ?? 250}
        @domes-changed=${(e: CustomEvent<{ domes: LightDome[] }>) => this._fire({ ...c, light_domes: e.detail.domes })}
      ></milky-way-planner-domes-editor>
      <div class="hint">
        Advanced options (YAML only): <code>dome_sigma</code>, <code>dome_warning_threshold</code>, and per-site
        <code>latitude</code>/<code>longitude</code> overrides.
      </div>
    `;
  }
}

if (!customElements.get("milky-way-planner-card-editor")) customElements.define("milky-way-planner-card-editor", MilkyWayPlannerCardEditor);
