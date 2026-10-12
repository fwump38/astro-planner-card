import { html, LitElement, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { findAstroWeatherEntities } from "../data/sites";
import { editorStyles } from "../styles";
import type { HomeAssistant, SiteConfig } from "../types";

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "weather", integration: "astroweather" } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "name", selector: { text: {} } },
      { name: "bortle", selector: { number: { min: 1, max: 9, step: 1, mode: "box" } } },
      { name: "drive_minutes", selector: { number: { min: 0, max: 1440, step: 5, unit_of_measurement: "min", mode: "box" } } },
    ],
  },
];

const LABELS: Record<string, string> = {
  entity: "AstroWeather entity",
  name: "Display name (optional)",
  bortle: "Bortle class (1–9)",
  drive_minutes: "Drive time override (optional)",
};

export class SitesEditor extends LitElement {
  static styles = editorStyles;

  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) sites: SiteConfig[] = [];

  private _emit(sites: SiteConfig[]): void {
    this.dispatchEvent(new CustomEvent("sites-changed", { detail: { sites }, bubbles: true, composed: true }));
  }

  private _update(i: number, value: Record<string, unknown>): void {
    const next = this.sites.slice();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== "" && v !== undefined && v !== null) cleaned[k] = v;
    next[i] = { ...next[i], ...cleaned } as SiteConfig;
    for (const k of ["name", "bortle", "drive_minutes"] as const) if (!(k in cleaned)) delete next[i][k];
    this._emit(next);
  }

  private _move(i: number, delta: number): void {
    const next = this.sites.slice();
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    this._emit(next);
  }

  private _addAll(): void {
    if (!this.hass) return;
    const have = new Set(this.sites.map((s) => s.entity));
    const extra = findAstroWeatherEntities(this.hass)
      .filter((e) => !have.has(e))
      .map((entity) => ({ entity }));
    this._emit([...this.sites, ...extra]);
  }

  protected render(): TemplateResult {
    const available = this.hass ? findAstroWeatherEntities(this.hass) : [];
    const unused = available.filter((e) => !this.sites.some((s) => s.entity === e));
    return html`
      <div class="section">
        <h3>Sites</h3>
        <div class="hint">
          One AstroWeather instance per place you might shoot from — include home as a baseline. Coordinates are read from the AstroWeather instance, and the
          drive time from your Home Assistant location is looked up automatically unless you enter your own.
        </div>
        ${this.sites.map(
          (site, i) => html`<div class="row">
            <div class="fields">
              <ha-form
                .hass=${this.hass}
                .data=${site}
                .schema=${SCHEMA}
                .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
                @value-changed=${(e: CustomEvent) => {
                  e.stopPropagation();
                  this._update(i, e.detail.value);
                }}
              ></ha-form>
            </div>
            <div class="actions">
              <ha-icon-button .label=${"Move up"} ?disabled=${i === 0} @click=${() => this._move(i, -1)}
                ><ha-icon icon="mdi:arrow-up"></ha-icon
              ></ha-icon-button>
              <ha-icon-button .label=${"Move down"} ?disabled=${i === this.sites.length - 1} @click=${() => this._move(i, 1)}
                ><ha-icon icon="mdi:arrow-down"></ha-icon
              ></ha-icon-button>
              <ha-icon-button .label=${"Remove"} @click=${() => this._emit(this.sites.filter((_, k) => k !== i))}
                ><ha-icon icon="mdi:delete-outline"></ha-icon
              ></ha-icon-button>
            </div>
          </div>`,
        )}
        <div class="toolbar">
          <ha-button @click=${() => this._emit([...this.sites, { entity: "" }])}>Add site</ha-button>
          ${unused.length
            ? html`<ha-button @click=${this._addAll}>Add all AstroWeather entities (${unused.length})</ha-button>`
            : nothing}
        </div>
        ${available.length === 0
          ? html`<div class="hint">
              No AstroWeather entities found. Install the AstroWeather integration and add an instance per location first.
            </div>`
          : nothing}
      </div>
    `;
  }
}

if (!customElements.get("milky-way-planner-sites-editor")) customElements.define("milky-way-planner-sites-editor", SitesEditor);
