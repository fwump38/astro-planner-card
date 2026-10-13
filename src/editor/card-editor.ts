import { html, LitElement, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { resolveConfig } from "../data/defaults";
import { editorStyles } from "../styles";
import type { CardConfig, HomeAssistant } from "../types";

const TAB_OPTIONS = [
  { value: "ranking", label: "Tonight / ranking" },
  { value: "chart", label: "Sky chart" },
  { value: "calendar", label: "Calendar" },
];

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "tabs", selector: { select: { multiple: true, mode: "list", options: TAB_OPTIONS } } },
  {
    type: "grid",
    name: "",
    schema: [
      {
        name: "default_sort",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "score", label: "Score" },
              { value: "distance", label: "Distance (drive time)" },
              { value: "bortle", label: "Bortle (darkest first)" },
            ],
          },
        },
      },
      { name: "default_tab", selector: { select: { mode: "dropdown", options: TAB_OPTIONS } } },
    ],
  },
  { name: "forecast_days", selector: { number: { min: 1, max: 14, step: 1, mode: "box" } } },
  { name: "calendar_highlight", selector: { boolean: {} } },
  { name: "sites", selector: { entity: { multiple: true, domain: "weather", integration: "astroweather" } } },
];

const LABELS: Record<string, string> = {
  title: "Title (optional)",
  tabs: "Tabs to show",
  default_tab: "Starting tab",
  default_sort: "Tonight: sort sites by",
  forecast_days: "Tonight: days to show (tonight counts as 1)",
  calendar_highlight: "Colour calendar days pink / blue / dark by core window",
  sites: "Only show these sites (leave empty to show all)",
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
      tabs: r.tabs,
      default_tab: r.default_tab,
      default_sort: r.default_sort,
      forecast_days: r.forecast_days,
      calendar_highlight: r.calendar_highlight,
      sites: r.site_filter,
    };
  }

  private _onForm(e: CustomEvent): void {
    e.stopPropagation();
    const next: CardConfig = { ...this._config!, ...(e.detail.value as Partial<CardConfig>) };
    if (!next.title) delete next.title;
    if (!next.sites?.length) delete next.sites;
    this._fire(next);
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._formData()}
        .schema=${SCHEMA}
        .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
        @value-changed=${this._onForm}
      ></ha-form>
      <div class="hint">
        Sites, Bortle classes, drive times, light domes, score weights and sky thresholds are set in the Milky Way Planner integration
        (Settings → Devices &amp; services → Milky Way Planner → Configure).
      </div>
    `;
  }
}

if (!customElements.get("milky-way-planner-card-editor")) customElements.define("milky-way-planner-card-editor", MilkyWayPlannerCardEditor);
