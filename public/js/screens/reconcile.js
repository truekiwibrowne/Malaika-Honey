import { el, mount, toast } from '../lib/ui.js';
import { getUnverifiedPurchases, resolveUnverifiedPurchase, searchFarmers } from '../lib/db.js';
import { formatUgx, formatDate, productLabel } from '../lib/constants.js';
import { iconEl } from '../lib/icons.js';

let debounceTimer = null;

function renderPurchaseRow(purchase, onResolved) {
  const resultsBox = el('div', { class: 'field', style: 'gap:6px' });

  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Search the correct FRN or name',
    onInput: (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value;
      debounceTimer = setTimeout(() => runSearch(value), 300);
    },
  });

  async function runSearch(value) {
    if (!value || value.trim().length < 2) {
      resultsBox.replaceChildren();
      return;
    }
    resultsBox.replaceChildren(el('p', { class: 'hint' }, 'Searching…'));
    try {
      const farmers = await searchFarmers(value);
      if (!farmers.length) {
        resultsBox.replaceChildren(el('div', { class: 'empty-state' }, 'No match. Register the farmer first, then come back here.'));
        return;
      }
      resultsBox.replaceChildren(
        ...farmers.map((f) =>
          el(
            'button',
            {
              type: 'button',
              class: 'result-item',
              onClick: async () => {
                try {
                  await resolveUnverifiedPurchase(purchase.id, f.frn);
                  toast('Purchase linked to ' + f.fullName + '.');
                  onResolved();
                } catch (err) {
                  console.error(err);
                  toast('Could not link this purchase. ' + (err.message || 'Try again.'));
                }
              },
            },
            [el('span', { class: 'name' }, f.fullName), el('span', { class: 'sub' }, f.village + ' · ' + f.frn)]
          )
        )
      );
    } catch (err) {
      console.error(err);
      resultsBox.replaceChildren(el('div', { class: 'empty-state' }, 'Search failed. Check your connection and try again.'));
    }
  }

  return el('div', { class: 'card' }, [
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, 'Typed FRN'),
      el('span', {}, purchase.originalTypedFrn || purchase.frn),
    ]),
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, 'Purchase'),
      el('span', {}, productLabel(purchase.product) + ' — ' + purchase.weightKg + ' kg'),
    ]),
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, 'Date · Total'),
      el('span', {}, formatDate(purchase.purchaseDate) + ' · ' + formatUgx(purchase.totalUgx)),
    ]),
    el('div', { class: 'field' }, [el('label', {}, 'Find the correct farmer'), searchInput]),
    resultsBox,
  ]);
}

export async function renderReconcile(root) {
  mount(root, el('p', { class: 'hint' }, 'Loading unverified purchases…'));

  async function load() {
    const purchases = await getUnverifiedPurchases();
    if (!purchases.length) {
      mount(
        root,
        el('div', { class: 'centered-screen' }, [
          el('h1', {}, 'Fix Unverified Purchases'),
          el('div', { class: 'confirm-icon' }, [iconEl('check')]),
          el('div', { class: 'empty-state' }, 'Nothing to fix — every purchase is matched to a farmer.'),
        ])
      );
      return;
    }

    mount(
      root,
      el('h1', {}, 'Fix Unverified Purchases'),
      el('p', { class: 'welcome' }, purchases.length + ' purchase' + (purchases.length === 1 ? '' : 's') + ' saved with an FRN that wasn’t found on this device at the time. Link each one to the correct farmer.'),
      el('hr', { class: 'hr' }),
      ...purchases.map((p) => renderPurchaseRow(p, load))
    );
  }

  await load();
}
