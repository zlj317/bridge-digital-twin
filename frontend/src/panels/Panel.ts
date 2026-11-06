import { format, rollNumber } from '../ui/NumberRoller';

export type PanelVariant = 'icon' | 'list' | 'file' | 'dot' | 'check';

export interface MetricRow {
  label: string;
  value: number | string;
  unit?: string;
  decimals?: number;
  color?: string;
  icon?: keyof typeof ICONS;
  onClick?: () => void;
}

export interface PanelConfig {
  title: string;
  variant: PanelVariant;
  rows: MetricRow[];
  icon?: keyof typeof ICONS;
  blueprint?: boolean;
  extraBody?: string;
  className?: string;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  health: svg('<path d="M2 12h4l2-6 4 12 2-6h8"/>'),
  stress: svg('<path d="M4 18V6m4 12V9m4 9V4m4 14v-7m4 7V8"/>'),
  cable: svg('<path d="M4 4l8 16 8-16M8 4h8M6 12h12"/>'),
  deflection: svg('<path d="M3 8c6 8 12 8 18 0M3 8h18"/>'),
  temp: svg('<path d="M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z"/>'),
  wind: svg('<path d="M3 8h12a3 3 0 10-3-3M3 12h17a2 2 0 11-2 2M3 16h9"/>'),
  traffic: svg('<path d="M3 16h18M5 16V9l2-4h10l2 4v7M7 16v2m10-2v2M8 12h8"/>'),
  speed: svg('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/>'),
  lane: svg('<path d="M4 4v16M20 4v16M12 3v3m0 4v4m0 4v3"/>'),
  event: svg('<path d="M12 3l10 18H2zM12 9v5m0 3v.5"/>'),
  tool: svg('<path d="M14 6a4 4 0 01-5 5L4 16l4 4 5-5a4 4 0 015-5l-4-4z"/>'),
  archive: svg('<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>'),
  code: svg('<path d="M8 6l-4 6 4 6m8-12l4 6-4 6"/>'),
  type: svg('<path d="M4 18L12 4l8 14M8 12h8"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4m8-4v4"/>'),
  life: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'),
  level: svg('<path d="M12 3l3 6 6 1-4.5 4.5L18 21l-6-3.5L6 21l1.5-6.5L3 10l6-1z"/>'),
  vibration: svg('<path d="M2 12c3-8 5 8 8 0s5 8 8 0"/>'),
  damping: svg('<path d="M4 18c4-12 12-12 16 0M4 18h16"/>'),
  fatigue: svg('<path d="M4 6h16M4 12h10M4 18h6"/>'),
  grade: svg('<path d="M12 3l9 5v8l-9 5-9-5V8z"/><path d="M9 12l2 2 4-4"/>'),
  scan: svg('<path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4M4 12h16"/>'),
  defect: svg('<path d="M12 3l9 16H3zM12 9v4m0 3v.5"/>'),
  area: svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>'),
  warn: svg('<path d="M12 3l10 18H2zM12 9v5m0 3v.5"/>'),
  date: svg('<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 14h3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9v.5"/>'),
} as const;

export interface PanelHandle {
  el: HTMLElement;
  update: (rows: MetricRow[]) => void;
  setTitle: (title: string) => void;
}

/** WEB-002 三种面板样式做成可配置组件，数据驱动，换数据不改结构 */
export function createPanel(cfg: PanelConfig): PanelHandle {
  const el = document.createElement('section');
  el.className = `panel ${cfg.className ?? ''}`;
  if (cfg.blueprint) {
    const bg = document.createElement('div');
    bg.className = 'blueprint-bg';
    el.appendChild(bg);
  }
  const head = document.createElement('div');
  head.className = 'panel__head';
  head.innerHTML = `<span class="panel__icon">${cfg.icon ? ICONS[cfg.icon] : ICONS.info}</span><span class="panel__title">${cfg.title}</span>`;
  el.appendChild(head);

  const body = document.createElement('div');
  body.className = 'panel__body';
  el.appendChild(body);
  const titleEl = head.querySelector('.panel__title') as HTMLElement;

  const render = (rows: MetricRow[]) => {
    const rowClass = {
      icon: 'metric-row--icon', list: 'metric-row--list', file: 'metric-row--file',
      dot: 'metric-row--dot', check: 'metric-row--check',
    }[cfg.variant];
    body.innerHTML = rows.map(r => {
      const iconHtml = cfg.variant === 'icon'
        ? `<div class="icon-circle">${r.icon ? ICONS[r.icon] : ICONS.info}</div>`
        : cfg.variant === 'list' || cfg.variant === 'dot' ? '<span class="dot"></span>'
        : cfg.variant === 'file' ? `<span class="file-icon">${r.icon ? ICONS[r.icon] : ICONS.info}</span>`
        : `<span class="check-icon">${r.icon ? ICONS[r.icon] : ICONS.info}</span>`;
      const valueHtml = typeof r.value === 'number'
        ? `<span class="num ${cfg.variant === 'list' || cfg.variant === 'icon' ? '' : 'num--file'}" data-key="${r.label}" data-raw="0">${format(0, r.decimals ?? 0)}</span>`
        : `<span class="num num--file" data-key="${r.label}">${r.value}</span>`;
      const unitHtml = r.unit ? `<span class="unit ${cfg.variant === 'file' || cfg.variant === 'check' ? 'unit--sm' : ''}">${r.unit}</span>` : '';
      const colorStyle = r.color ? ` style="color:${r.color}"` : '';
      const rowText = cfg.variant === 'file' || cfg.variant === 'check'
        ? `<span class="row__label label label--dim">${r.label}</span>
           <div class="row__value"${colorStyle}>${valueHtml}${unitHtml}</div>`
        : `<div class="row__text">
             <span class="label">${r.label}</span>
             <div class="row__value"${colorStyle}>${valueHtml}${unitHtml}</div>
           </div>`;
      return `<div class="metric-row ${rowClass}" data-label="${r.label}">
        ${iconHtml}${rowText}
      </div>`;
    }).join('') + (cfg.extraBody ?? '');

    rows.forEach(r => {
      if (!r.onClick) return;
      const row = body.querySelector(`[data-label="${r.label}"]`);
      row?.addEventListener('click', r.onClick);
    });
  };

  const update = (rows: MetricRow[]) => {
    if (body.querySelectorAll('.metric-row').length !== rows.length) render(rows);
    rows.forEach(r => {
      const num = body.querySelector(`[data-key="${r.label}"]`);
      if (!(num instanceof HTMLElement)) return;
      if (typeof r.value === 'number') rollNumber(num, r.value, r.decimals ?? 0);
      else if (num.textContent !== String(r.value)) num.textContent = String(r.value);
      if (r.color && num.parentElement) num.parentElement.style.color = r.color;
    });
  };

  render(cfg.rows);
  return {
    el,
    update,
    setTitle: (t: string) => { titleEl.textContent = t; },
  };
}

export function createSectionTitle(no: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.innerHTML = `<span class="section-title__no">${no}</span><span class="section-title__text">${text}</span>`;
  const line = document.createElement('span');
  line.className = 'section-title__line';
  el.appendChild(line);
  return el;
}
