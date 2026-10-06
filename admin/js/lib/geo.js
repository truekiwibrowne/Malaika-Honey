/**
 * District -> region / map position lookup for the Regions screen.
 *
 * The base data is assets/geo/uganda-districts.json: the Uganda Bureau of
 * Statistics 2020 district boundaries (135 districts), each with the
 * region it sits in and a pin point guaranteed to fall inside it. Built by
 * scripts/build-uganda-geo.mjs.
 *
 * Farmers store `district` as free text from the field app's dropdown (or
 * an "Other" value typed by staff), so matching is forgiving: case,
 * spacing, hyphens and a "District" suffix are ignored, and a few known
 * renames/cities are aliased. Anything still unmatched can be given a
 * region and position in Settings -> Districts, which take precedence.
 */

export const REGIONS = ['Central', 'Eastern', 'Northern', 'Western'];
export const UNKNOWN_REGION = 'Unknown';

// Names the field app's list (or staff) use that differ from UBOS 2020.
const ALIASES = {
  sembabule: 'ssembabule',
  'fort portal': 'kabarole', // a city inside Kabarole, listed as a district in the field app
  'madi-okollo': 'madi okollo',
  madiokollo: 'madi okollo',
  'kampala capital city': 'kampala',
  kcca: 'kampala',
  luweero: 'luwero',
};

// Districts created after the 2020 boundaries, so not in the outline file.
// Positioned at the centre of the county they were formed from
// (geoBoundaries 2006 counties); region per the Uganda Local Government
// listing. They get their own pin rather than being folded into the old
// parent district - Terego farmers must not be counted as Arua.
const EXTRA_DISTRICTS = [
  { name: 'Terego', region: 'Northern', lat: 3.203, lng: 31.164 },
];

export function normaliseDistrict(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(/\bdistrict\b/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[key] || ALIASES[key.replace(/-/g, ' ')] || key.replace(/-/g, ' ');
}

let geoPromise = null;

/** The GeoJSON FeatureCollection (fetched once per session). */
export function loadUgandaGeo() {
  if (!geoPromise) {
    geoPromise = fetch('assets/geo/uganda-districts.json').then((res) => {
      if (!res.ok) throw new Error('Could not load the district map data.');
      return res.json();
    });
    geoPromise.catch(() => (geoPromise = null));
  }
  return geoPromise;
}

/**
 * Builds a resolver: district text -> { name, region, lat, lng } or null.
 * `overrides` are documents from the `districts` reference collection; any
 * of their `region`/`lat`/`lng` fields win over the built-in data, and a
 * district only they know about (e.g. a newly created one) still resolves.
 */
export function makeDistrictResolver(geo, overrides = []) {
  const index = new Map();
  for (const f of geo.features) {
    const p = f.properties;
    index.set(normaliseDistrict(p.name), { name: p.name, region: p.region, lat: p.lat, lng: p.lng });
  }
  for (const d of EXTRA_DISTRICTS) {
    if (!index.has(normaliseDistrict(d.name))) index.set(normaliseDistrict(d.name), { ...d });
  }
  for (const d of overrides) {
    const label = d.label || d.name || d.id;
    const key = normaliseDistrict(label);
    const base = index.get(key) || { name: label, region: null, lat: null, lng: null };
    const hasPos = typeof d.lat === 'number' && typeof d.lng === 'number';
    const resolved = {
      name: base.name,
      region: REGIONS.includes(d.region) ? d.region : base.region,
      lat: hasPos ? d.lat : base.lat,
      lng: hasPos ? d.lng : base.lng,
    };
    index.set(key, resolved);
    // Farmers store the option id, which can differ from its label.
    if (d.id && !index.has(normaliseDistrict(d.id))) index.set(normaliseDistrict(d.id), resolved);
  }
  return (district) => {
    if (!district) return null;
    return index.get(normaliseDistrict(district)) || null;
  };
}
