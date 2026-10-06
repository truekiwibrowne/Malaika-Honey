import { el, mount, spinner, formatUgx, formatKg, table, segmented, compact, formatNumber } from '../lib/ui.js';
import { fetchAllFarmers, fetchAllPurchases, loadDistrictResolver } from '../lib/data.js';
import { loadLib } from '../lib/loader.js';
import { REGIONS, UNKNOWN_REGION } from '../lib/geo.js';
import { PERIODS, resolvePeriod, inRange, sumPurchases, localIso } from '../lib/stats.js';
import { BLUE_RAMP } from '../lib/charts.js';
import { loadCollection } from '../lib/refdata.js';

const isPoint = (p) => !!p && typeof p.lat === 'number' && typeof p.lng === 'number';
/** Best known position for a farmer: the farm itself, else where they were registered. */
const farmerPoint = (f) => (isPoint(f.farmLocation) ? { ...f.farmLocation, kind: 'farm' } : isPoint(f.registeredLocation) ? { ...f.registeredLocation, kind: 'registered' } : null);

/**
 * Where farmers are: a map of Uganda with every district shaded by the
 * chosen measure and a numbered pin on each district that has farmers,
 * plus region and district tables with the same numbers.
 *
 * Position comes from the farmer's DISTRICT, not GPS, by default: GPS is
 * only captured since v0.9.0 and is frequently missing (indoors, no fix -
 * see docs/Database-Schema.md "Record location"), so a GPS-only map would
 * quietly leave out most farmers. The GPS view is offered separately, with
 * its coverage stated.
 */

let currentMap = null;

const MEASURES = [
  { value: 'farmers', label: 'Farmers' },
  { value: 'kg', label: 'Weight' },
  { value: 'ugx', label: 'Value' },
];

function fmt(measure, v) {
  if (measure === 'kg') return formatKg(v);
  if (measure === 'ugx') return formatUgx(v);
  return formatNumber(v) + ' farmer' + (v === 1 ? '' : 's');
}

function pinLabel(measure, v) {
  return measure === 'farmers' ? formatNumber(v) : compact(v);
}

/** Six sequential classes, light to dark, with "nothing" kept neutral. */
function classBreaks(values) {
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nonZero.length) return [];
  const steps = Math.min(6, new Set(nonZero).size);
  const breaks = [];
  for (let i = 1; i <= steps; i++) breaks.push(nonZero[Math.min(nonZero.length - 1, Math.ceil((i / steps) * nonZero.length) - 1)]);
  return [...new Set(breaks)];
}
const RAMP = [BLUE_RAMP[1], BLUE_RAMP[3], BLUE_RAMP[5], BLUE_RAMP[7], BLUE_RAMP[9], BLUE_RAMP[11]];
function rampColor(v, breaks) {
  if (!(v > 0)) return '#f4f1f0';
  const i = breaks.findIndex((b) => v <= b);
  const idx = i < 0 ? breaks.length - 1 : i;
  // spread the classes in use across the full ramp
  return RAMP[Math.round((idx / Math.max(1, breaks.length - 1)) * (RAMP.length - 1))];
}

export async function renderRegions(root) {
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
  mount(root, spinner('Loading map…'));

  let farmers, purchases, geoCtx, L, crops;
  try {
    [farmers, purchases, geoCtx, L, crops] = await Promise.all([
      fetchAllFarmers(),
      fetchAllPurchases(),
      loadDistrictResolver(),
      loadLib('leaflet'),
      loadCollection('cropsLivestock').then((r) => r.entries).catch(() => []),
    ]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load the map: ' + (err.message || 'unknown error')));
    return;
  }
  const { geo, resolveDistrict } = geoCtx;

  const state = { measure: 'farmers', view: 'districts', period: 'all', activeOnly: false };

  const measureToggle = segmented(MEASURES, state.measure, (v) => { state.measure = v; draw(); }, 'Measure');
  const viewToggle = segmented([{ value: 'districts', label: 'By district' }, { value: 'gps', label: 'GPS locations' }], state.view, (v) => { state.view = v; draw(); }, 'Map view');
  const periodSelect = el('select', { 'aria-label': 'Purchase period' }, PERIODS.filter((p) => p.key !== 'custom').map((p) => el('option', { value: p.key }, p.label)));
  periodSelect.value = state.period;
  periodSelect.addEventListener('change', () => { state.period = periodSelect.value; draw(); });
  const activeBox = el('input', { type: 'checkbox', id: 'active-only' });
  activeBox.addEventListener('change', () => { state.activeOnly = activeBox.checked; draw(); });
  const periodWrap = el('label', { class: 'inline-field' }, [el('span', { class: 'muted' }, 'Purchases:'), periodSelect]);

  const mapEl = el('div', { class: 'map', id: 'region-map' });
  const mapNote = el('p', { class: 'muted map-note' });
  const below = el('div');

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [el('h1', {}, 'Regions & map'), el('p', { class: 'muted' }, 'Where Malaika’s farmers are, by district and region.')]),
    ]),
    el('div', { class: 'filter-bar' }, [
      measureToggle,
      viewToggle,
      periodWrap,
      el('label', { class: 'check', for: 'active-only' }, [activeBox, el('span', {}, 'Active farmers only')]),
    ]),
    el('div', { class: 'map-card' }, [mapEl, mapNote]),
    below
  );

  // ---------------------------------------------------------------- map setup
  const ugBounds = L.geoJSON(geo).getBounds();
  const map = L.map(mapEl, { zoomSnap: 0.25, minZoom: 6, maxZoom: 16, maxBounds: ugBounds.pad(0.6), attributionControl: true });
  currentMap = map;
  map.fitBounds(ugBounds, { padding: [10, 10] });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.55,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Districts: UBOS 2020 via <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> (CC BY 3.0 IGO)',
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  let overlay = null;
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => L.DomUtil.create('div', 'map-legend');
  legend.addTo(map);

  function draw() {
    const period = resolvePeriod(state.period, { earliest: '2000-01-01', today: localIso(new Date()) });
    const live = farmers.filter((f) => f.status !== 'merged' && (!state.activeOnly || (f.status || 'active') === 'active'));
    const farmerByFrn = new Map(live.map((f) => [f.frn, f]));
    const periodPurchases = purchases.filter((p) => !p.frnUnverified && inRange(p.purchaseDate, period.from, period.to));

    // ---- aggregate by resolved district (or raw text when unrecognised)
    const byDistrict = new Map();
    const unrecognised = new Map();
    const bucket = (name) => {
      if (!byDistrict.has(name)) byDistrict.set(name, { farmers: 0, active: 0, kg: 0, ugx: 0, gps: 0, suppliers: new Set() });
      return byDistrict.get(name);
    };
    for (const f of live) {
      const loc = resolveDistrict(f.district);
      const key = loc ? loc.name : (f.district || '(no district)');
      if (!loc) unrecognised.set(key, (unrecognised.get(key) || 0) + 1);
      const b = bucket(key);
      b.farmers += 1;
      if ((f.status || 'active') === 'active') b.active += 1;
      if (isPoint(f.farmLocation)) b.gps += 1;
    }
    for (const p of periodPurchases) {
      const f = farmerByFrn.get(p.frn);
      if (!f) continue;
      const loc = resolveDistrict(f.district);
      const b = bucket(loc ? loc.name : (f.district || '(no district)'));
      b.kg += Number(p.weightKg) || 0;
      b.ugx += Number(p.totalUgx) || 0;
      b.suppliers.add(p.frn);
    }
    const value = (name) => (byDistrict.get(name) || {})[state.measure] || 0;

    // ---- regions
    const regionTotals = new Map([...REGIONS, UNKNOWN_REGION].map((r) => [r, { farmers: 0, active: 0, kg: 0, ugx: 0, districts: 0 }]));
    for (const [name, b] of byDistrict) {
      const loc = resolveDistrict(name);
      const r = regionTotals.get(loc?.region || UNKNOWN_REGION);
      r.farmers += b.farmers;
      r.active += b.active;
      r.kg += b.kg;
      r.ugx += b.ugx;
      if (b.farmers) r.districts += 1;
    }
    const grand = [...regionTotals.values()].reduce((t, r) => t + r[state.measure], 0);

    // ---- map layers
    if (overlay) map.removeLayer(overlay);
    overlay = L.layerGroup().addTo(map);
    const legendNode = legend.getContainer();

    const geoValues = geo.features.map((f) => value(f.properties.name));
    const breaks = classBreaks(geoValues);
    const measureLabel = MEASURES.find((m) => m.value === state.measure).label.toLowerCase();

    L.geoJSON(geo, {
      style: (f) => ({
        fillColor: state.view === 'districts' ? rampColor(value(f.properties.name), breaks) : '#f4f1f0',
        fillOpacity: state.view === 'districts' ? 0.78 : 0.35,
        color: '#ffffff',
        weight: 1,
      }),
      onEachFeature: (f, layer) => {
        const name = f.properties.name;
        const b = byDistrict.get(name);
        layer.bindTooltip(name + ' · ' + f.properties.region + '<br>' + fmt(state.measure, value(name)), { sticky: true, direction: 'top' });
        layer.on('mouseover', () => layer.setStyle({ weight: 2.5, color: '#2b2020' }));
        layer.on('mouseout', () => layer.setStyle({ weight: 1, color: '#ffffff' }));
        layer.on('click', () => layer.bindPopup(popupFor(name, f.properties.region, b)).openPopup());
      },
    }).addTo(overlay);

    if (state.view === 'districts') {
      const values = [...byDistrict.entries()].filter(([name]) => resolveDistrict(name)?.lat != null).map(([, b]) => b[state.measure]);
      const max = Math.max(1, ...values);
      for (const [name, b] of byDistrict) {
        const loc = resolveDistrict(name);
        const v = b[state.measure];
        if (!loc || loc.lat == null || !(v > 0)) continue;
        const size = Math.round(28 + 28 * Math.sqrt(v / max));
        const icon = L.divIcon({
          className: 'map-pin-wrap',
          html: '<span class="map-pin" style="width:' + size + 'px;height:' + size + 'px;font-size:' + (size > 44 ? 14 : 12) + 'px">' + pinLabel(state.measure, v) + '</span>',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        L.marker([loc.lat, loc.lng], { icon, title: name + ': ' + fmt(state.measure, v), riseOnHover: true, zIndexOffset: Math.round(v) })
          .bindPopup(popupFor(name, loc.region, b))
          .addTo(overlay);
      }
      legendNode.innerHTML = legendHtml(breaks, state.measure, measureLabel);
      const placed = live.length - [...unrecognised.values()].reduce((t, n) => t + n, 0);
      mapNote.textContent = formatNumber(placed) + ' of ' + formatNumber(live.length) + ' farmers placed by district. Pins show the ' + measureLabel + (state.measure === 'farmers' ? '' : ' for ' + period.label.toLowerCase()) + ' in each district. Click a pin or district for details.';
    } else {
      const withGps = live.filter((f) => farmerPoint(f));
      const farmCount = withGps.filter((f) => farmerPoint(f).kind === 'farm').length;
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction: (c) => {
          const n = c.getChildCount();
          const size = n < 10 ? 34 : n < 100 ? 42 : 52;
          return L.divIcon({ className: 'map-pin-wrap', html: '<span class="map-pin" style="width:' + size + 'px;height:' + size + 'px">' + formatNumber(n) + '</span>', iconSize: [size, size] });
        },
      });
      for (const f of withGps) {
        const loc = farmerPoint(f);
        const m = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({ className: 'map-pin-wrap', html: '<span class="map-dot' + (loc.kind === 'farm' ? '' : ' map-dot-muted') + '"></span>', iconSize: [14, 14] }),
          title: f.fullName,
        });
        const acc = loc.accuracyM ? ' · accuracy ±' + formatNumber(loc.accuracyM) + ' m' + (loc.accuracyM > 500 ? ' (approximate)' : '') : '';
        m.bindPopup('<strong>' + esc(f.fullName) + '</strong><br>' + esc(f.frn) + ' · ' + esc(f.village || '') + ', ' + esc(f.district || '') + '<br><span class="muted">' + (loc.kind === 'farm' ? 'Farm location' : 'Where staff registered them (farm not recorded)') + acc + '</span><br><a href="#/farmers/' + encodeURIComponent(f.frn) + '">Open farmer →</a>');
        cluster.addLayer(m);
      }
      overlay.addLayer(cluster);
      legendNode.innerHTML = '<div class="legend-title">GPS locations</div><div class="legend-row"><span class="map-pin legend-pin">12</span> group of farmers</div><div class="legend-row"><span class="map-dot"></span> farm</div><div class="legend-row"><span class="map-dot map-dot-muted"></span> where registered</div>';
      mapNote.textContent = formatNumber(farmCount) + ' farmers have a farm location and ' + formatNumber(withGps.length - farmCount) + ' more are shown where staff registered them (no farm location yet). ' + formatNumber(live.length - withGps.length) + ' have no GPS at all and aren’t in this view - switch to By district to see everyone.';
    }

    // ---- tables
    const regionCards = el('div', { class: 'stat-grid' }, [...regionTotals.entries()]
      .filter(([r, t]) => r !== UNKNOWN_REGION || t.farmers)
      .map(([r, t]) =>
        el('div', { class: 'stat-card' }, [
          el('div', { class: 'stat-label' }, r === UNKNOWN_REGION ? 'District not recognised' : r + ' Region'),
          el('div', { class: 'stat-value' }, state.measure === 'farmers' ? formatNumber(t.farmers) : state.measure === 'kg' ? compact(t.kg) + ' kg' : 'UGX ' + compact(t.ugx)),
          el('div', { class: 'stat-sub' }, (grand ? ((t[state.measure] / grand) * 100).toFixed(0) + '% of total · ' : '') + formatNumber(t.farmers) + ' farmer' + (t.farmers === 1 ? '' : 's') + ' in ' + t.districts + ' district' + (t.districts === 1 ? '' : 's')),
          r !== UNKNOWN_REGION ? el('a', { href: '#/farmers?region=' + encodeURIComponent(r), class: 'stat-link' }, 'View farmers →') : null,
        ])
      ));

    const rows = [...byDistrict.entries()]
      .map(([name, b]) => ({ name, region: resolveDistrict(name)?.region || null, ...b }))
      .sort((a, b) => b[state.measure] - a[state.measure] || b.farmers - a.farmers || a.name.localeCompare(b.name));

    mount(below, 
      el('h2', {}, 'By region'),
      regionCards,
      el('h2', {}, 'By district'),
      rows.length
        ? table(
            ['District', 'Region', 'Farmers', 'Active', 'Farm GPS', 'Delivering', 'Weight', 'Value', 'Avg kg / farmer'],
            rows.map((r) =>
              el('tr', { class: r.region ? '' : 'row-warn' }, [
                el('td', {}, el('a', { href: '#/farmers?district=' + encodeURIComponent(r.name) }, r.name)),
                el('td', {}, r.region || el('span', { class: 'muted' }, 'not recognised')),
                el('td', { class: 'num' }, formatNumber(r.farmers)),
                el('td', { class: 'num' }, formatNumber(r.active)),
                el('td', { class: 'num' }, formatNumber(r.gps)),
                el('td', { class: 'num' }, formatNumber(r.suppliers.size)),
                el('td', { class: 'num' }, formatKg(r.kg)),
                el('td', { class: 'num' }, formatUgx(r.ugx)),
                el('td', { class: 'num' }, r.suppliers.size ? formatKg(r.kg / r.suppliers.size) : '—'),
              ])
            )
          )
        : el('div', { class: 'empty-state' }, 'No farmers yet.'),
      el('p', { class: 'muted small' }, 'Weight and value: matched purchases in ' + period.label.toLowerCase() + ', by the farmer’s district. “Avg kg / farmer” divides by farmers who delivered.'),
      cropsTable(live, crops),
      unrecognised.size
        ? el('div', { class: 'notice notice-warn' }, [
            el('strong', {}, unrecognised.size + ' district name' + (unrecognised.size === 1 ? '' : 's') + ' not recognised: '),
            el('span', {}, [...unrecognised.entries()].map(([n, c]) => n + ' (' + c + ')').join(', ') + '. '),
            el('span', {}, 'These farmers aren’t on the map. Fix the spelling on the farmer, or set a region and position in '),
            el('a', { href: '#/settings?tab=districts' }, 'Settings → Districts'),
            el('span', {}, '.'),
          ])
        : null
    );
  }

  function popupFor(name, region, b) {
    const s = b || { farmers: 0, active: 0, kg: 0, ugx: 0, suppliers: new Set() };
    return (
      '<strong>' + esc(name) + '</strong> <span class="muted">· ' + esc(region || 'region unknown') + '</span>' +
      '<table class="popup-table">' +
      '<tr><td>Farmers</td><td>' + formatNumber(s.farmers) + ' (' + formatNumber(s.active) + ' active)</td></tr>' +
      '<tr><td>Delivering</td><td>' + formatNumber(s.suppliers.size) + '</td></tr>' +
      '<tr><td>Weight</td><td>' + formatKg(s.kg) + '</td></tr>' +
      '<tr><td>Value</td><td>' + formatUgx(s.ugx) + '</td></tr>' +
      '</table>' +
      (s.farmers ? '<a href="#/farmers?district=' + encodeURIComponent(name) + '">View farmers →</a>' : '')
    );
  }

  draw();
  // The container was sized after Leaflet measured it on some layouts.
  setTimeout(() => map.invalidateSize(), 50);
}

function legendHtml(breaks, measure, label) {
  if (!breaks.length) return '<div class="legend-title">No data</div>';
  let lo = 0;
  const rows = breaks.map((b, i) => {
    const color = rampColor(b, breaks);
    const text = measure === 'farmers'
      ? (lo + 1 === b ? formatNumber(b) : formatNumber(lo + 1) + '–' + formatNumber(b))
      : (i === 0 ? 'up to ' : '') + compact(i === 0 ? b : lo) + (i === 0 ? '' : '–' + compact(b));
    lo = b;
    return '<div class="legend-row"><span class="legend-swatch" style="background:' + color + '"></span>' + text + '</div>';
  });
  return '<div class="legend-title">' + label.charAt(0).toUpperCase() + label.slice(1) + ' per district</div>' +
    '<div class="legend-row"><span class="legend-swatch" style="background:#f4f1f0"></span>none</div>' + rows.join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** How many farmers keep each crop/livestock item, and the total amount. */
function cropsTable(farmers, crops) {
  const answered = farmers.filter((f) => f.cropsLivestock && Object.keys(f.cropsLivestock).length);
  const rows = crops
    .map((c) => {
      const keepers = farmers.filter((f) => f.cropsLivestock && f.cropsLivestock[c.id] !== undefined);
      const total = keepers.reduce((t, f) => t + (typeof f.cropsLivestock[c.id] === 'number' ? f.cropsLivestock[c.id] : 0), 0);
      return { c, count: keepers.length, total };
    })
    .filter((r) => r.count || r.c.active !== false)
    .sort((a, b) => b.count - a.count);
  return el('div', {}, [
    el('h2', {}, 'Crops & livestock kept'),
    answered.length
      ? table(['Item', 'Type', 'Farmers', 'Share of those asked', 'Total amount'], rows.map((r) =>
          el('tr', {}, [
            el('td', {}, r.c.label),
            el('td', {}, r.c.kind === 'livestock' ? 'Livestock' : 'Crop'),
            el('td', { class: 'num' }, formatNumber(r.count)),
            el('td', { class: 'num' }, ((r.count / answered.length) * 100).toFixed(0) + '%'),
            el('td', { class: 'num' }, r.total ? formatNumber(r.total, 1) + ' ' + (r.c.unit || '') : '—'),
          ])))
      : el('p', { class: 'muted' }, 'No farmer has crops or livestock recorded yet - it’s asked on the registration form from v0.11, and can be filled in on each farmer’s page or by import.'),
    answered.length ? el('p', { class: 'muted small' }, 'Out of ' + formatNumber(answered.length) + ' farmers with crops or livestock recorded. Follows the “Active farmers only” filter above.') : null,
  ]);
}
