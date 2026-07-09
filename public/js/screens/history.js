import { el, mount } from '../lib/ui.js';
import { getFarmerByFrn, getPurchaseHistory } from '../lib/db.js';
import { formatUgx, formatDate, productLabel } from '../lib/constants.js';

export async function renderHistory(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading history…'));

  const [farmer, purchases] = await Promise.all([getFarmerByFrn(frn), getPurchaseHistory(frn)]);

  const items = purchases.length
    ? purchases.map((p) =>
        el('div', { class: 'history-item' }, [
          el('div', {}, [
            el('div', { class: 'date' }, formatDate(p.purchaseDate)),
            el('div', { class: 'product' }, productLabel(p.product) + ' — ' + p.weightKg + ' kg'),
          ]),
          el('div', { class: 'amount' }, formatUgx(p.totalUgx)),
        ])
      )
    : [el('div', { class: 'empty-state' }, 'No purchases recorded yet for this farmer.')];

  mount(
    root,
    el('h1', {}, 'History'),
    el('p', { class: 'welcome' }, (farmer ? farmer.fullName : frn) + ' · ' + frn),
    el('hr', { class: 'hr' }),
    ...items
  );
}
