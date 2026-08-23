import { el, mount, spinner, formatUgx, formatKg, table } from '../lib/ui.js';
import { fetchAllFarmers, fetchAllPurchases, computeMetrics } from '../lib/data.js';

function statCard(label, value, sub) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-value' }, value),
    el('div', { class: 'stat-label' }, label),
    sub ? el('div', { class: 'stat-sub' }, sub) : null,
  ]);
}

export async function renderDashboard(root) {
  mount(root, spinner('Loading data…'));

  let farmers;
  let purchases;
  try {
    [farmers, purchases] = await Promise.all([fetchAllFarmers(), fetchAllPurchases()]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load data: ' + (err.message || 'unknown error')));
    return;
  }

  const m = computeMetrics(farmers, purchases);

  mount(
    root,
    el('div', { class: 'page-head' }, [el('h1', {}, 'Dashboard')]),

    el('h2', {}, 'Overall'),
    el('div', { class: 'stat-grid' }, [
      statCard('Farmers', String(m.farmersTotal), m.farmersThisMonth + ' registered this month'),
      statCard('Purchases', String(m.purchasesTotal)),
      statCard('Total delivered', formatKg(m.kgTotal)),
      statCard('Total paid', formatUgx(m.paidTotal)),
    ]),

    el('h2', {}, 'Recent activity'),
    el('div', { class: 'stat-grid' }, [
      statCard('Today', m.today.count + ' purchases', formatKg(m.today.kg) + ' · ' + formatUgx(m.today.ugx)),
      statCard('Last 7 days', m.week.count + ' purchases', formatKg(m.week.kg) + ' · ' + formatUgx(m.week.ugx)),
      statCard('This month', m.month.count + ' purchases', formatKg(m.month.kg) + ' · ' + formatUgx(m.month.ugx)),
    ]),

    m.unverifiedCount
      ? el('div', { class: 'notice notice-warn' }, [
          el('strong', {}, m.unverifiedCount + ' purchase' + (m.unverifiedCount === 1 ? '' : 's') + ' not matched to a farmer.'),
          el('span', {}, ' These were recorded against an FRN the device could not confirm — resolve them in the field app’s Fix Unverified Purchases screen.'),
        ])
      : null,

    el('h2', {}, 'By product'),
    m.byProduct.length
      ? table(
          ['Product', 'Purchases', 'Weight', 'Value'],
          m.byProduct.map((p) =>
            el('tr', {}, [
              el('td', {}, p.product),
              el('td', { class: 'num' }, String(p.count)),
              el('td', { class: 'num' }, formatKg(p.kg)),
              el('td', { class: 'num' }, formatUgx(p.ugx)),
            ])
          )
        )
      : el('p', { class: 'muted' }, 'No purchases yet.'),

    el('h2', {}, 'Top suppliers'),
    m.topFarmers.length
      ? table(
          ['Farmer', 'FRN', 'Weight', 'Value'],
          m.topFarmers.map((f) =>
            el('tr', {}, [
              el('td', {}, el('a', { href: '#/farmers/' + f.frn }, f.name)),
              el('td', {}, f.frn),
              el('td', { class: 'num' }, formatKg(f.kg)),
              el('td', { class: 'num' }, formatUgx(f.ugx)),
            ])
          )
        )
      : el('p', { class: 'muted' }, 'No purchases yet.')
  );
}
