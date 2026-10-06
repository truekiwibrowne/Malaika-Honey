/**
 * Pick a point on a map - shared by BOTH apps, so it has no imports at all
 * (it brings its own tiny DOM helper, script loader and styles):
 *
 *   - field app: the New/Edit Farmer "Farm location" question;
 *   - management app: farm location on a farmer, and district positions in
 *     Settings (copied to admin/js/shared/ at deploy time - see netlify.toml).
 *
 * Three ways in, because a field phone often has no signal:
 *   1. "Use my current location" - the phone's GPS. Works fully offline.
 *   2. The map - click/tap to drop the pin, drag it, or search a place name.
 *      Needs a connection for the map tiles and the search.
 *   3. Typing latitude/longitude - always available.
 * If the map library can't load (offline), the dialog still opens with 1
 * and 3 and says why the map is missing, rather than failing.
 *
 * Search uses OpenStreetMap's Nominatim, limited to Uganda. Its usage
 * policy allows light interactive use like this (one search per click, no
 * autocomplete-as-you-type).
 */

const LEAFLET_JS = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'];
const LEAFLET_CSS = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css', 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
// Uganda, roughly - the default view and the "is this plausible?" check.
export const UGANDA_CENTER = { lat: 1.37, lng: 32.29, zoom: 6.5 };
const UGANDA_BOUNDS = { minLat: -1.6, maxLat: 4.3, minLng: 29.5, maxLng: 35.1 };

let leafletPromise = null;

function addTag(tag, attrs) {
  return new Promise((resolve, reject) => {
    const node = document.createElement(tag);
    Object.assign(node, attrs);
    node.crossOrigin = 'anonymous';
    node.onload = resolve;
    node.onerror = () => reject(new Error('Map could not load'));
    document.head.appendChild(node);
  });
}

/** Loads Leaflet once (reusing it if the page already has it). */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = Promise.all([
      document.querySelector('link[href="' + LEAFLET_CSS[0] + '"]') ? null : addTag('link', { rel: 'stylesheet', href: LEAFLET_CSS[0], integrity: LEAFLET_CSS[1] }),
      addTag('script', { src: LEAFLET_JS[0], integrity: LEAFLET_JS[1] }),
    ]).then(() => window.L);
    leafletPromise.catch(() => (leafletPromise = null));
  }
  return leafletPromise;
}

export function isValidPoint(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

export function isInUganda(p) {
  return isValidPoint(p) && p.lat >= UGANDA_BOUNDS.minLat && p.lat <= UGANDA_BOUNDS.maxLat && p.lng >= UGANDA_BOUNDS.minLng && p.lng <= UGANDA_BOUNDS.maxLng;
}

export function formatPoint(p) {
  return isValidPoint(p) ? p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) : '';
}

// ------------------------------------------------------------------ DOM

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

const CSS = `
.mhmp-backdrop{position:fixed;inset:0;background:rgba(30,20,20,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:12px}
.mhmp{background:#fff;color:#2b2020;border-radius:16px;width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.mhmp-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e8dcdc}
.mhmp-head h3{margin:0;font-size:16px}
.mhmp-x{border:none;background:none;font-size:26px;line-height:1;cursor:pointer;color:#7a6b6b;padding:0 4px}
.mhmp-body{padding:12px 16px;display:flex;flex-direction:column;gap:10px;overflow:auto}
.mhmp-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mhmp-row input{flex:1;min-width:0;min-height:40px;padding:8px 12px;border:1.5px solid #e8dcdc;border-radius:10px;font:inherit}
.mhmp-row input:focus{outline:none;border-color:#7c2328}
.mhmp-btn{min-height:40px;padding:8px 14px;border-radius:10px;border:1.5px solid #7c2328;background:#fff;color:#7c2328;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}
.mhmp-btn.primary{background:#7c2328;color:#fff}
.mhmp-btn:disabled{opacity:.55;cursor:default}
.mhmp-map{height:min(52vh,420px);border-radius:10px;background:#eef2f4;position:relative;z-index:0}
.mhmp-nomap{height:auto;padding:18px;text-align:center;color:#7a6b6b}
.mhmp-results{display:flex;flex-direction:column;gap:4px}
.mhmp-result{text-align:left;border:1px solid #e8dcdc;background:#faf6f5;border-radius:8px;padding:8px 10px;font:inherit;cursor:pointer}
.mhmp-result:hover{border-color:#7c2328}
.mhmp-coords label{font-size:12px;font-weight:600;color:#7a6b6b;display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px}
.mhmp-note{font-size:12px;color:#7a6b6b;margin:0}
.mhmp-warn{font-size:13px;color:#a86e00;margin:0}
.mhmp-foot{display:flex;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid #e8dcdc;flex-wrap:wrap}
.mhmp-pin{width:22px;height:22px;border-radius:50% 50% 50% 0;background:#7c2328;transform:rotate(-45deg);box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.4)}
`;

function injectCss() {
  if (document.getElementById('mhmp-css')) return;
  const style = document.createElement('style');
  style.id = 'mhmp-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function pinIcon(L) {
  return L.divIcon({ className: '', html: '<div class="mhmp-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
}

// ----------------------------------------------------------------- picker

/**
 * Opens the picker. Resolves with { lat, lng, accuracyM? } or null if
 * cancelled. `initial` is the current value; `near` is where to centre the
 * map when there's no value yet (e.g. the farmer's district).
 */
export function pickLocation({ title = 'Choose location', initial = null, near = null, help = '' } = {}) {
  injectCss();
  return new Promise((resolve) => {
    let point = isValidPoint(initial) ? { lat: initial.lat, lng: initial.lng } : null;
    let accuracyM = null;
    let map = null;
    let marker = null;
    let L = null;

    const latInput = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 3.0204', 'aria-label': 'Latitude' });
    const lngInput = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 30.9107', 'aria-label': 'Longitude' });
    const warn = h('p', { class: 'mhmp-warn', hidden: true });
    const saveBtn = h('button', { type: 'button', class: 'mhmp-btn primary' }, 'Use this location');
    const gpsBtn = h('button', { type: 'button', class: 'mhmp-btn' }, 'Use my current location');
    const searchInput = h('input', { type: 'search', placeholder: 'Search a village, town or place in Uganda' });
    const searchBtn = h('button', { type: 'button', class: 'mhmp-btn' }, 'Search');
    const results = h('div', { class: 'mhmp-results' });
    const mapNode = h('div', { class: 'mhmp-map' });
    const status = h('p', { class: 'mhmp-note' });

    function syncInputs() {
      latInput.value = point ? point.lat.toFixed(6) : '';
      lngInput.value = point ? point.lng.toFixed(6) : '';
      refresh();
    }
    function refresh() {
      saveBtn.disabled = !isValidPoint(point);
      if (point && !isInUganda(point)) {
        warn.textContent = 'That point is outside Uganda - check the numbers (latitude first, then longitude).';
        warn.hidden = false;
      } else warn.hidden = true;
    }
    function setPoint(p, { pan = true, zoom = null } = {}) {
      point = isValidPoint(p) ? { lat: p.lat, lng: p.lng } : null;
      if (map && L) {
        if (point) {
          if (!marker) {
            marker = L.marker([point.lat, point.lng], { draggable: true, icon: pinIcon(L) }).addTo(map);
            marker.on('dragend', () => {
              const ll = marker.getLatLng();
              accuracyM = null;
              setPoint({ lat: ll.lat, lng: ll.lng }, { pan: false });
            });
          } else marker.setLatLng([point.lat, point.lng]);
          if (pan) map.setView([point.lat, point.lng], zoom || Math.max(map.getZoom(), 13));
        } else if (marker) {
          map.removeLayer(marker);
          marker = null;
        }
      }
      syncInputs();
    }

    const onCoordInput = () => {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      accuracyM = null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        point = { lat, lng };
        if (map && L) setPoint(point);
        else refresh();
      } else {
        point = null;
        refresh();
      }
    };
    latInput.addEventListener('change', onCoordInput);
    lngInput.addEventListener('change', onCoordInput);

    gpsBtn.addEventListener('click', () => {
      if (!('geolocation' in navigator) || !window.isSecureContext) {
        status.textContent = 'This device can’t provide a GPS location here.';
        return;
      }
      gpsBtn.disabled = true;
      status.textContent = 'Finding your location… (stand outside for a better fix)';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsBtn.disabled = false;
          accuracyM = Math.round(pos.coords.accuracy);
          setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { zoom: 16 });
          status.textContent = 'Location found (accuracy about ±' + accuracyM + ' m)' + (accuracyM > 200 ? ' - this is rough; try again outside, or move the pin.' : '.');
        },
        (err) => {
          gpsBtn.disabled = false;
          status.textContent = err.code === 1 ? 'Location permission was refused. Allow location for this site, or set the point another way.' : 'Couldn’t get a GPS fix. Try again outside, or set the point another way.';
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });

    async function runSearch() {
      const q = searchInput.value.trim();
      if (!q) return;
      if (!navigator.onLine) {
        results.replaceChildren(h('p', { class: 'mhmp-note' }, 'Search needs an internet connection.'));
        return;
      }
      searchBtn.disabled = true;
      results.replaceChildren(h('p', { class: 'mhmp-note' }, 'Searching…'));
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ug&q=' + encodeURIComponent(q);
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const list = res.ok ? await res.json() : [];
        results.replaceChildren(
          ...(list.length
            ? list.map((r) =>
                h('button', {
                  type: 'button',
                  class: 'mhmp-result',
                  onClick: () => {
                    accuracyM = null;
                    setPoint({ lat: Number(r.lat), lng: Number(r.lon) }, { zoom: 14 });
                    results.replaceChildren(h('p', { class: 'mhmp-note' }, 'Pin placed at ' + r.display_name.split(',').slice(0, 3).join(',') + '. Drag it to the exact spot.'));
                  },
                }, r.display_name)
              )
            : [h('p', { class: 'mhmp-note' }, 'Nothing found for “' + q + '”. Try a nearby town, or tap the map.')])
        );
      } catch {
        results.replaceChildren(h('p', { class: 'mhmp-note' }, 'Search failed - check the connection, or tap the map.'));
      } finally {
        searchBtn.disabled = false;
      }
    }
    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      if (map) map.remove();
      backdrop.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);

    saveBtn.addEventListener('click', () => {
      if (!isValidPoint(point)) return;
      close({ lat: Math.round(point.lat * 1e6) / 1e6, lng: Math.round(point.lng * 1e6) / 1e6, ...(accuracyM ? { accuracyM } : {}) });
    });

    const clearBtn = h('button', { type: 'button', class: 'mhmp-btn', onClick: () => { accuracyM = null; setPoint(null, { pan: false }); } }, 'Clear');

    const backdrop = h('div', { class: 'mhmp-backdrop', onClick: (e) => { if (e.target === backdrop) close(null); } }, [
      h('div', { class: 'mhmp', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
        h('div', { class: 'mhmp-head' }, [h('h3', {}, title), h('button', { type: 'button', class: 'mhmp-x', 'aria-label': 'Close', onClick: () => close(null) }, '×')]),
        h('div', { class: 'mhmp-body' }, [
          help ? h('p', { class: 'mhmp-note' }, help) : null,
          h('div', { class: 'mhmp-row' }, [gpsBtn]),
          status,
          h('div', { class: 'mhmp-row' }, [searchInput, searchBtn]),
          results,
          mapNode,
          h('div', { class: 'mhmp-row mhmp-coords' }, [h('label', {}, ['Latitude', latInput]), h('label', {}, ['Longitude', lngInput])]),
          warn,
        ]),
        h('div', { class: 'mhmp-foot' }, [clearBtn, h('div', { class: 'mhmp-row' }, [h('button', { type: 'button', class: 'mhmp-btn', onClick: () => close(null) }, 'Cancel'), saveBtn])]),
      ]),
    ]);
    document.body.appendChild(backdrop);
    syncInputs();

    loadLeaflet()
      .then((Leaflet) => {
        L = Leaflet;
        map = L.map(mapNode, { zoomSnap: 0.5 });
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        map.attributionControl.setPrefix(false);
        const start = point || (isValidPoint(near) ? near : null);
        if (start) map.setView([start.lat, start.lng], point ? 15 : near.zoom || 11);
        else map.setView([UGANDA_CENTER.lat, UGANDA_CENTER.lng], UGANDA_CENTER.zoom);
        map.on('click', (e) => {
          accuracyM = null;
          setPoint({ lat: e.latlng.lat, lng: e.latlng.lng }, { pan: false });
        });
        if (point) setPoint(point, { pan: false });
        setTimeout(() => map.invalidateSize(), 60);
      })
      .catch(() => {
        mapNode.className = 'mhmp-map mhmp-nomap';
        mapNode.textContent = 'The map needs an internet connection. You can still use your current location or type the coordinates.';
        searchInput.disabled = true;
        searchBtn.disabled = true;
      });
  });
}

/**
 * A small, non-interactive-ish map showing one or more points - used for a
 * farm's location on the management farmer page. points: [{ lat, lng,
 * label, muted }]. Returns a cleanup function.
 */
export async function renderMiniMap(node, points, { zoom = 13 } = {}) {
  injectCss();
  const valid = points.filter(isValidPoint);
  const L = await loadLeaflet();
  const map = L.map(node, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  map.attributionControl.setPrefix(false);
  valid.forEach((p) => {
    const m = p.muted
      ? L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#7a6b6b', fillOpacity: 0.9 })
      : L.marker([p.lat, p.lng], { icon: pinIcon(L) });
    if (p.label) m.bindTooltip(p.label);
    m.addTo(map);
  });
  if (valid.length > 1) map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 15 });
  else if (valid.length) map.setView([valid[0].lat, valid[0].lng], zoom);
  else map.setView([UGANDA_CENTER.lat, UGANDA_CENTER.lng], UGANDA_CENTER.zoom);
  setTimeout(() => map.invalidateSize(), 60);
  return () => map.remove();
}
