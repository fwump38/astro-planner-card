import { html, LitElement, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { fetchNearbyDomes, mergeDomes } from "../data/nearby-cities";
import { homeObserver, resolveSite } from "../data/sites";
import { editorStyles } from "../styles";
import type { HomeAssistant, LightDome, Observer, SiteConfig } from "../types";

const SCHEMA = [
  {
    type: "grid",
    name: "",
    schema: [
      { name: "name", required: true, selector: { text: {} } },
      { name: "population", required: true, selector: { number: { min: 0, max: 30000000, step: 1000, mode: "box" } } },
    ],
  },
  { name: "location", required: true, selector: { location: { radius: false } } },
];

const LABELS: Record<string, string> = { name: "City / town", population: "Population", location: "Location" };

interface Row {
  name: string;
  population: number;
  location: { latitude: number; longitude: number };
}

export class LightDomesEditor extends LitElement {
  static styles = editorStyles;

  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) domes: LightDome[] = [];
  @property({ attribute: false }) sites: SiteConfig[] = [];
  @property({ type: Number }) radiusKm = 250;

  @state() private _busy = false;
  @state() private _status = "";
  @state() private _error = "";

  private _emit(domes: LightDome[]): void {
    this.dispatchEvent(new CustomEvent("domes-changed", { detail: { domes }, bubbles: true, composed: true }));
  }

  private _toRow(d: LightDome): Row {
    return { name: d.name, population: d.population, location: { latitude: d.latitude, longitude: d.longitude } };
  }

  private _update(i: number, row: Row): void {
    const next = this.domes.slice();
    next[i] = {
      name: row.name ?? "",
      population: Number(row.population) || 0,
      latitude: row.location?.latitude ?? next[i].latitude,
      longitude: row.location?.longitude ?? next[i].longitude,
    };
    this._emit(next);
  }

  private async _find(): Promise<void> {
    if (!this.hass) return;
    this._busy = true;
    this._error = "";
    this._status = "";
    try {
      const points: Observer[] = [homeObserver(this.hass)];
      for (const s of this.sites) {
        const o = resolveSite(this.hass, s).observer;
        if (o) points.push(o);
      }
      const found = await fetchNearbyDomes(points, this.radiusKm);
      const merged = mergeDomes(this.domes, found);
      this._status = `Found ${found.length} places within ${this.radiusKm} km; ${merged.length - this.domes.length} added.`;
      this._emit(merged);
    } catch (err) {
      this._error = `Couldn't look up nearby cities (${(err as Error).message}). You can add them manually.`;
    } finally {
      this._busy = false;
    }
  }

  protected render(): TemplateResult {
    return html`
      <div class="section">
        <h3>Light domes</h3>
        <div class="hint">
          Cities whose glow can wash out the part of the sky you're pointing at. “Find nearby cities” looks up populated places around your
          Home Assistant location and your sites using OpenStreetMap (one request; results are saved in this card's config).
        </div>
        <div class="toolbar" style="margin-bottom:8px">
          <ha-button ?disabled=${this._busy} @click=${this._find}>${this._busy ? "Searching…" : "Find nearby cities"}</ha-button>
          <span class="hint" style="margin:0">within ${this.radiusKm} km</span>
        </div>
        ${this._status ? html`<div class="hint">${this._status}</div>` : nothing}
        ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
        ${this.domes.map(
          (dome, i) => html`<div class="row">
            <div class="fields">
              <ha-form
                .hass=${this.hass}
                .data=${this._toRow(dome)}
                .schema=${SCHEMA}
                .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
                @value-changed=${(e: CustomEvent) => {
                  e.stopPropagation();
                  this._update(i, e.detail.value as Row);
                }}
              ></ha-form>
            </div>
            <div class="actions">
              <ha-icon-button .label=${"Remove"} @click=${() => this._emit(this.domes.filter((_, k) => k !== i))}
                ><ha-icon icon="mdi:delete-outline"></ha-icon
              ></ha-icon-button>
            </div>
          </div>`,
        )}
        <div class="toolbar">
          <ha-button
            @click=${() =>
              this._emit([
                ...this.domes,
                {
                  name: "",
                  population: 50000,
                  latitude: this.hass?.config.latitude ?? 0,
                  longitude: this.hass?.config.longitude ?? 0,
                },
              ])}
            >Add city</ha-button
          >
        </div>
      </div>
    `;
  }
}

if (!customElements.get("milky-way-planner-domes-editor")) customElements.define("milky-way-planner-domes-editor", LightDomesEditor);
