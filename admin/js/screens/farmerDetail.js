import { el, mount, spinner, table, toast, formatUgx, formatKg, formatDate, formatDateTime, formatLocation, mapsLink } from '../lib/ui.js';
import { fetchFarmer, fetchPurchasesForFarmer, fetchFarmerEdits, updateFarmerAsAdmin, findFarmerByPhone } from '../lib/data.js';
import { printFarmerRecord, printPurchaseReceipt } from '../lib/print.js';
import { farmerToFieldValues } from '../shared/farmerFields.js';

/**
 * Editable fields, kept deliberately explicit rather than schema-driven.
 * The field app's form is built from the admin-editable `newFarmerFields`
 * collection because field staff need it to change without a release; this
 * tool is used by whoever maintains that schema, so a fixed, complete list
 * is clearer and can't hide a field from the person correcting the record.
 */
const EDITABLE = [
  { id: 'fullName', label: 'Full name', type: 'text', required: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: true },
  { id: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { id: 'gender', label: 'Gender', type: 'select', options: ['', 'male', 'female'] },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'village', label: 'Village', type: 'text' },
  { id: 'district', label: 'District', type: 'text' },
  { id: 'farmSize', label: 'Farm size', type: 'text' },
  { id: 'hivesTraditional', label: 'Traditional hives', type: 'number' },
  { id: 'hivesKtb', label: 'KTB hives', type: 'number' },
  { id: 'hivesModern', label: 'Modern hives', type: 'number' },
  { id: 'otherCropsOrLivestock', label: 'Other crops / livestock', type: 'text' },
  { id: 'avgHarvestKgPerYear', label: 'Average harvest (kg/yr)', type: 'number' },
  { id: 'usesChemicals', label: 'Uses chemicals', type: 'select', options: ['no', 'yes'] },
  { id: 'wantsTraining', label: 'Wants training', type: 'select', options: ['no', 'yes'] },
];

export async function renderFarmerDetail(root, { frn }) {
  mount(root, spinner('Loading farmer…'));

  let farmer;
  let purchases;
  let edits;
  try {
    farmer = await fetchFarmer(frn);
    if (!farmer) {
      mount(root, el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' not found.'));
      return;
    }
    [purchases, edits] = await Promise.all([fetchPurchasesForFarmer(frn), fetchFarmerEdits(frn)]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load this farmer: ' + (err.message || 'unknown error')));
    return;
  }

  const values = farmerToFieldValues(farmer);
  const inputs = {};
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green btn-sm' }, 'Save changes');

  const fieldNodes = EDITABLE.map((f) => {
    const initial = f.id === 'fullName' ? farmer.fullName : f.id === 'phone' ? farmer.phone : values[f.id] ?? '';
    let input;
    if (f.type === 'select') {
      input = el('select', {}, f.options.map((o) => el('option', { value: o }, o === '' ? '—' : o)));
      input.value = String(initial || (f.options.includes('no') ? 'no' : ''));
    } else {
      input = el('input', { type: f.type, value: initial ?? '' });
    }
    inputs[f.id] = input;
    return el('div', { class: 'field' }, [el('label', {}, f.label + (f.required ? ' *' : '')), input]);
  });

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;

        const fullName = inputs.fullName.value.trim();
        const phone = inputs.phone.value.trim();
        if (!fullName || !phone) {
          errorBox.textContent = 'Full name and phone are required.';
          errorBox.hidden = false;
          return;
        }

        const fieldValues = {};
        EDITABLE.forEach((f) => {
          if (f.id === 'fullName' || f.id === 'phone') return;
          fieldValues[f.id] = inputs[f.id].value;
        });
        // customFields the field app preserved but this form doesn't show -
        // carry them through untouched rather than silently dropping them.
        Object.entries(farmer.customFields || {}).forEach(([k, v]) => {
          if (!(k in fieldValues)) fieldValues[k] = v;
        });

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          if (phone !== farmer.phone) {
            const clash = await findFarmerByPhone(phone);
            if (clash && clash.frn !== farmer.frn) {
              errorBox.textContent = 'That phone number already belongs to ' + clash.fullName + ' (' + clash.frn + ').';
              errorBox.hidden = false;
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save changes';
              return;
            }
          }

          const { changed } = await updateFarmerAsAdmin({ frn: farmer.frn, fullName, phone, fieldValues, existing: farmer });
          toast(changed ? 'Changes saved.' : 'No changes to save.', changed ? 'success' : 'info');
          if (changed) renderFarmerDetail(root, { frn });
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
    [el('div', { class: 'field-grid' }, fieldNodes), errorBox, saveBtn]
  );

  const stats = farmer.lifetimeStats || {};

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, farmer.fullName || farmer.frn),
        el('p', { class: 'muted' }, farmer.frn + ' · ' + (farmer.village || '—') + ', ' + (farmer.district || '—')),
      ]),
      el('div', { class: 'head-actions' }, [
        el('a', { href: '#/farmers', class: 'btn btn-secondary btn-sm' }, 'Back'),
        el('button', { class: 'btn btn-outline btn-sm', onClick: () => printFarmerRecord(farmer, purchases) }, 'Print record'),
      ]),
    ]),

    el('div', { class: 'stat-grid' }, [
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, formatKg(stats.totalKg)), el('div', { class: 'stat-label' }, 'Lifetime delivered')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, formatUgx(stats.totalPaidUgx)), el('div', { class: 'stat-label' }, 'Total paid')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, stats.lastPurchaseAt ? formatDate(stats.lastPurchaseAt) : '—'), el('div', { class: 'stat-label' }, 'Last delivery')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, String(purchases.length)), el('div', { class: 'stat-label' }, 'Purchases')]),
    ]),

    farmer.registeredLocation
      ? el('p', { class: 'muted' }, ['Registered at ' + formatLocation(farmer.registeredLocation) + ' ', mapsLink(farmer.registeredLocation)])
      : null,

    el('h2', {}, 'Details'),
    form,

    el('h2', {}, 'Purchases'),
    purchases.length
      ? table(
          ['Date', 'Product', 'Grade', 'Weight', 'Total', 'Receipt', ''],
          purchases.map((p) =>
            el('tr', {}, [
              el('td', {}, formatDate(p.purchaseDate)),
              el('td', {}, p.product || '—'),
              el('td', {}, p.grade || '—'),
              el('td', { class: 'num' }, formatKg(p.weightKg)),
              el('td', { class: 'num' }, formatUgx(p.totalUgx)),
              el('td', {}, p.receiptNo || '—'),
              el('td', {}, el('button', { class: 'link-btn', onClick: () => printPurchaseReceipt(p, farmer) }, 'Receipt')),
            ])
          )
        )
      : el('p', { class: 'muted' }, 'No purchases recorded.'),

    el('h2', {}, 'Edit history'),
    edits.length
      ? el('div', { class: 'edit-log' }, edits.map((entry) =>
          el('div', { class: 'edit-entry' }, [
            el('div', { class: 'edit-meta' }, [
              el('strong', {}, entry.editedBy || 'Unknown'),
              el('span', {}, ' · ' + formatDateTime(entry.editedAtLocal || entry.editedAt)),
              entry.editedVia === 'admin' ? el('span', { class: 'tag' }, 'management') : el('span', { class: 'tag' }, 'field app'),
              entry.syncedFromOffline ? el('span', { class: 'tag tag-warn' }, 'made offline') : null,
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
      : el('p', { class: 'muted' }, 'No edits recorded for this farmer.')
  );
}
