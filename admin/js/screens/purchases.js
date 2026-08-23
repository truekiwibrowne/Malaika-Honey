import { el, mount, spinner, table, formatUgx, formatKg, formatDate } from '../lib/ui.js';
import { fetchAllPurchases } from '../lib/data.js';
import { printPurchaseReport } from '../lib/print.js';

let cache = null;

export async function renderPurchases(root) {
  mount(root, spinner('Loading purchases…'));
  try {
    cache = await fetchAllPurchases();
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load purchases: ' + (err.message || 'unknown error')));
    return;
  }

  const searchInput = el('input', { type: 'search', placeholder: 'Farmer, FRN or receipt no.' });
  const fromInput = el('input', { type: 'date', 'aria-label': 'From date' });
  const toInput = el('input', { type: 'date', 'aria-label': 'To date' });
  const productSelect = el('select', {}, [
    el('option', { value: '' }, 'All products'),
    ...[...new Set(cache.map((p) => p.product).filter(Boolean))].sort().map((p) => el('option', { value: p }, p)),
  ]);
  const recordedBySelect = el('select', {}, [
    el('option', { value: '' }, 'All offices'),
    ...[...new Set(cache.map((p) => p.recordedBy).filter(Boolean))].sort().map((r) => el('option', { value: r }, r)),
  ]);
  const unverifiedOnly = el('input', { type: 'checkbox', id: 'unverified-only' });

  const summary = el('div', { class: 'result-summary' });
  const results = el('div');

  function filtered() {
    const q = searchInput.value.trim().toLowerCase();
    return cache.filter((p) => {
      const date = String(p.purchaseDate || '');
      if (fromInput.value && date < fromInput.value) return false;
      if (toInput.value && date > toInput.value) return false;
      if (productSelect.value && p.product !== productSelect.value) return false;
      if (recordedBySelect.value && p.recordedBy !== recordedBySelect.value) return false;
      if (unverifiedOnly.checked && !p.frnUnverified) return false;
      if (!q) return true;
      return [p.farmerNameSnapshot, p.frn, p.receiptNo].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function filterSummary() {
    const parts = [];
    if (fromInput.value || toInput.value) parts.push((fromInput.value || 'start') + ' to ' + (toInput.value || 'today'));
    if (productSelect.value) parts.push(productSelect.value);
    if (recordedBySelect.value) parts.push('recorded by ' + recordedBySelect.value);
    if (unverifiedOnly.checked) parts.push('unmatched only');
    if (searchInput.value.trim()) parts.push('matching “' + searchInput.value.trim() + '”');
    return parts.length ? parts.join(' · ') : 'All purchases';
  }

  function render() {
    const list = filtered();
    const kg = list.reduce((t, p) => t + (Number(p.weightKg) || 0), 0);
    const ugx = list.reduce((t, p) => t + (Number(p.totalUgx) || 0), 0);
    summary.replaceChildren(
      el('span', {}, list.length + ' of ' + cache.length + ' purchases'),
      el('strong', {}, formatKg(kg)),
      el('strong', {}, formatUgx(ugx))
    );
    results.replaceChildren(
      list.length
        ? table(
            ['Date', 'Farmer', 'FRN', 'Product', 'Grade', 'Weight', 'Total', 'Recorded by'],
            list.map((p) =>
              el('tr', { class: p.frnUnverified ? 'row-warn' : '' }, [
                el('td', {}, el('a', { href: '#/purchases/' + p.id }, formatDate(p.purchaseDate))),
                el('td', {}, p.farmerNameSnapshot || (p.frnUnverified ? '(not matched)' : '—')),
                el('td', {}, p.frn || '—'),
                el('td', {}, p.product || '—'),
                el('td', {}, p.grade || '—'),
                el('td', { class: 'num' }, formatKg(p.weightKg)),
                el('td', { class: 'num' }, formatUgx(p.totalUgx)),
                el('td', {}, p.recordedBy || '—'),
              ])
            )
          )
        : el('div', { class: 'empty-state' }, 'No purchases match those filters.')
    );
  }

  [searchInput, fromInput, toInput, productSelect, recordedBySelect, unverifiedOnly].forEach((n) =>
    n.addEventListener(n.type === 'checkbox' || n.tagName === 'SELECT' ? 'change' : 'input', render)
  );

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('h1', {}, 'Purchases'),
      el('button', { class: 'btn btn-outline btn-sm', onClick: () => printPurchaseReport(filtered(), filterSummary()) }, 'Print report'),
    ]),
    el('div', { class: 'filter-bar' }, [
      searchInput,
      fromInput,
      toInput,
      productSelect,
      recordedBySelect,
      el('label', { class: 'check', for: 'unverified-only' }, [unverifiedOnly, el('span', {}, 'Unmatched only')]),
    ]),
    summary,
    results
  );

  render();
}
