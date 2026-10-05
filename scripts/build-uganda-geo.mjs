#!/usr/bin/env node
/**
 * Builds admin/assets/geo/uganda-districts.json - the district outlines,
 * centroids and region assignment behind the management app's Regions map.
 *
 * Source: geoBoundaries "gbHumanitarian" release of the Uganda Bureau of
 * Statistics 2020 boundaries (135 districts, 4 regions), CC BY 3.0 IGO -
 * the attribution is shown on the map itself. Run once, output committed;
 * re-run only if district boundaries change:
 *
 *   node scripts/build-uganda-geo.mjs
 *
 * No dependencies on purpose (this project has no build step): polygon
 * simplification, centroids and point-in-polygon are small enough to do
 * here by hand.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbHumanitarian/UGA/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'admin', 'assets', 'geo', 'uganda-districts.json');

// Degrees. ~1 km at the equator: invisible at country zoom, and cuts the
// file to a fraction of the source while keeping every district recognisable.
const TOLERANCE = 0.01;

async function fetchJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error('Fetch failed: ' + path + ' ' + res.status);
  return res.json();
}

// ---- geometry helpers ------------------------------------------------------

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error('Unexpected geometry ' + geometry.type);
}

function sqSegDist(p, a, b) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx || dy) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function douglasPeucker(points, tol) {
  const sqTol = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (n) => Math.round(n * 1000) / 1000;

function simplifyRing(ring) {
  const out = douglasPeucker(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]);
  return out.length >= 4 ? out : null; // degenerate after simplification - drop
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/** Area-weighted centroid over the outer rings of every part. */
function centroid(polys) {
  let A = 0, cx = 0, cy = 0;
  for (const poly of polys) {
    const ring = poly[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
      A += f;
    }
  }
  A /= 2;
  return [cx / (6 * A), cy / (6 * A)];
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolys(pt, polys) {
  return polys.some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole)));
}

/**
 * A centroid can fall outside a concave or lake-split district (Kalangala,
 * Buvuma, Namayingo are mostly water). Pins must sit on the district, so
 * fall back to the centre of the largest part's bounding-box scanline.
 */
function pinPoint(polys) {
  const c = centroid(polys);
  if (inPolys(c, polys)) return c;
  const largest = polys.slice().sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
  const ys = largest[0].map((p) => p[1]);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs = [];
  const ring = largest[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > midY) !== (yj > midY)) xs.push(((xj - xi) * (midY - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  // widest inside span
  let best = [xs[0], xs[1]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return [(best[0] + best[1]) / 2, midY];
}

// ---- build -----------------------------------------------------------------

const [districts, regions] = await Promise.all([
  fetchJson('ADM2/geoBoundaries-UGA-ADM2_simplified.geojson'),
  fetchJson('ADM1/geoBoundaries-UGA-ADM1_simplified.geojson'),
]);

const regionPolys = regions.features.map((f) => ({ name: f.properties.shapeName, polys: polygonsOf(f.geometry) }));

const features = districts.features
  .map((f) => {
    const name = f.properties.shapeName;
    const polys = polygonsOf(f.geometry);
    const pin = pinPoint(polys);
    const region = regionPolys.find((r) => inPolys(pin, r.polys));
    if (!region) throw new Error('No region found for ' + name);

    const simplified = polys
      .map((poly) => poly.map(simplifyRing).filter(Boolean))
      .filter((poly) => poly.length);

    return {
      type: 'Feature',
      properties: { name, region: region.name, lat: round(pin[1]), lng: round(pin[0]) },
      geometry: { type: 'MultiPolygon', coordinates: simplified },
    };
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

const out = {
  type: 'FeatureCollection',
  source: 'Uganda Bureau of Statistics 2020 district boundaries via geoBoundaries (gbHumanitarian), CC BY 3.0 IGO',
  generated: new Date().toISOString().slice(0, 10),
  features,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const counts = {};
features.forEach((f) => (counts[f.properties.region] = (counts[f.properties.region] || 0) + 1));
console.log('Wrote', OUT, '-', features.length, 'districts', counts);
