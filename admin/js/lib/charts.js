import { loadLib } from './loader.js';
import { el, compact } from './ui.js';

/**
 * House style for every chart in the management app, on Chart.js.
 *
 * Colour rules (kept deliberately small):
 *  - one series      -> the brand maroon;
 *  - several entities (products) -> CATEGORICAL, assigned by the entity's
 *    fixed position in Settings, never by rank, so Honey is the same colour
 *    on every chart and a filter never repaints the survivors;
 *  - ordered categories (grades A > B > C) -> one blue hue, dark to light;
 *  - magnitude on the map -> the same blue as a sequential ramp.
 * The categorical and blue values are a validated colour-blind-safe set;
 * three of the light hues are under 3:1 contrast, which is why every chart
 * card has a Table view and a legend - colour is never the only channel.
 *
 * Marks: bars capped at 24px with 4px rounded tops, 2px lines, hairline
 * solid gridlines, one y-axis only (two measures = two charts).
 */

export const BRAND = '#7c2328';
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const OTHER_GREY = '#a8a29e';
export const BLUE_RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const GRID = '#eee5e4';
const INK_MUTED = '#7a6b6b';
const SURFACE = '#ffffff';

/** n ordered steps, darkest first, never lighter than step 250 (stays visible on white). */
export function ordinalColors(n) {
  const usable = BLUE_RAMP.slice(3, 12); // 250..650
  if (n <= 1) return [usable[usable.length - 3]];
  return Array.from({ length: n }, (_, i) => usable[Math.round((usable.length - 1) * (1 - i / (n - 1)))]);
}

/** Colour for entity `id` given the canonical ordered id list; past 8 -> grey "other". */
export function colorFor(id, orderedIds) {
  const i = orderedIds.indexOf(id);
  return i >= 0 && i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER_GREY;
}

const live = new Set();

/** Destroy every chart created since the last call - call at the start of each screen render. */
export function destroyCharts() {
  for (const c of live) c.destroy();
  live.clear();
}

export function destroyChart(chart) {
  if (!chart) return;
  live.delete(chart);
  chart.destroy();
}

function axisFormat(kind) {
  if (kind === 'ugx') return (v) => compact(v);
  if (kind === 'kg') return (v) => compact(v) + ' kg';
  if (kind === 'pct') return (v) => v + '%';
  return (v) => compact(v);
}

export function tooltipValue(kind, v) {
  const n = Number(v) || 0;
  if (kind === 'ugx') return 'UGX ' + Math.round(n).toLocaleString('en-UG');
  if (kind === 'kg') return n.toLocaleString('en-UG', { maximumFractionDigits: 1 }) + ' kg';
  if (kind === 'pct') return n.toFixed(0) + '%';
  return Math.round(n).toLocaleString('en-UG');
}

/**
 * Creates a chart. spec: { type: 'bar'|'line', labels, datasets: [{ label,
 * data, color }], stacked, kind ('kg'|'ugx'|'count'|'pct'), legend }.
 */
export async function renderChart(canvas, spec) {
  const Chart = await loadLib('chart');
  const { type, labels, datasets, stacked = false, kind = 'count', legend = datasets.length > 1, max } = spec;

  const ds = datasets.map((d) =>
    type === 'bar'
      ? {
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          hoverBackgroundColor: d.color,
          maxBarThickness: 24,
          // Rounded data-end, square at the baseline; in a stack only the
          // top segment is rounded, and a 2px white gap separates segments.
          borderRadius: stacked ? 0 : { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          borderColor: SURFACE,
          borderWidth: stacked ? { top: 2 } : 0,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }
      : {
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.color,
          borderWidth: 2,
          pointRadius: labels.length > 24 ? 0 : 4,
          pointHoverRadius: 5,
          pointBorderColor: SURFACE,
          pointBorderWidth: 2,
          tension: 0,
          spanGaps: true,
          borderCapStyle: 'round',
          borderJoinStyle: 'round',
        }
  );

  const chart = new Chart(canvas, {
    type,
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6 } },
      plugins: {
        legend: {
          display: legend,
          position: 'top',
          align: 'start',
          labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, color: '#2b2020', font: { size: 12 }, padding: 14 },
        },
        tooltip: {
          backgroundColor: '#2b2020',
          padding: 10,
          cornerRadius: 8,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: false,
          callbacks: {
            label: (ctx) => ' ' + ctx.dataset.label + ': ' + tooltipValue(kind, ctx.parsed.y),
          },
          filter: (item) => item.parsed.y !== null && !(stacked && item.parsed.y === 0),
        },
      },
      scales: {
        x: {
          stacked,
          grid: { display: false },
          border: { color: GRID },
          ticks: { color: INK_MUTED, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
        },
        y: {
          stacked,
          beginAtZero: true,
          max,
          grid: { color: GRID, lineWidth: 1 },
          border: { display: false },
          ticks: { color: INK_MUTED, font: { size: 11 }, callback: axisFormat(kind), maxTicksLimit: 6 },
        },
      },
    },
  });
  live.add(chart);
  return chart;
}

/**
 * A titled chart card with a Chart / Table toggle. `table()` builds the
 * accessible table view on demand from the same data.
 */
export function chartCard({ title, subtitle, controls = null, height = 260 }) {
  const canvas = el('canvas', { role: 'img', 'aria-label': title });
  const plot = el('div', { class: 'chart-plot', style: 'height:' + height + 'px' }, canvas);
  const tableHost = el('div', { class: 'chart-table', hidden: true });
  const toggle = el('button', { type: 'button', class: 'link-btn chart-toggle' }, 'Table');
  let tableBuilder = null;
  toggle.addEventListener('click', () => {
    const showTable = tableHost.hidden;
    if (showTable && tableBuilder) tableHost.replaceChildren(tableBuilder());
    tableHost.hidden = !showTable;
    plot.hidden = showTable;
    toggle.textContent = showTable ? 'Chart' : 'Table';
  });
  const empty = el('div', { class: 'chart-empty', hidden: true }, 'No data for this period.');
  const node = el('section', { class: 'chart-card' }, [
    el('div', { class: 'chart-head' }, [
      el('div', {}, [el('h3', {}, title), subtitle ? el('p', { class: 'muted' }, subtitle) : null]),
      el('div', { class: 'chart-controls' }, [controls, toggle]),
    ]),
    plot,
    tableHost,
    empty,
  ]);
  return {
    node,
    canvas,
    setTable(fn) {
      tableBuilder = fn;
      if (!tableHost.hidden) tableHost.replaceChildren(fn());
    },
    setEmpty(isEmpty) {
      empty.hidden = !isEmpty;
      plot.style.visibility = isEmpty ? 'hidden' : '';
      plot.style.height = isEmpty ? '0' : height + 'px';
    },
  };
}
