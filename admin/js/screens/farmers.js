import { el, mount, spinner, table, formatUgx, formatKg, formatDate } from '../lib/ui.js';
import { fetchAllFarmers } from '../lib/data.js';
import { printFarmerRegister } from '../lib/print.js';

let cache = null;

export async function renderFarmers(root) {
  mount(root, spinner('Loading farmers…'));
  try {
    cache = await fetchAllFarmers();
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load farmers: ' + (err.message || 'unknown error')));
    return;
  }

  const searchInput = el('input', { type: 'search', placeholder: 'Name, FRN, phone or village' });
  const districtSelect = el('select', {}, [
    el('option', { value: '' }, 'All districts'),
    ...[...new Set(cache.map((f) => f.district).filter(Boolean))].sort().map((d) => el('option', { value: d }, d)),
  ]);
  const countLabel = el('span', { class: 'muted' });
  const results = el('div');

  function filtered() {
    const q = searchInput.value.trim().toLowerCase();
    const district = districtSelect.value;
    return cache.filter((f) => {
      if (district && f.district !== district) return false;
      if (!q) return true;
      return [f.fullName, f.frn, f.phone, f.village].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function render() {
    const list = filtered();
    countLabel.textContent = list.length + ' of ' + cache.length + ' farmers';
    results.replaceChildren(
      list.length
        ? table(
            ['FRN', 'Name', 'Phone', 'Village', 'District', 'Lifetime', 'Registered'],
            list.map((f) =>
              el('tr', {}, [
                el('td', {}, el('a', { href: '#/farmers/' + f.frn }, f.frn)),
                el('td', {}, f.fullName || '—'),
                el('td', {}, f.phone || '—'),
                el('td', {}, f.village || '—'),
                el('td', {}, f.district || '—'),
                el('td', { class: 'num' }, formatKg(f.lifetimeStats?.totalKg)),
                el('td', {}, formatDate(f.registeredAt)),
              ])
            )
          )
        : el('div', { class: 'empty-state' }, 'No farmers match those filters.')
    );
  }

  searchInput.addEventListener('input', render);
  districtSelect.addEventListener('change', render);

  function filterSummary() {
    const parts = [];
    if (searchInput.value.trim()) parts.push('matching “' + searchInput.value.trim() + '”');
    if (districtSelect.value) parts.push('in ' + districtSelect.value);
    return parts.length ? 'Farmers ' + parts.join(', ') : 'All farmers';
  }

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('h1', {}, 'Farmers'),
      el('button', { class: 'btn btn-outline btn-sm', onClick: () => printFarmerRegister(filtered(), filterSummary()) }, 'Print register'),
    ]),
    el('div', { class: 'filter-bar' }, [searchInput, districtSelect, countLabel]),
    results
  );

  render();
}
