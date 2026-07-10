const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function icon(children) {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'icon-svg',
  });
  children.forEach((child) => svg.appendChild(child));
  return svg;
}

// Every icon is built from simple primitives (circle/line/rect/path) so
// they stay easy to read and tweak, rather than hand-tuned bezier paths.
export const icons = {
  search: () => icon([svgEl('circle', { cx: 10, cy: 10, r: 6.5 }), svgEl('line', { x1: 15, y1: 15, x2: 20.5, y2: 20.5 })]),

  plus: () => icon([svgEl('line', { x1: 12, y1: 5, x2: 12, y2: 19 }), svgEl('line', { x1: 5, y1: 12, x2: 19, y2: 12 })]),

  honeyJar: () =>
    icon([
      svgEl('path', { d: 'M6 9h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z' }),
      svgEl('path', { d: 'M8 9V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3' }),
      svgEl('line', { x1: 6, y1: 13, x2: 18, y2: 13 }),
      svgEl('line', { x1: 6, y1: 17, x2: 18, y2: 17 }),
    ]),

  check: () => icon([svgEl('polyline', { points: '4,13 9,18 20,6' })]),

  history: () =>
    icon([
      svgEl('circle', { cx: 12, cy: 13, r: 8 }),
      svgEl('polyline', { points: '12,9 12,13 15,15' }),
      svgEl('path', { d: 'M5 5l1.5 2.5' }),
    ]),

  idCard: () =>
    icon([
      svgEl('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }),
      svgEl('circle', { cx: 8, cy: 11, r: 2 }),
      svgEl('line', { x1: 6, y1: 16, x2: 10, y2: 16 }),
      svgEl('line', { x1: 14, y1: 9, x2: 18, y2: 9 }),
      svgEl('line', { x1: 14, y1: 13, x2: 18, y2: 13 }),
    ]),

  home: () =>
    icon([
      svgEl('path', { d: 'M4 11.5 12 4l8 7.5' }),
      svgEl('path', { d: 'M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9' }),
    ]),

  person: () => icon([svgEl('circle', { cx: 12, cy: 8, r: 4 }), svgEl('path', { d: 'M4 20c0-4 4-6 8-6s8 2 8 6' })]),

  download: () =>
    icon([
      svgEl('path', { d: 'M12 4v11' }),
      svgEl('polyline', { points: '7,10 12,15 17,10' }),
      svgEl('line', { x1: 5, y1: 20, x2: 19, y2: 20 }),
    ]),

  back: () => icon([svgEl('polyline', { points: '15,5 8,12 15,19' })]),

  logout: () =>
    icon([
      svgEl('path', { d: 'M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3' }),
      svgEl('line', { x1: 20, y1: 12, x2: 9, y2: 12 }),
      svgEl('polyline', { points: '16,7 21,12 16,17' }),
    ]),

  edit: () =>
    icon([
      svgEl('path', { d: 'M4 20h4l11-11-4-4L4 16z' }),
      svgEl('line', { x1: 13.5, y1: 6.5, x2: 17.5, y2: 10.5 }),
    ]),

  bell: () =>
    icon([
      svgEl('path', { d: 'M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z' }),
      svgEl('path', { d: 'M10 20a2 2 0 0 0 4 0' }),
    ]),
};

export function iconEl(name) {
  const factory = icons[name];
  if (!factory) throw new Error('Unknown icon: ' + name);
  return factory();
}
