import { el, mount, spinner, formatUgx, formatKg, table, segmented, compact, formatNumber } from '../lib/ui.js';
import { fetchAllFarmers, fetchAllPurchases, loadDistrictResolver, fetchCollection } from '../lib/data.js';
import { officeIdToEmail } from '../shared/officeAccounts.js';
import { loadCollection } from '../lib/refdata.js';
import { REGIONS, UNKNOWN_REGION } from '../lib/geo.js';
import {
  PERIODS, resolvePeriod, grainFor, bucketOf, bucketLabel, bucketRange, inRange,
  sumPurchases, groupBy, pctChange, registeredIso, localIso,
} from '../lib/stats.js';
import { renderChart, chartCard, destroyCharts, destroyChart, BRAND, colorFor, ordinalColors, tooltipValue } from '../lib/charts.js';

const STORE_KEY = 'mh-admin-dashboard';

function loadPrefs() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function savePrefs(prefs) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode - preference just isn't remembered */
  }
}

function statTile(label, value, sub, delta) {
  let deltaNode = null;
  if (delta !== undefined) {
    if (delta === null) deltaNode = el('div', { class: 'stat-sub' }, 'No earlier data to compare');
    else {
      const up = delta >= 0;
      deltaNode = el('div', { class: 'stat-delta ' + (Math.abs(delta) < 0.5 ? 'flat' : up ? 'up' : 'down') }, [
        el('span', { 'aria-hidden': 'true' }, Math.abs(delta) < 0.5 ? '→ ' : up ? '▲ ' : '▼ '),
        Math.abs(delta).toFixed(0) + '% vs previous period',
      ]);
    }
  }
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null,
    deltaNode,
  ]);
}

function seriesTable(labels, datasets, kind) {
  return table(
    ['Period', ...datasets.map((d) => d.label)],
    labels.map((label, i) =>
      el('tr', {}, [el('td', {}, label), ...datasets.map((d) => el('td', { class: 'num' }, d.data[i] === null ? '—' : tooltipValue(kind, d.data[i])))])
    )
  );
}

export async function renderDashboard(root) {
  destroyCharts();
  mount(root, spinner('Loading data…'));

  let farmers, purchases, products, grades, geoCtx;
  try {
    [farmers, purchases, products, grades, geoCtx] = await Promise.all([
      fetchAllFarmers(),
      fetchAllPurchases(),
      loadCollection('products').then((r) => r.entries),
      loadCollection('grades').then((r) => r.entries),
      loadDistrictResolver().catch((err) => {
        console.warn('[Malaika Admin] District data unavailable:', err);
        return null;
      }),
    ]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load data: ' + (err.message || 'unknown error')));
    return;
  }

  // Access problems a manager must act on - shown here because nobody
  // opens Settings → Staff access just to check. Loaded without blocking.
  const accessNotices = el('div');
  Promise.all([
    fetchCollection('signupRequests').catch(() => []),
    fetchCollection('fieldOffices').catch(() => []),
    fetchCollection('allowedStaff').catch(() => null),
  ]).then(([requests, offices, staff]) => {
    const waiting = requests.filter((r) => r.status === 'pending');
    const allowed = staff ? new Set(staff.map((x) => x.id.trim().toLowerCase())) : null;
    const locked = allowed ? offices.filter((o) => o.active !== false && !allowed.has(officeIdToEmail(o.id).toLowerCase())) : [];
    const who = (r) => r.displayName || String(r.email).split('@')[0];
    mount(accessNotices,
      locked.length
        ? el('div', { class: 'notice notice-bad' }, [
            el('strong', {}, locked.map((o) => o.label || o.id).join(', ') + (locked.length === 1 ? ' office can’t sign in. ' : ' offices can’t sign in. ')),
            el('span', {}, 'They are on the phones’ sign-in screen but have no access, so staff there see “Approval Needed”. '),
            el('a', { href: '#/settings?tab=staff' }, 'Restore or review →'),
          ])
        : null,
      waiting.length
        ? el('div', { class: 'notice notice-warn' }, [
            el('strong', {}, waiting.length + ' sign-in request' + (waiting.length === 1 ? '' : 's') + ' waiting for approval: '),
            el('span', {}, waiting.slice(0, 5).map(who).join(', ') + (waiting.length > 5 ? '…' : '') + '. '),
            el('a', { href: '#/settings?tab=staff' }, 'Review →'),
          ])
        : null
    );
  });

  // Merged records are duplicates of another farmer - never count them twice.
  const liveFarmers = farmers.filter((f) => f.status !== 'merged');
  const farmerByFrn = new Map(farmers.map((f) => [f.frn, f]));
  const productIds = products.map((p) => p.id);
  const productLabel = (id) => products.find((p) => p.id === id)?.label || id || 'Unknown';
  const resolveDistrict = geoCtx ? geoCtx.resolveDistrict : () => null;
  const regionOf = (frn) => resolveDistrict(farmerByFrn.get(frn)?.district)?.region || UNKNOWN_REGION;

  const dates = purchases.map((p) => p.purchaseDate).filter(Boolean).concat(liveFarmers.map(registeredIso).filter(Boolean)).sort();
  const earliest = dates[0] || localIso(new Date());

  const prefs = { period: '30d', metric: 'kg', custom: {}, ...loadPrefs() };

  const periodSelect = el('select', { 'aria-label': 'Period' }, PERIODS.map((p) => el('option', { value: p.key }, p.label)));
  periodSelect.value = prefs.period;
  const fromInput = el('input', { type: 'date', 'aria-label': 'From', value: prefs.custom.from || '' });
  const toInput = el('input', { type: 'date', 'aria-label': 'To', value: prefs.custom.to || '' });
  const customBox = el('div', { class: 'custom-range', hidden: prefs.period !== 'custom' }, [fromInput, el('span', { class: 'muted' }, 'to'), toInput]);
  const rangeLabel = el('span', { class: 'muted range-label' });
  const body = el('div');

  const onChange = () => {
    prefs.period = periodSelect.value;
    prefs.custom = { from: fromInput.value, to: toInput.value };
    customBox.hidden = prefs.period !== 'custom';
    savePrefs(prefs);
    draw();
  };
  periodSelect.addEventListener('change', onChange);
  fromInput.addEventListener('change', onChange);
  toInput.addEventListener('change', onChange);

  const allTime = sumPurchases(purchases);
  const unverified = purchases.filter((p) => p.frnUnverified).length;

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, 'Dashboard'),
        el('p', { class: 'muted' }, 'All time: ' + formatNumber(liveFarmers.length) + ' farmers · ' + formatNumber(allTime.count) + ' purchases · ' + formatKg(allTime.kg) + ' · ' + formatUgx(allTime.ugx)),
      ]),
    ]),
    accessNotices,
    el('div', { class: 'filter-bar sticky-filters' }, [periodSelect, customBox, rangeLabel]),
    unverified
      ? el('div', { class: 'notice notice-warn' }, [
          el('strong', {}, unverified + ' purchase' + (unverified === 1 ? '' : 's') + ' not matched to a farmer. '),
          el('span', {}, 'They count in the totals but not in any farmer’s or region’s figures until resolved in the field app’s Fix Unverified Purchases screen. '),
          el('a', { href: '#/purchases?unmatched=1' }, 'View them'),
        ])
      : null,
    body
  );

  function draw() {
    destroyCharts();
    const period = resolvePeriod(prefs.period, { custom: prefs.custom, earliest });
    rangeLabel.textContent = period.from + ' → ' + period.to;
    const grain = grainFor(period.from, period.to);
    const keys = bucketRange(period.from, period.to, grain);
    const labels = keys.map((k) => bucketLabel(k, grain));
    const grainWord = { day: 'day', week: 'week', month: 'month' }[grain];

    const cur = purchases.filter((p) => inRange(p.purchaseDate, period.from, period.to));
    const prev = purchases.filter((p) => inRange(p.purchaseDate, period.prevFrom, period.prevTo));
    const curSum = sumPurchases(cur);
    const prevSum = sumPurchases(prev);
    const newFarmers = liveFarmers.filter((f) => inRange(registeredIso(f), period.from, period.to));
    const prevNewFarmers = liveFarmers.filter((f) => inRange(registeredIso(f), period.prevFrom, period.prevTo));
    const suppliers = new Set(cur.filter((p) => !p.frnUnverified).map((p) => p.frn));
    const prevSuppliers = new Set(prev.filter((p) => !p.frnUnverified).map((p) => p.frn));
    const avgPrice = curSum.kg ? curSum.ugx / curSum.kg : 0;
    const prevAvgPrice = prevSum.kg ? prevSum.ugx / prevSum.kg : 0;
    const d = (a, b) => (period.comparable ? pctChange(a, b) : undefined);

    const kpis = el('div', { class: 'stat-grid' }, [
      statTile('Paid to farmers', 'UGX ' + compact(curSum.ugx), formatUgx(curSum.ugx), d(curSum.ugx, prevSum.ugx)),
      statTile('Weight bought', compact(curSum.kg) + ' kg', formatKg(curSum.kg), d(curSum.kg, prevSum.kg)),
      statTile('Purchases', formatNumber(curSum.count), null, d(curSum.count, prevSum.count)),
      statTile('Average price', avgPrice ? 'UGX ' + formatNumber(avgPrice) + '/kg' : '—', 'across all products', d(avgPrice, prevAvgPrice)),
      statTile('Farmers delivering', formatNumber(suppliers.size), 'distinct farmers', d(suppliers.size, prevSuppliers.size)),
      statTile('New farmers', formatNumber(newFarmers.length), 'registered in period', d(newFarmers.length, prevNewFarmers.length)),
    ]);

    // -------- chart 1: volume over time (single series)
    const byBucket = new Map(groupBy(cur, (p) => bucketOf(p.purchaseDate, grain)).map((g) => [g.key, sumPurchases(g.items)]));
    const metricCard = chartCard({
      title: 'Purchases over time',
      subtitle: 'Per ' + grainWord,
      controls: segmented(
        [{ value: 'kg', label: 'Weight' }, { value: 'ugx', label: 'Value' }, { value: 'count', label: 'Count' }],
        prefs.metric,
        (v) => {
          prefs.metric = v;
          savePrefs(prefs);
          drawMetric();
        },
        'Measure'
      ),
    });
    function drawMetric() {
      const kind = prefs.metric;
      const data = keys.map((k) => (byBucket.get(k) || { kg: 0, ugx: 0, count: 0 })[kind]);
      const label = { kg: 'Weight', ugx: 'Value', count: 'Purchases' }[kind];
      const ds = [{ label, data, color: BRAND }];
      destroyOne(metricCard);
      metricCard.setEmpty(!cur.length);
      renderChart(metricCard.canvas, { type: 'bar', labels, datasets: ds, kind }).then((c) => (metricCard.chart = c));
      metricCard.setTable(() => seriesTable(labels, ds, kind));
    }

    // -------- chart 2: weight by product (stacked, categorical by fixed product order)
    const curProducts = [...new Set(cur.map((p) => p.product || 'unknown'))].sort((a, b) => {
      const ia = productIds.indexOf(a);
      const ib = productIds.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const productCard = chartCard({ title: 'Weight by product', subtitle: 'Per ' + grainWord });
    const productSets = curProducts.map((pid) => {
      const m = new Map(groupBy(cur.filter((p) => (p.product || 'unknown') === pid), (p) => bucketOf(p.purchaseDate, grain)).map((g) => [g.key, sumPurchases(g.items).kg]));
      return { label: productLabel(pid), data: keys.map((k) => m.get(k) || 0), color: colorFor(pid, productIds) };
    });

    // -------- chart 3: average price per kg by product (lines)
    const priceCard = chartCard({ title: 'Average price paid per kg', subtitle: 'By product, per ' + grainWord });
    const priceSets = curProducts.map((pid) => {
      const m = new Map(groupBy(cur.filter((p) => (p.product || 'unknown') === pid), (p) => bucketOf(p.purchaseDate, grain)).map((g) => {
        const s = sumPurchases(g.items);
        return [g.key, s.kg ? Math.round(s.ugx / s.kg) : null];
      }));
      return { label: productLabel(pid), data: keys.map((k) => (m.has(k) ? m.get(k) : null)), color: colorFor(pid, productIds) };
    });

    // -------- chart 4: grade mix (100% stacked, ordinal blues)
    const gradeIds = grades.map((g) => g.id);
    const gradesSeen = [...new Set(cur.map((p) => p.grade || '—'))].sort((a, b) => {
      const ia = gradeIds.indexOf(a);
      const ib = gradeIds.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const gradeColors = ordinalColors(gradesSeen.length);
    const gradeCard = chartCard({ title: 'Quality mix', subtitle: 'Share of weight by grade, per ' + grainWord });
    const totalKgByBucket = new Map(keys.map((k) => [k, (byBucket.get(k) || { kg: 0 }).kg]));
    const gradeSets = gradesSeen.map((g, i) => {
      const m = new Map(groupBy(cur.filter((p) => (p.grade || '—') === g), (p) => bucketOf(p.purchaseDate, grain)).map((x) => [x.key, sumPurchases(x.items).kg]));
      return {
        label: g === '—' ? 'Ungraded' : 'Grade ' + (grades.find((x) => x.id === g)?.label || g),
        data: keys.map((k) => (totalKgByBucket.get(k) ? Math.round(((m.get(k) || 0) / totalKgByBucket.get(k)) * 1000) / 10 : 0)),
        color: gradeColors[i],
      };
    });

    // -------- chart 5: registrations
    const regCard = chartCard({ title: 'New farmer registrations', subtitle: 'Per ' + grainWord });
    const regMap = new Map(groupBy(newFarmers, (f) => bucketOf(registeredIso(f), grain)).map((g) => [g.key, g.items.length]));
    const regSets = [{ label: 'Registrations', data: keys.map((k) => regMap.get(k) || 0), color: BRAND }];

    // -------- tables
    const productRows = curProducts.map((pid) => {
      const s = sumPurchases(cur.filter((p) => (p.product || 'unknown') === pid));
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'swatch', style: 'background:' + colorFor(pid, productIds) }), productLabel(pid)]),
        el('td', { class: 'num' }, formatNumber(s.count)),
        el('td', { class: 'num' }, formatKg(s.kg)),
        el('td', { class: 'num' }, formatUgx(s.ugx)),
        el('td', { class: 'num' }, s.kg ? formatUgx(s.ugx / s.kg) : '—'),
        el('td', { class: 'num' }, curSum.kg ? ((s.kg / curSum.kg) * 100).toFixed(1) + '%' : '—'),
      ]);
    });

    const offices = groupBy(cur, (p) => p.recordedBy || '—')
      .map((g) => ({ office: g.key, ...sumPurchases(g.items), farmers: new Set(g.items.map((p) => p.frn)).size }))
      .sort((a, b) => b.kg - a.kg);

    const regionRows = [...REGIONS, UNKNOWN_REGION].map((r) => {
      const items = cur.filter((p) => !p.frnUnverified && regionOf(p.frn) === r);
      const s = sumPurchases(items);
      const regFarmers = liveFarmers.filter((f) => (resolveDistrict(f.district)?.region || UNKNOWN_REGION) === r).length;
      return { region: r, ...s, farmers: regFarmers, suppliers: new Set(items.map((p) => p.frn)).size };
    }).filter((r) => r.region !== UNKNOWN_REGION || r.count || r.farmers);

    const top = groupBy(cur.filter((p) => p.frn && !p.frnUnverified), (p) => p.frn)
      .map((g) => ({ frn: g.key, name: farmerByFrn.get(g.key)?.fullName || g.items[0].farmerNameSnapshot || g.key, ...sumPurchases(g.items) }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 10);

    mount(body, 
      kpis,
      el('div', { class: 'chart-grid' }, [metricCard.node, productCard.node, priceCard.node, gradeCard.node, regCard.node]),

      el('div', { class: 'two-col' }, [
        el('div', {}, [
          el('h2', {}, 'By product'),
          productRows.length
            ? table(['Product', 'Purchases', 'Weight', 'Value', 'Avg / kg', 'Share'], productRows)
            : el('p', { class: 'muted' }, 'No purchases in this period.'),
        ]),
        el('div', {}, [
          el('h2', {}, ['By region ', el('a', { href: '#/regions', class: 'h2-link' }, 'Map →')]),
          table(
            ['Region', 'Farmers', 'Delivering', 'Weight', 'Value'],
            regionRows.map((r) =>
              el('tr', {}, [
                el('td', {}, r.region === UNKNOWN_REGION ? el('span', { class: 'muted' }, 'District not recognised') : r.region),
                el('td', { class: 'num' }, formatNumber(r.farmers)),
                el('td', { class: 'num' }, formatNumber(r.suppliers)),
                el('td', { class: 'num' }, formatKg(r.kg)),
                el('td', { class: 'num' }, formatUgx(r.ugx)),
              ])
            )
          ),
        ]),
      ]),

      el('div', { class: 'two-col' }, [
        el('div', {}, [
          el('h2', {}, 'By office'),
          offices.length
            ? table(['Recorded by', 'Purchases', 'Farmers', 'Weight', 'Value'], offices.map((o) =>
                el('tr', {}, [
                  el('td', {}, o.office),
                  el('td', { class: 'num' }, formatNumber(o.count)),
                  el('td', { class: 'num' }, formatNumber(o.farmers)),
                  el('td', { class: 'num' }, formatKg(o.kg)),
                  el('td', { class: 'num' }, formatUgx(o.ugx)),
                ])))
            : el('p', { class: 'muted' }, 'No purchases in this period.'),
        ]),
        el('div', {}, [
          el('h2', {}, 'Top suppliers'),
          top.length
            ? table(['Farmer', 'FRN', 'Weight', 'Value'], top.map((f) =>
                el('tr', {}, [
                  el('td', {}, el('a', { href: '#/farmers/' + f.frn }, f.name)),
                  el('td', {}, f.frn),
                  el('td', { class: 'num' }, formatKg(f.kg)),
                  el('td', { class: 'num' }, formatUgx(f.ugx)),
                ])))
            : el('p', { class: 'muted' }, 'No purchases in this period.'),
        ]),
      ])
    );

    // Charts need their canvas attached to measure, so render after insertion.
    drawMetric();
    const plot = (card, spec) => {
      card.setEmpty(!spec.datasets.length || spec.datasets.every((s) => s.data.every((v) => !v)));
      renderChart(card.canvas, spec);
      card.setTable(() => seriesTable(spec.labels, spec.datasets, spec.kind));
    };
    plot(productCard, { type: 'bar', labels, datasets: productSets, stacked: true, kind: 'kg' });
    plot(priceCard, { type: 'line', labels, datasets: priceSets, kind: 'ugx' });
    plot(gradeCard, { type: 'bar', labels, datasets: gradeSets, stacked: true, kind: 'pct', max: 100 });
    plot(regCard, { type: 'bar', labels, datasets: regSets, kind: 'count' });
  }

  function destroyOne(card) {
    destroyChart(card.chart);
    card.chart = null;
  }

  draw();
}
