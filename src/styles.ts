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
    display: block;
    padding: 12px;
    overflow: hidden;
    /* The card's own width, not the screen's, decides the layout (dashboards can be narrow on a big screen). */
    container-type: inline-size;
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
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sort-bar {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .chip {
    background: none;
    border: 1px solid var(--csc-border);
    border-radius: 12px;
    color: var(--csc-muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
    padding: 2px 10px;
  }
  .chip.active {
    border-color: var(--csc-accent);
    color: var(--csc-fg);
    font-weight: 500;
  }
  .rk-headrow,
  .rk-row {
    display: grid;
    gap: 6px;
    grid-template-columns: minmax(110px, 1.2fr) minmax(0, 3fr);
  }
  .rk-nights {
    display: grid;
    gap: 4px;
    grid-template-columns: repeat(var(--nights), minmax(0, 1fr));
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
  .rk-site {
    align-self: center;
    min-width: 0;
  }
  .site-name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .site-meta {
    color: var(--csc-muted);
    font-size: 0.78em;
  }
  .rk-cell {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
    min-height: 44px;
    min-width: 0;
    padding: 4px 6px;
    text-align: left;
  }
  button.rk-score {
    align-items: stretch;
    background: rgba(127, 127, 127, 0.08);
    cursor: pointer;
  }
  button.rk-score:hover {
    border-color: var(--csc-accent);
  }
  .cell-night {
    color: var(--csc-muted);
    display: none;
    font-size: 0.72em;
  }
  .cell-main {
    align-items: center;
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .cell-lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .cell-line {
    font-size: 0.85em;
  }
  .cell-time {
    overflow-wrap: anywhere;
  }
  .cell-line.small {
    color: var(--csc-muted);
    font-size: 0.75em;
  }
  .tilt {
    flex: none;
    vertical-align: -2px;
  }

  /* Narrow cards, or many forecast days: each site becomes a block, nights sit side by side beneath its name. */
  @container (max-width: 560px) {
    .rk-headrow {
      grid-template-columns: minmax(0, 1fr);
    }
    .rk-headrow .rk-site {
      display: none;
    }
    .rk-row {
      background: rgba(127, 127, 127, 0.05);
      border-radius: 10px;
      grid-template-columns: minmax(0, 1fr);
      padding: 6px;
    }
    .rk-nights {
      gap: 6px;
      grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    }
    .rk-headrow .rk-nights {
      grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    }
    .cell-night {
      display: block;
    }
    .cell-main {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
    .rk-cell {
      min-height: 0;
    }
  }
  /* More days than fit in a row at any width */
  .ranking.stacked .rk-headrow {
    grid-template-columns: minmax(0, 1fr);
  }
  .ranking.stacked .rk-headrow .rk-site {
    display: none;
  }
  .ranking.stacked .rk-row {
    background: rgba(127, 127, 127, 0.05);
    border-radius: 10px;
    grid-template-columns: minmax(0, 1fr);
    padding: 6px;
  }
  .ranking.stacked .rk-nights {
    gap: 6px;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  }
  .ranking.stacked .rk-headrow .rk-nights {
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  }
  .ranking.stacked .cell-night {
    display: block;
  }
  .ranking.stacked .cell-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .ranking.stacked .rk-cell {
    min-height: 0;
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
  .cal-day.grade-best {
    background: rgba(226, 72, 130, 0.22);
    border-color: rgba(226, 72, 130, 0.55);
  }
  .cal-day.grade-short {
    background: rgba(66, 133, 224, 0.2);
    border-color: rgba(66, 133, 224, 0.45);
  }
  .cal-day.grade-none {
    background: rgba(30, 40, 80, 0.2);
    opacity: 0.7;
  }
  .cal-key {
    align-items: center;
    color: var(--csc-muted);
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78em;
    gap: 4px 6px;
    margin-top: 8px;
  }
  .cal-key .key {
    border-radius: 3px;
    display: inline-block;
    height: 12px;
    margin-left: 8px;
    width: 12px;
  }
  .cal-key .key:first-child {
    margin-left: 0;
  }
  .cal-key .key.best {
    background: rgba(226, 72, 130, 0.7);
  }
  .cal-key .key.short {
    background: rgba(66, 133, 224, 0.7);
  }
  .cal-key .key.none {
    background: rgba(30, 40, 80, 0.55);
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
  .cal-badge-name {
    color: var(--csc-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

export const targetStyles = css`
  .tg-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-bottom: 8px;
  }
  .tg-date {
    font-weight: 500;
    min-width: 8em;
    text-align: center;
  }
  .tg-dark {
    color: var(--csc-muted);
    font-size: 0.85em;
    margin-bottom: 8px;
  }
  .tg-list {
    display: flex;
    flex-direction: column;
  }
  .tg-row {
    align-items: center;
    border-top: 1px solid var(--csc-border);
    display: grid;
    gap: 2px 10px;
    grid-template-columns: 1fr auto;
    padding: 6px 2px;
  }
  .tg-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tg-desig {
    color: var(--csc-accent);
  }
  .tg-meta {
    color: var(--csc-muted);
    font-size: 0.8em;
  }
  .tg-when {
    font-size: 0.85em;
    grid-column: 2;
    grid-row: 1 / span 2;
    text-align: right;
    white-space: nowrap;
  }
  .tg-bar {
    background: var(--csc-border);
    border-radius: 3px;
    height: 4px;
    margin-top: 3px;
    overflow: hidden;
    width: 100%;
  }
  .tg-bar > span {
    background: var(--csc-accent);
    display: block;
    height: 100%;
  }
  .tg-badge {
    border: 1px solid var(--csc-border);
    border-radius: 8px;
    font-size: 0.72em;
    margin-left: 4px;
    padding: 0 5px;
    white-space: nowrap;
  }
  .tg-more {
    color: var(--csc-muted);
    font-size: 0.85em;
    padding: 8px 2px;
  }
  .tg-showers {
    margin-top: 14px;
  }
  .tg-showers h4 {
    font-size: 0.95em;
    font-weight: 500;
    margin: 0 0 4px;
  }
  .sh-row {
    align-items: center;
    border-top: 1px solid var(--csc-border);
    display: grid;
    gap: 2px 10px;
    grid-template-columns: 1fr auto;
    padding: 5px 2px;
  }
  .summary-target {
    color: var(--csc-muted);
    font-size: 0.85em;
    margin-bottom: 8px;
  }
  .cell-target {
    display: inline-block;
    max-width: 11em;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
  }
`;
