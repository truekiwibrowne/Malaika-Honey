import { el, mount, spinner, table, toast, formatUgx, formatKg, formatDate, formatDateTime, formatLocation, mapsLink, openDialog, hashQuery } from '../lib/ui.js';
import { fetchFarmer, fetchPurchasesForFarmer, fetchFarmerEdits, updateFarmerAsAdmin, findFarmerByPhone, setFarmerStatus, loadDistrictResolver } from '../lib/data.js';
import { loadCollection } from '../lib/refdata.js';
import { navigate } from '../router.js';
import { openMergeDialog } from './mergeDialog.js';
import { statusTag } from './farmers.js';
import { printFarmerRecord, printPurchaseReceipt } from '../lib/print.js';
import { farmerToFieldValues } from '../shared/farmerFields.js';
import { pickLocation, renderMiniMap, formatPoint, isValidPoint } from '../shared/mapPicker.js';

/**
 * Editable fields, kept deliberately explicit rather than schema-driven.
 * The field app's form is built from the admin-editable `newFarmerFields`
 * collection because field staff need it to change without a release; this
 * tool is used by whoever maintains that schema, so a fixed, complete list
 * is clearer and can't hide a field from the person correcting the record.
 * District, village and farm size are dropdowns from their Settings lists;
 * admin-added questions are appended from the form schema (see below).
 */
const EDITABLE = [
  { id: 'fullName', label: 'Full name', type: 'text', required: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: true },
  { id: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { id: 'gender', label: 'Gender', type: 'select', options: ['', 'male', 'female'] },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'district', label: 'District', type: 'district' },
  { id: 'village', label: 'Village', type: 'village' },
  { id: 'farmSize', label: 'Farm size', type: 'farmSize' },
  { id: 'hivesTraditional', label: 'Traditional hives', type: 'number' },
  { id: 'hivesKtb', label: 'KTB hives', type: 'number' },
  { id: 'hivesModern', label: 'Modern hives', type: 'number' },
  { id: 'otherCropsOrLivestock', label: 'Other crops / livestock (not listed)', type: 'text' },
  { id: 'avgHarvestKgPerYear', label: 'Average harvest (kg/yr)', type: 'number' },
  { id: 'usesChemicals', label: 'Uses chemicals', type: 'select', options: ['no', 'yes'] },
  { id: 'wantsTraining', label: 'Wants training', type: 'select', options: ['no', 'yes'] },
];
const BUILT_IN_IDS = new Set(['dateOfBirth', 'gender', 'email', 'village', 'district', 'farmSize', 'hivesTraditional', 'hivesKtb', 'hivesModern', 'otherCropsOrLivestock', 'avgHarvestKgPerYear', 'usesChemicals', 'wantsTraining', 'farmLocation', 'cropsLivestock']);

/** Edit-history value as people read it. */
const showValue = (v) => (v === true ? 'yes' : v === false ? 'no' : v === null || v === undefined || v === '' ? '—' : String(v));

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** A <select> of list options that keeps a stored value not on the list (marked as such). */
function listSelect(options, current, emptyLabel = '—') {
  const known = options.some((o) => same(o.value, current));
  const select = el('select', {}, [
    el('option', { value: '' }, emptyLabel),
    ...(current && !known ? [el('option', { value: current }, current + ' (not on list)')] : []),
    ...options.map((o) => el('option', { value: o.value }, o.label)),
  ]);
  select.value = known ? options.find((o) => same(o.value, current)).value : current || '';
  return select;
}

export async function renderFarmerDetail(root, { frn }) {
  mount(root, spinner('Loading farmer…'));

  let farmer;
  let purchases;
  let edits;
  let lists;
  let geoCtx = null;
  try {
    farmer = await fetchFarmer(frn);
    if (!farmer) {
      mount(root, el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' not found.'));
      return;
    }
    const entries = (name) => loadCollection(name).then((r) => r.entries).catch(() => []);
    let districts, villages, farmSizes, formFields, crops;
    [purchases, edits, districts, villages, farmSizes, formFields, crops, geoCtx] = await Promise.all([
      fetchPurchasesForFarmer(frn),
      fetchFarmerEdits(frn),
      entries('districts'),
      entries('villages'),
      entries('farmSizes'),
      entries('newFarmerFields'),
      entries('cropsLivestock'),
      loadDistrictResolver().catch(() => null),
    ]);
    lists = { districts, villages, farmSizes, formFields, crops };
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load this farmer: ' + (err.message || 'unknown error')));
    return;
  }

  const values = farmerToFieldValues(farmer);
  const inputs = {};
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green btn-sm' }, 'Save changes');

  const districtOptions = lists.districts.filter((d) => d.active !== false && d.id !== 'Other').map((d) => ({ value: d.id, label: d.label || d.id }));
  const villageHost = el('div', { class: 'village-host' });
  // Village choices follow the district chosen, like the field app's form.
  function renderVillage(district, current) {
    const options = lists.villages
      .filter((v) => v.active !== false && same(v.district, district))
      .map((v) => ({ value: v.label, label: v.label }));
    const input = options.length ? listSelect(options, current) : el('input', { type: 'text', value: current || '', placeholder: 'No villages listed for this district - type it' });
    inputs.village = input;
    mount(villageHost, input);
  }

  // Admin-added questions (Settings -> Registration form), answers in customFields.
  const customDefs = lists.formFields.filter((f) => !BUILT_IN_IDS.has(f.id) && f.type !== 'location' && f.type !== 'cropsLivestock');
  const customKeys = new Set([...customDefs.map((f) => f.id), ...Object.keys(farmer.customFields || {})]);

  const fieldNodes = EDITABLE.map((f) => {
    const initial = f.id === 'fullName' ? farmer.fullName : f.id === 'phone' ? farmer.phone : values[f.id] ?? '';
    let input;
    if (f.type === 'district') {
      input = listSelect(districtOptions, initial);
      input.addEventListener('change', () => renderVillage(input.value, ''));
    } else if (f.type === 'village') {
      renderVillage(values.district, initial);
      return el('div', { class: 'field' }, [el('label', {}, f.label), villageHost]);
    } else if (f.type === 'farmSize') {
      input = listSelect(lists.farmSizes.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.label })), initial);
    } else if (f.type === 'select') {
      input = el('select', {}, f.options.map((o) => el('option', { value: o }, o === '' ? '—' : o)));
      input.value = String(initial || (f.options.includes('no') ? 'no' : ''));
    } else {
      input = el('input', { type: f.type, value: initial ?? '' });
    }
    inputs[f.id] = input;
    return el('div', { class: 'field' }, [el('label', {}, f.label + (f.required ? ' *' : '')), input]);
  });

  for (const key of customKeys) {
    const def = customDefs.find((f) => f.id === key) || { id: key, label: key, type: 'text' };
    const current = (farmer.customFields || {})[key];
    let input;
    if (def.type === 'toggle') {
      input = el('select', {}, [el('option', { value: '' }, '—'), el('option', { value: 'yes' }, 'Yes'), el('option', { value: 'no' }, 'No')]);
      input.value = current === true ? 'yes' : current === false ? 'no' : current || '';
    } else if (def.type === 'select' || def.type === 'choice') {
      input = listSelect((def.options || []).map((o) => ({ value: o.id, label: o.label })), current ?? '');
    } else {
      input = el('input', { type: ['number', 'date', 'email', 'tel'].includes(def.type) ? def.type : 'text', value: current ?? '' });
    }
    inputs['custom:' + key] = input;
    fieldNodes.push(el('div', { class: 'field' }, [el('label', {}, def.label + (def.active === false ? ' (no longer asked)' : '')), input]));
  }

  /** Saves a set of field changes on top of everything already stored. */
  async function saveFields(changes) {
    const fieldValues = { ...farmerToFieldValues(farmer), ...changes };
    return updateFarmerAsAdmin({ frn: farmer.frn, fullName: farmer.fullName, phone: farmer.phone, fieldValues, existing: farmer });
  }

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

        // Start from everything stored (farm location, crops, answers to
        // questions not shown here) so saving this form can't wipe them.
        const fieldValues = { ...farmerToFieldValues(farmer) };
        EDITABLE.forEach((f) => {
          if (f.id === 'fullName' || f.id === 'phone') return;
          fieldValues[f.id] = inputs[f.id].value;
        });
        for (const key of customKeys) fieldValues[key] = inputs['custom:' + key].value;

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

  // ---------------------------------------------------------- farm location
  const farmLoc = isValidPoint(farmer.farmLocation) ? farmer.farmLocation : null;
  const regLoc = farmer.registeredLocation && isValidPoint(farmer.registeredLocation) ? farmer.registeredLocation : null;
  const districtPos = geoCtx ? geoCtx.resolveDistrict(farmer.district) : null;
  const miniMap = el('div', { class: 'mini-map' });
  const setLocBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, farmLoc ? 'Change on map' : 'Set on map');
  setLocBtn.addEventListener('click', async () => {
    const picked = await pickLocation({
      title: 'Farm location - ' + farmer.fullName,
      initial: farmLoc,
      near: regLoc ? { lat: regLoc.lat, lng: regLoc.lng, zoom: 13 } : districtPos && districtPos.lat != null ? { lat: districtPos.lat, lng: districtPos.lng, zoom: 10 } : null,
      help: 'Search the village, or click the farm on the map, then drag the pin to the exact spot.',
    });
    if (!picked) return;
    try {
      await saveFields({ farmLocation: { lat: picked.lat, lng: picked.lng } });
      toast('Farm location saved.', 'success');
      renderFarmerDetail(root, { frn });
    } catch (err) {
      toast('Could not save: ' + err.message, 'error');
    }
  });
  const clearLocBtn = farmLoc
    ? el('button', {
        type: 'button',
        class: 'btn btn-outline-danger btn-sm',
        onClick: async () => {
          await saveFields({ farmLocation: null });
          toast('Farm location removed.');
          renderFarmerDetail(root, { frn });
        },
      }, 'Remove')
    : null;
  const locationSection = el('section', { class: 'panel farm-location' }, [
    el('div', { class: 'farm-location-text' }, [
      el('h3', {}, 'Farm location'),
      farmLoc
        ? el('p', {}, [el('strong', {}, formatPoint(farmLoc)), ' ', mapsLink(farmLoc)])
        : el('p', { class: 'muted' }, 'Not recorded yet.' + (regLoc ? ' The grey dot is where staff were when they registered this farmer - not necessarily the farm.' : '')),
      regLoc ? el('p', { class: 'muted small' }, 'Registered at ' + formatLocation(regLoc)) : null,
      el('div', { class: 'head-actions' }, [setLocBtn, clearLocBtn]),
    ]),
    farmLoc || regLoc ? miniMap : el('div', { class: 'mini-map mini-map-empty' }, 'No location yet'),
  ]);

  // ------------------------------------------------------- crops & livestock
  const cropItems = lists.crops.filter((c) => c.active !== false || (farmer.cropsLivestock || {})[c.id] !== undefined);
  const cropState = { ...(farmer.cropsLivestock || {}) };
  const cropSave = el('button', { type: 'button', class: 'btn btn-green btn-sm', disabled: true }, 'Save crops & livestock');
  const cropRows = (kind) => cropItems.filter((c) => (c.kind || 'crop') === kind).map((c) => {
    const box = el('input', { type: 'checkbox', checked: c.id in cropState });
    const qty = el('input', { type: 'number', min: '0', step: 'any', 'aria-label': c.label + ' (' + (c.unit || '') + ')', value: typeof cropState[c.id] === 'number' ? cropState[c.id] : '', disabled: !(c.id in cropState) || !c.unit });
    const update = () => {
      if (box.checked) cropState[c.id] = Number(qty.value) > 0 ? Number(qty.value) : true;
      else delete cropState[c.id];
      qty.disabled = !box.checked || !c.unit;
      cropSave.disabled = JSON.stringify(cropState) === JSON.stringify(farmer.cropsLivestock || {});
    };
    box.addEventListener('change', update);
    qty.addEventListener('input', update);
    return el('label', { class: 'crop-row' }, [box, el('span', {}, c.label), c.unit ? qty : null, c.unit ? el('span', { class: 'muted small' }, c.unit) : null]);
  });
  // Items on the record that are no longer on the list still show.
  const unknownCrops = Object.keys(farmer.cropsLivestock || {}).filter((id) => !lists.crops.some((c) => c.id === id));
  cropSave.addEventListener('click', async () => {
    cropSave.disabled = true;
    try {
      await saveFields({ cropsLivestock: cropState });
      toast('Crops & livestock saved.', 'success');
      renderFarmerDetail(root, { frn });
    } catch (err) {
      toast('Could not save: ' + err.message, 'error');
      cropSave.disabled = false;
    }
  });
  const cropsSection = el('section', { class: 'panel' }, [
    el('h3', {}, 'Crops & livestock'),
    cropItems.length
      ? el('div', { class: 'crops-grid' }, [
          el('div', {}, [el('h4', {}, 'Crops'), ...cropRows('crop')]),
          el('div', {}, [el('h4', {}, 'Livestock'), ...cropRows('livestock')]),
        ])
      : el('p', { class: 'muted' }, ['No crops or livestock are listed yet - add them in ', el('a', { href: '#/settings?tab=cropsLivestock' }, 'Settings → Crops & livestock'), '.']),
    unknownCrops.length ? el('p', { class: 'muted small' }, 'Also recorded (no longer on the list): ' + unknownCrops.map((id) => id + (cropState[id] === true ? '' : ' ' + cropState[id])).join(', ')) : null,
    farmer.otherCropsOrLivestock ? el('p', { class: 'muted small' }, 'Other (typed): ' + farmer.otherCropsOrLivestock) : null,
    el('div', { class: 'panel-actions' }, [cropSave]),
  ]);

  const stats = farmer.lifetimeStats || {};
  const status = farmer.status || 'active';
  const merged = status === 'merged';

  // A merged record is history only - its purchases now live on the kept
  // record, so editing it here would edit a farmer nobody uses.
  if (merged) {
    [form, locationSection, cropsSection].forEach((node) => node.querySelectorAll('input, select, button').forEach((n) => (n.disabled = true)));
  }

  async function changeStatus(next) {
    const reason = await openDialog(next === 'inactive' ? 'Deactivate farmer' : 'Reactivate farmer', (close) => {
      const input = el('input', { type: 'text', placeholder: next === 'inactive' ? 'e.g. Stopped beekeeping, moved away, deceased' : 'Optional' });
      return [
        el('p', {}, next === 'inactive'
          ? farmer.fullName + ' will be marked inactive. Nothing is deleted - their purchases and totals stay, and they can be reactivated at any time. Field staff see an “inactive” notice on the profile.'
          : farmer.fullName + ' will be marked active again.'),
        el('div', { class: 'field' }, [el('label', {}, 'Reason' + (next === 'inactive' ? ' *' : '')), input]),
        el('div', { class: 'dialog-actions' }, [
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => close() }, 'Cancel'),
          el('button', {
            type: 'button',
            class: 'btn btn-sm ' + (next === 'inactive' ? 'btn-danger' : 'btn-green'),
            onClick: () => {
              if (next === 'inactive' && !input.value.trim()) {
                input.focus();
                input.classList.add('invalid');
                return;
              }
              close(input.value.trim() || '');
            },
          }, next === 'inactive' ? 'Deactivate' : 'Reactivate'),
        ]),
      ];
    });
    if (reason === undefined) return;
    try {
      await setFarmerStatus(farmer, next, reason);
      toast(next === 'inactive' ? 'Farmer deactivated.' : 'Farmer reactivated.', 'success');
      renderFarmerDetail(root, { frn });
    } catch (err) {
      console.error(err);
      toast('Could not update: ' + (err.message || 'please try again.'), 'error');
    }
  }

  async function startMerge(presetFrn) {
    const keptFrn = await openMergeDialog(farmer, presetFrn);
    if (!keptFrn) return;
    if (keptFrn === farmer.frn) renderFarmerDetail(root, { frn });
    else navigate('#/farmers/' + keptFrn);
  }

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, [farmer.fullName || farmer.frn, ' ', statusTag(farmer)]),
        el('p', { class: 'muted' }, farmer.frn + ' · ' + (farmer.village || '—') + ', ' + (farmer.district || '—')),
      ]),
      el('div', { class: 'head-actions' }, [
        el('a', { href: '#/farmers', class: 'btn btn-secondary btn-sm' }, 'Back'),
        el('button', { class: 'btn btn-outline btn-sm', onClick: () => printFarmerRecord(farmer, purchases) }, 'Print record'),
        merged ? null : el('button', { class: 'btn btn-outline btn-sm', onClick: () => startMerge() }, 'Merge…'),
        merged
          ? null
          : status === 'inactive'
            ? el('button', { class: 'btn btn-outline btn-sm', onClick: () => changeStatus('active') }, 'Reactivate')
            : el('button', { class: 'btn btn-outline-danger btn-sm', onClick: () => changeStatus('inactive') }, 'Deactivate'),
      ]),
    ]),

    merged
      ? el('div', { class: 'notice notice-warn' }, [
          el('strong', {}, 'Merged duplicate. '),
          'This record was merged into ',
          el('a', { href: '#/farmers/' + farmer.mergedInto }, farmer.mergedInto),
          (farmer.mergedBy ? ' by ' + farmer.mergedBy : '') + (farmer.mergedAt ? ' on ' + formatDate(farmer.mergedAt) : '') + '. Its purchases now belong to that farmer; it is kept read-only for history.',
        ])
      : status === 'inactive'
        ? el('div', { class: 'notice notice-warn' }, [
            el('strong', {}, 'Inactive. '),
            (farmer.statusReason ? farmer.statusReason + ' — ' : '') + 'marked by ' + (farmer.statusChangedBy || 'an admin') + (farmer.statusChangedAt ? ' on ' + formatDate(farmer.statusChangedAt) : '') + '.',
          ])
        : null,
    farmer.mergedFrns && farmer.mergedFrns.length
      ? el('p', { class: 'muted' }, ['Duplicates merged into this record: ', ...farmer.mergedFrns.flatMap((m, i) => [i ? ', ' : '', el('a', { href: '#/farmers/' + m }, m)])])
      : null,
    farmer.importId
      ? el('p', { class: 'muted' }, ['Added by import ', el('a', { href: '#/farmers?import=' + farmer.importId + '&status=all' }, farmer.importId), farmer.importedBy ? ' (' + farmer.importedBy + ')' : ''])
      : null,

    el('div', { class: 'stat-grid' }, [
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, formatKg(stats.totalKg)), el('div', { class: 'stat-label' }, 'Lifetime delivered')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, formatUgx(stats.totalPaidUgx)), el('div', { class: 'stat-label' }, 'Total paid')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, stats.lastPurchaseAt ? formatDate(stats.lastPurchaseAt) : '—'), el('div', { class: 'stat-label' }, 'Last delivery')]),
      el('div', { class: 'stat-card' }, [el('div', { class: 'stat-value' }, String(purchases.length)), el('div', { class: 'stat-label' }, 'Purchases')]),
    ]),


    el('div', { class: 'detail-panels' }, [locationSection, cropsSection]),

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
                el('span', { class: 'chg-from' }, showValue(c.from)),
                el('span', { class: 'chg-arrow' }, '→'),
                el('span', { class: 'chg-to' }, showValue(c.to)),
              ])
            )),
          ])
        ))
      : el('p', { class: 'muted' }, 'No edits recorded for this farmer.')
  );

  if (farmLoc || regLoc) {
    renderMiniMap(miniMap, [
      ...(regLoc && !farmLoc ? [{ ...regLoc, label: 'Where staff registered this farmer', muted: true }] : []),
      ...(farmLoc ? [{ ...farmLoc, label: 'Farm' }] : []),
      ...(regLoc && farmLoc ? [{ ...regLoc, label: 'Where staff registered this farmer', muted: true }] : []),
    ]).catch(() => mount(miniMap, el('div', { class: 'mini-map-empty' }, 'Map unavailable offline')));
  }

  // Arriving from Data checks -> likely duplicates.
  const preset = hashQuery().get('merge');
  if (preset && !merged) {
    history.replaceState(null, '', '#/farmers/' + frn);
    startMerge(preset);
  }
}
