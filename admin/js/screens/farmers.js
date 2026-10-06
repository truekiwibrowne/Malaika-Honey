import { el, mount, spinner, table, formatKg, formatDate, hashQuery, exportButtons } from '../lib/ui.js';
import { fetchAllFarmers, loadDistrictResolver } from '../lib/data.js';
import { printFarmerRegister } from '../lib/print.js';
import { exportFarmers } from '../lib/exporters.js';
import { REGIONS, UNKNOWN_REGION } from '../lib/geo.js';
import { registeredIso } from '../lib/stats.js';
import { loadCollection } from '../lib/refdata.js';

const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', merged: 'Merged' };

export function statusTag(farmer) {
  const s = farmer.status || 'active';
  if (s === 'active') return null;
  return el('span', { class: 'tag ' + (s === 'merged' ? 'tag-muted' : 'tag-warn') }, s === 'merged' ? 'merged → ' + farmer.mergedInto : STATUS_LABELS[s] || s);
}

export async function renderFarmers(root) {
  mount(root, spinner('Loading farmers…'));
  let farmers;
  let resolveDistrict = () => null;
  try {
    const [list, geoCtx] = await Promise.all([fetchAllFarmers(), loadDistrictResolver().catch(() => null)]);
    farmers = list;
    if (geoCtx) resolveDistrict = geoCtx.resolveDistrict;
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load farmers: ' + (err.message || 'unknown error')));
    return;
  }

  const params = hashQuery();
  const regionOf = (f) => resolveDistrict(f.district)?.region || UNKNOWN_REGION;

  const searchInput = el('input', { type: 'search', placeholder: 'Name, FRN, phone or village', value: params.get('q') || '' });
  const regionSelect = el('select', { 'aria-label': 'Region' }, [
    el('option', { value: '' }, 'All regions'),
    ...REGIONS.map((r) => el('option', { value: r }, r)),
    el('option', { value: UNKNOWN_REGION }, 'District not recognised'),
  ]);
  regionSelect.value = params.get('region') || '';
  const districts = [...new Set(farmers.map((f) => f.district).filter(Boolean))].sort();
  const districtSelect = el('select', { 'aria-label': 'District' }, [
    el('option', { value: '' }, 'All districts'),
    ...districts.map((d) => el('option', { value: d }, d)),
  ]);
  // A district link from the map uses the canonical name; match the
  // farmers' own spelling of it if it differs.
  const wanted = params.get('district');
  if (wanted) districtSelect.value = districts.find((d) => d === wanted) || districts.find((d) => resolveDistrict(d)?.name === wanted) || '';
  const statusSelect = el('select', { 'aria-label': 'Status' }, [
    el('option', { value: 'current' }, 'Active & inactive'),
    el('option', { value: 'active' }, 'Active only'),
    el('option', { value: 'inactive' }, 'Inactive only'),
    el('option', { value: 'merged' }, 'Merged duplicates'),
    el('option', { value: 'all' }, 'All records'),
  ]);
  statusSelect.value = params.get('status') || 'current';
  const importId = params.get('import');

  const countLabel = el('span', { class: 'muted' });
  const results = el('div');

  function filtered() {
    const q = searchInput.value.trim().toLowerCase();
    const status = statusSelect.value;
    const wantDistrict = districtSelect.value;
    return farmers.filter((f) => {
      const s = f.status || 'active';
      if (status === 'current' && s === 'merged') return false;
      if (['active', 'inactive', 'merged'].includes(status) && s !== status) return false;
      if (importId && f.importId !== importId) return false;
      if (regionSelect.value && regionOf(f) !== regionSelect.value) return false;
      // Same district even if spelt differently ("Sembabule" / "Ssembabule").
      if (wantDistrict && f.district !== wantDistrict) {
        const name = resolveDistrict(f.district)?.name;
        if (!name || name !== resolveDistrict(wantDistrict)?.name) return false;
      }
      if (!q) return true;
      return [f.fullName, f.frn, f.phone, f.village].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function render() {
    const list = filtered();
    const shown = list.slice(0, 1000);
    countLabel.textContent = list.length + ' of ' + farmers.filter((f) => f.status !== 'merged').length + ' farmers' + (list.length > shown.length ? ' (first 1,000 shown - export for all)' : '');
    mount(results, 
      list.length
        ? table(
            ['FRN', 'Name', 'Phone', 'Village', 'District', 'Region', 'Lifetime', 'Registered', ''],
            shown.map((f) =>
              el('tr', { class: f.status === 'merged' ? 'row-muted' : '' }, [
                el('td', {}, el('a', { href: '#/farmers/' + f.frn }, f.frn)),
                el('td', {}, f.fullName || '—'),
                el('td', {}, f.phone || '—'),
                el('td', {}, f.village || '—'),
                el('td', {}, f.district || '—'),
                el('td', {}, resolveDistrict(f.district)?.region || el('span', { class: 'muted' }, '—')),
                el('td', { class: 'num' }, formatKg(f.lifetimeStats?.totalKg)),
                el('td', {}, formatDate(registeredIso(f))),
                el('td', {}, statusTag(f)),
              ])
            )
          )
        : el('div', { class: 'empty-state' }, 'No farmers match those filters.')
    );
  }

  [searchInput].forEach((n) => n.addEventListener('input', render));
  [regionSelect, districtSelect, statusSelect].forEach((n) => n.addEventListener('change', render));

  function filterSummary() {
    const parts = [];
    if (searchInput.value.trim()) parts.push('matching “' + searchInput.value.trim() + '”');
    if (regionSelect.value) parts.push(regionSelect.value + ' region');
    if (districtSelect.value) parts.push('in ' + districtSelect.value);
    if (statusSelect.value !== 'current') parts.push(statusSelect.options[statusSelect.selectedIndex].text.toLowerCase());
    if (importId) parts.push('from import ' + importId);
    return parts.length ? 'Farmers ' + parts.join(', ') : 'All farmers';
  }

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('h1', {}, 'Farmers'),
      el('div', { class: 'head-actions' }, [
        ...exportButtons(async (format) => exportFarmers(filtered(), format, { resolveDistrict, cropsLivestock: (await loadCollection('cropsLivestock')).entries })),
        el('button', { class: 'btn btn-outline btn-sm', onClick: () => printFarmerRegister(filtered(), filterSummary()) }, 'Print register'),
      ]),
    ]),
    importId
      ? el('div', { class: 'notice' }, ['Showing farmers added by import ', el('strong', {}, importId), '. ', el('a', { href: '#/farmers' }, 'Show all')])
      : null,
    el('div', { class: 'filter-bar' }, [searchInput, regionSelect, districtSelect, statusSelect, countLabel]),
    results
  );

  render();
}
