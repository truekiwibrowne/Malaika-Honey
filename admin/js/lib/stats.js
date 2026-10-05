/**
 * Pure date-period and aggregation helpers for the dashboard and regions
 * screens. No Firestore, no DOM - everything takes already-fetched arrays,
 * so a figure on screen always comes from the same data the lists show.
 *
 * Dates are handled as local 'YYYY-MM-DD' strings throughout, matching how
 * the field app writes purchases.purchaseDate. Never Date.toISOString() for
 * a day: that is UTC, and in Uganda (UTC+3) it reports yesterday until 3am.
 */

export function localIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function parseIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return localIso(d);
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 864e5);
}

/** A farmer's registration day: registeredAt (Timestamp), else signatureDate. */
export function registeredIso(farmer) {
  const r = farmer.registeredAt;
  if (r && typeof r.toDate === 'function') return localIso(r.toDate());
  if (typeof r === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r)) return r.slice(0, 10);
  if (farmer.signatureDate) return String(farmer.signatureDate).slice(0, 10);
  return null;
}

export const PERIODS = [
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: '12m', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

/**
 * Resolves a period key to an inclusive [from, to] day range, plus the
 * equal-length range immediately before it for "vs previous period".
 * `earliest` is the first day with any data - used for 'all'.
 */
export function resolvePeriod(key, { custom = {}, earliest = null, today = localIso(new Date()) } = {}) {
  let from;
  let to = today;
  switch (key) {
    case '30d': from = addDays(today, -29); break;
    case '90d': from = addDays(today, -89); break;
    case 'month': from = today.slice(0, 8) + '01'; break;
    case 'year': from = today.slice(0, 5) + '01-01'; break;
    // The current month plus the 11 full months before it.
    case '12m': from = shiftMonths(today.slice(0, 8) + '01', -11); break;
    case 'custom':
      from = custom.from || earliest || today;
      to = custom.to || today;
      if (from > to) [from, to] = [to, from];
      break;
    default: from = earliest || today;
  }
  const label = (PERIODS.find((p) => p.key === key) || PERIODS[0]).label;
  const span = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  return { key, from, to, label, span, prevFrom, prevTo, comparable: key !== 'all' };
}

function shiftMonths(iso, n) {
  const d = parseIso(iso);
  d.setMonth(d.getMonth() + n);
  return localIso(d);
}

/** Bucket size that keeps a time chart between roughly 8 and 60 bars. */
export function grainFor(from, to) {
  const span = daysBetween(from, to) + 1;
  if (span <= 45) return 'day';
  if (span <= 210) return 'week';
  return 'month';
}

/** Monday-start ISO week bucket, day, or month. */
export function bucketOf(iso, grain) {
  if (grain === 'month') return iso.slice(0, 7);
  if (grain === 'week') {
    const d = parseIso(iso);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return localIso(d);
  }
  return iso;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketLabel(key, grain) {
  if (grain === 'month') {
    const [y, m] = key.split('-');
    return MONTHS[Number(m) - 1] + ' ' + y.slice(2);
  }
  const d = parseIso(key);
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** Every bucket key from `from` to `to`, so empty periods still show as zero. */
export function bucketRange(from, to, grain) {
  const keys = [];
  let cursor = bucketOf(from, grain);
  const last = bucketOf(to, grain);
  let guard = 0;
  while (cursor <= last && guard++ < 1000) {
    keys.push(cursor);
    if (grain === 'month') cursor = shiftMonths(cursor + '-01', 1).slice(0, 7);
    else cursor = addDays(cursor, grain === 'week' ? 7 : 1);
  }
  return keys;
}

export const inRange = (iso, from, to) => !!iso && iso >= from && iso <= to;

export function sumPurchases(list) {
  let kg = 0;
  let ugx = 0;
  for (const p of list) {
    kg += Number(p.weightKg) || 0;
    ugx += Number(p.totalUgx) || 0;
  }
  return { count: list.length, kg, ugx };
}

/** Groups items by key, returning [{ key, items }] in insertion order. */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

/** Percentage change, or null when there's no meaningful base. */
export function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
