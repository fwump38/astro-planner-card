import { css } from "lit";

export const cardStyles = css`
  :host {
    --csc-fg: var(--primary-text-color, #212121);
    --csc-muted: var(--secondary-text-color, #727272);
    --csc-border: var(--divider-color, rgba(127, 127, 127, 0.3));
    --csc-accent: var(--primary-color, #03a9f4);
    --col-w: 22px;
  }
  ha-card {
    padding: 12px;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 1.15em;
    font-weight: 500;
    flex: 1;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--csc-border);
    margin-bottom: 12px;
  }
  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--csc-muted);
    cursor: pointer;
    font: inherit;
    padding: 8px 12px;
  }
  .tab.active {
    border-bottom-color: var(--csc-accent);
    color: var(--csc-fg);
    font-weight: 500;
  }
  .muted {
    color: var(--csc-muted);
  }
  .small {
    font-size: 0.8em;
  }
  .empty {
    color: var(--csc-muted);
    padding: 24px 8px;
    text-align: center;
  }
  .legend {
    color: var(--csc-muted);
    font-size: 0.78em;
    margin-top: 10px;
    line-height: 1.4;
  }
  .warn {
    color: var(--warning-color, #ffa600);
  }
  select.site-select {
    background: var(--card-background-color, #fff);
    border: 1px solid var(--csc-border);
    border-radius: 6px;
    color: var(--csc-fg);
    font: inherit;
    padding: 4px 8px;
  }
  button {
    font: inherit;
    color: inherit;
  }
  .score-pill {
    border-radius: 10px;
    color: #fff;
    display: inline-block;
    font-size: 0.85em;
    font-weight: 600;
    min-width: 28px;
    padding: 1px 7px;
    text-align: center;
  }
  .astro-only {
    font-style: italic;
  }
  .astro-only .score-pill {
    opacity: 0.6;
  }
  ha-icon {
    --mdc-icon-size: 14px;
    vertical-align: -2px;
  }
  .dome-warn {
    color: #ff8c00;
  }

  /* Ranking */
  .summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin-bottom: 10px;
  }
  .core-window {
    color: var(--csc-muted);
    font-size: 0.9em;
  }
  .ranking {
    display: grid;
    gap: 4px;
    grid-template-columns: minmax(110px, 1.3fr) repeat(var(--nights), minmax(96px, 1fr));
    overflow-x: auto;
  }
  .rk-head {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--csc-muted);
    font-size: 0.85em;
    padding: 4px;
    text-align: left;
  }
  button.rk-night {
    cursor: pointer;
  }
  .rk-night.selected {
    border-bottom-color: var(--csc-accent);
    color: var(--csc-fg);
    font-weight: 500;
  }
  .rk-cell {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    display: flex;
    gap: 6px;
    min-height: 44px;
    padding: 4px 6px;
  }
  button.rk-score {
    background: rgba(127, 127, 127, 0.08);
    cursor: pointer;
    text-align: left;
  }
  button.rk-score:hover {
    border-color: var(--csc-accent);
  }
  .rk-site {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0;
  }
  .site-name {
    font-weight: 500;
  }
  .site-meta {
    color: var(--csc-muted);
    font-size: 0.78em;
  }
  .cell-lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .cell-line {
    font-size: 0.85em;
    white-space: nowrap;
  }
  .cell-line.small {
    color: var(--csc-muted);
    font-size: 0.75em;
  }
  .tilt {
    vertical-align: -2px;
  }

  /* Sky chart */
  .chart-head {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .chart-scroll {
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .chart {
    display: grid;
    gap: 2px 6px;
    grid-template-columns: 82px calc(var(--cols) * var(--col-w));
    width: max-content;
  }
  .ch-label {
    align-self: center;
    color: var(--csc-muted);
    font-size: 0.75em;
    position: sticky;
    left: 0;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    z-index: 1;
  }
  .ch-days,
  .ch-hours,
  .ch-row {
    display: grid;
  }
  .ch-day {
    border-left: 1px solid var(--csc-border);
    font-size: 0.75em;
    overflow: hidden;
    padding-left: 4px;
    white-space: nowrap;
  }
  .ch-hour {
    font-size: 0.65em;
    text-align: center;
  }
  .ch-hour.night {
    color: var(--csc-fg);
    font-weight: 600;
  }
  .ch-hour.day {
    color: var(--csc-muted);
  }
  .ch-cell {
    color: #fff;
    font-size: 0.6em;
    height: 18px;
    line-height: 18px;
    outline: 1px solid rgba(127, 127, 127, 0.15);
    outline-offset: -1px;
    text-align: center;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
  }
  .ch-cell.empty-cell {
    background: repeating-linear-gradient(45deg, transparent 0 4px, rgba(127, 127, 127, 0.12) 4px 5px);
  }

  /* Calendar */
  .cal-head {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .cal-title {
    font-weight: 500;
    min-width: 130px;
    text-align: center;
  }
  .cal-head select {
    margin-left: auto;
  }
  .icon-btn,
  .text-btn {
    background: none;
    border: 1px solid var(--csc-border);
    border-radius: 6px;
    cursor: pointer;
    padding: 2px 6px;
  }
  .icon-btn ha-icon {
    --mdc-icon-size: 20px;
  }
  .cal-grid {
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .cal-dow {
    color: var(--csc-muted);
    font-size: 0.72em;
    text-align: center;
  }
  .cal-day {
    background: rgba(127, 127, 127, 0.07);
    border: 1px solid transparent;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 92px;
    padding: 3px 4px;
  }
  .cal-day.blank {
    background: none;
  }
  .cal-day.no-core {
    opacity: 0.55;
  }
  .cal-day.new-moon {
    border-color: rgba(181, 140, 242, 0.55);
  }
  .cal-day.today {
    outline: 2px solid var(--csc-accent);
    outline-offset: -1px;
  }
  .cal-top {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }
  .cal-num {
    font-size: 0.8em;
    font-weight: 600;
  }
  .cal-bar {
    background: #0b1020;
    border-radius: 3px;
    height: 8px;
    overflow: hidden;
    position: relative;
  }
  .cal-core,
  .cal-moonup {
    bottom: 0;
    position: absolute;
    top: 0;
  }
  .cal-core {
    background: #b58cf2;
  }
  .cal-moonup {
    background: rgba(242, 236, 208, 0.45);
    height: 3px;
    top: auto;
  }
  .cal-text {
    font-size: 0.7em;
    line-height: 1.25;
  }
  .cal-text.small {
    font-size: 0.62em;
  }
  .cal-badge {
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: auto;
    padding: 0;
    text-align: left;
  }
  .cal-badge .score-pill {
    font-size: 0.7em;
    min-width: 22px;
    padding: 0 5px;
  }
  @media (max-width: 600px) {
    .cal-day {
      min-height: 78px;
    }
    .cal-text.small {
      display: none;
    }
  }
`;

export const editorStyles = css`
  :host {
    display: block;
  }
  .section {
    margin-bottom: 20px;
  }
  .section h3 {
    font-size: 1em;
    font-weight: 500;
    margin: 0 0 8px;
  }
  .row {
    align-items: flex-start;
    border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
    border-radius: 8px;
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px;
  }
  .row .fields {
    flex: 1;
    min-width: 0;
  }
  .row .actions {
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hint {
    color: var(--secondary-text-color, #727272);
    font-size: 0.85em;
    margin: 4px 0 8px;
  }
  .error {
    color: var(--error-color, #db4437);
    font-size: 0.85em;
  }
  mwc-button,
  ha-button {
    --mdc-theme-primary: var(--primary-color);
  }
`;
