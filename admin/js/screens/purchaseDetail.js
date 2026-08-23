import { el, mount, spinner, toast, formatUgx, formatKg, formatDate, formatDateTime, formatLocation, mapsLink } from '../lib/ui.js';
import { fetchPurchase, fetchFarmer, updatePurchaseAsAdmin, fetchPurchaseEdits } from '../lib/data.js';
import { printPurchaseReceipt } from '../lib/print.js';

const FIELDS = [
  { id: 'purchaseDate', label: 'Date', type: 'date' },
  { id: 'product', label: 'Product', type: 'text' },
  { id: 'grade', label: 'Grade', type: 'text' },
  { id: 'weightKg', label: 'Weight (kg)', type: 'number', step: '0.1' },
  { id: 'pricePerKgUgx', label: 'Price per kg (UGX)', type: 'number', step: '1' },
  { id: 'paymentMethod', label: 'Payment method', type: 'text' },
  { id: 'receiptNo', label: 'Receipt No.', type: 'text' },
];

export async function renderPurchaseDetail(root, { purchaseId }) {
  mount(root, spinner('Loading purchase…'));

  let purchase;
  let farmer = null;
  let edits = [];
  try {
    purchase = await fetchPurchase(purchaseId);
    if (!purchase) {
      mount(root, el('div', { class: 'empty-state' }, 'Purchase not found.'));
      return;
    }
    [farmer, edits] = await Promise.all([
      purchase.frn ? fetchFarmer(purchase.frn) : Promise.resolve(null),
      fetchPurchaseEdits(purchaseId),
    ]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load this purchase: ' + (err.message || 'unknown error')));
    return;
  }

  const inputs = {};
  const totalPreview = el('div', { class: 'total-preview' });
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green btn-sm' }, 'Save changes');

  function refreshTotal() {
    const kg = Number(inputs.weightKg.value) || 0;
    const price = Number(inputs.pricePerKgUgx.value) || 0;
    totalPreview.replaceChildren(el('span', {}, 'Total'), el('strong', {}, formatUgx(kg * price)));
  }

  const fieldNodes = FIELDS.map((f) => {
    const input = el('input', { type: f.type, step: f.step || null, value: purchase[f.id] ?? '' });
    inputs[f.id] = input;
    if (f.id === 'weightKg' || f.id === 'pricePerKgUgx') input.addEventListener('input', refreshTotal);
    return el('div', { class: 'field' }, [el('label', {}, f.label), input]);
  });
  refreshTotal();

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        const updates = {};
        FIELDS.forEach((f) => (updates[f.id] = inputs[f.id].value));

        if (!(Number(updates.weightKg) > 0) || !(Number(updates.pricePerKgUgx) > 0)) {
          errorBox.textContent = 'Weight and price per kg must both be greater than zero.';
          errorBox.hidden = false;
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          const { changed, statsAdjusted } = await updatePurchaseAsAdmin({ purchaseId, updates, existing: purchase });
          toast(
            changed
              ? statsAdjusted
                ? 'Saved. The farmer’s lifetime totals were adjusted to match.'
                : 'Changes saved.'
              : 'No changes to save.',
            changed ? 'success' : 'info'
          );
          if (changed) renderPurchaseDetail(root, { purchaseId });
          else {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save changes';
          }
        } catch (err) {
          console.error(err);
          errorBox.textContent = 'Could not save: ' + (err.message || 'please try again.');
          errorBox.hidden = false;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save changes';
        }
      },
    },
    [el('div', { class: 'field-grid' }, fieldNodes), totalPreview, errorBox, saveBtn]
  );

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, 'Purchase'),
        el('p', { class: 'muted' }, formatDate(purchase.purchaseDate) + ' · ' + (purchase.farmerNameSnapshot || purchase.frn || '—')),
      ]),
      el('div', { class: 'head-actions' }, [
        el('a', { href: '#/purchases', class: 'btn btn-secondary btn-sm' }, 'Back'),
        farmer ? el('a', { href: '#/farmers/' + farmer.frn, class: 'btn btn-secondary btn-sm' }, 'Farmer') : null,
        el('button', { class: 'btn btn-outline btn-sm', onClick: () => printPurchaseReceipt(purchase, farmer) }, 'Print receipt'),
      ]),
    ]),

    purchase.frnUnverified
      ? el('div', { class: 'notice notice-warn' }, [
          el('strong', {}, 'Not matched to a farmer. '),
          el('span', {}, 'This was recorded against FRN ' + (purchase.originalTypedFrn || purchase.frn) + ', which the device could not confirm at the time. Editing it here will not update any farmer’s lifetime totals until it is reconciled in the field app.'),
        ])
      : null,

    el('h2', {}, 'Details'),
    form,

    el('h2', {}, 'Record information'),
    el('dl', { class: 'meta-list' }, [
      el('dt', {}, 'Recorded by'), el('dd', {}, purchase.recordedBy || '—'),
      el('dt', {}, 'Recorded at'), el('dd', {}, formatDateTime(purchase.createdAt)),
      el('dt', {}, 'Saved offline'), el('dd', {}, purchase.syncedFromOffline ? 'Yes' : 'No'),
      el('dt', {}, 'Location'),
      el('dd', {}, purchase.recordedLocation ? [formatLocation(purchase.recordedLocation) + ' ', mapsLink(purchase.recordedLocation)] : 'Not captured'),
    ]),

    el('h2', {}, 'Edit history'),
    edits.length
      ? el('div', { class: 'edit-log' }, edits.map((entry) =>
          el('div', { class: 'edit-entry' }, [
            el('div', { class: 'edit-meta' }, [
              el('strong', {}, entry.editedBy || 'Unknown'),
              el('span', {}, ' · ' + formatDateTime(entry.editedAtLocal || entry.editedAt)),
            ]),
            el('ul', { class: 'edit-changes' }, (entry.changes || []).map((c) =>
              el('li', {}, [
                el('span', { class: 'chg-label' }, c.label || c.field),
                el('span', { class: 'chg-from' }, String(c.from ?? '—')),
                el('span', { class: 'chg-arrow' }, '→'),
                el('span', { class: 'chg-to' }, String(c.to ?? '—')),
              ])
            )),
          ])
        ))
      : el('p', { class: 'muted' }, 'No edits recorded for this purchase.')
  );
}
