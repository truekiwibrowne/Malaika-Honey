import { el, mount, spinner, table, toast, confirmDialog, openDialog, tabs, hashQuery, formatDateTime } from '../lib/ui.js';
import { COLLECTIONS, loadCollection, saveEntries, slugFromLabel } from '../lib/refdata.js';
import { fetchStaff, fetchSignupRequests, setStaffRole, revokeStaff, resolveSignupRequest, fetchAllFarmers, createFieldOffice, createPersonAccount, restoreStaffAccess, fetchCollection } from '../lib/data.js';
import { officeIdToEmail } from '../shared/officeAccounts.js';
import { fetchAudit } from '../lib/audit.js';
import { currentAdminEmail } from '../lib/auth.js';
import { REGIONS, loadUgandaGeo, makeDistrictResolver } from '../lib/geo.js';
import { pickLocation } from '../shared/mapPicker.js';
import { navigate } from '../router.js';

const TABS = [
  { key: 'products', label: 'Products' },
  { key: 'grades', label: 'Grades' },
  { key: 'paymentMethods', label: 'Payment methods' },
  { key: 'farmSizes', label: 'Farm sizes' },
  { key: 'districts', label: 'Districts' },
  { key: 'villages', label: 'Villages' },
  { key: 'fieldOffices', label: 'Field offices' },
  { key: 'newFarmerFields', label: 'Registration form' },
  { key: 'cropsLivestock', label: 'Crops & livestock' },
  { key: 'staff', label: 'Staff access' },
  { key: 'activity', label: 'Activity log' },
];

// Field ids the field app maps onto fixed farmer fields (farmerFields.js
// KNOWN_FIELD_IDS). Their type and options can't change without breaking
// how existing answers are stored, so only their wording/order/visibility
// is editable.
const BUILT_IN_FIELDS = ['dateOfBirth', 'gender', 'email', 'village', 'district', 'farmSize', 'hivesTraditional', 'hivesKtb', 'hivesModern', 'otherCropsOrLivestock', 'avgHarvestKgPerYear', 'usesChemicals', 'wantsTraining', 'farmLocation', 'cropsLivestock'];
// Types an admin can give a new question. 'location' and 'cropsLivestock'
// exist only as the built-in Farm location / Crops and livestock questions.
const FIELD_TYPES = ['toggle', 'choice', 'select', 'text', 'number', 'date', 'tel', 'email'];
const TYPE_LABELS = {
  toggle: 'Yes / No',
  choice: 'Pick one (buttons)',
  select: 'Pick one (dropdown)',
  text: 'Short text',
  number: 'Number',
  date: 'Date',
  tel: 'Phone number',
  email: 'Email address',
  location: 'Map location (GPS)',
  cropsLivestock: 'Crops & livestock checklist',
};

export async function renderSettings(root) {
  const active = TABS.some((t) => t.key === hashQuery().get('tab')) ? hashQuery().get('tab') : 'products';
  const host = el('div', { class: 'settings-body' }, spinner());
  // Sign-in requests waiting - shown on the Staff access tab's label.
  const waiting = await fetchSignupRequests().then((r) => r.filter((x) => x.status === 'pending').length).catch(() => 0);
  mount(
    root,
    el('div', { class: 'page-head' }, [el('div', {}, [el('h1', {}, 'Settings'), el('p', { class: 'muted' }, 'The lists and options the field app uses, and who can sign in. Changes reach field phones the next time they’re online.')])]),
    tabs(TABS.map((t) => (t.key === 'staff' && waiting ? { ...t, label: t.label + ' (' + waiting + ' waiting)' } : t)), active, (key) => navigate('#/settings?tab=' + key)),
    host
  );

  try {
    if (active === 'staff') await renderStaff(host);
    else if (active === 'activity') await renderActivity(host);
    else if (active === 'newFarmerFields') await renderFormFields(host);
    else await renderList(host, active);
  } catch (err) {
    console.error(err);
    mount(host, el('div', { class: 'empty-state' }, 'Could not load: ' + (err.message || 'unknown error')));
  }
}

// ------------------------------------------------------------ simple lists

async function renderList(host, name) {
  const cfg = COLLECTIONS[name];
  const isDistricts = name === 'districts';
  const isVillages = name === 'villages';
  const needsDistricts = (cfg.columns || []).some((c) => c.type === 'district');
  const [loaded, geo, districtList] = await Promise.all([
    loadCollection(name),
    isDistricts ? loadUgandaGeo() : null,
    needsDistricts ? loadCollection('districts').then((r) => r.entries.filter((d) => d.active !== false && d.id !== 'Other')) : null,
  ]);
  const districtOptions = (districtList || []).map((d) => ({ value: d.id, label: d.label || d.id }));
  // What "auto" means for each district: the built-in 2020 district map,
  // ignoring any override - so the admin sees what they'd get without one.
  const autoResolve = isDistricts ? makeDistrictResolver(geo, []) : null;
  const params = hashQuery();

  if (cfg.noCreate && !loaded.seeded) {
    mount(host,
      el('p', { class: 'muted' }, cfg.help),
      el('div', { class: 'empty-state' }, 'No offices have been added yet. Add one in Settings → Staff access → Add access; it will appear here to rename, reorder or hide.')
    );
    return;
  }

  // Working copies; `original` lets us save only what changed.
  const original = new Map(loaded.entries.map((e) => [e.id, JSON.stringify(e)]));
  const entries = loaded.entries.map((e) => ({ ...e }));
  const saveBtn = el('button', { type: 'button', class: 'btn btn-green btn-sm', disabled: true }, 'Save changes');
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const search = isDistricts || isVillages ? el('input', { type: 'search', placeholder: isDistricts ? 'Find a district' : 'Find a village' }) : null;
  const districtFilter = isVillages ? el('select', { 'aria-label': 'District' }, [el('option', { value: '' }, 'All districts'), ...districtOptions.map((o) => el('option', { value: o.value }, o.label))]) : null;
  const issuesOnly = isDistricts ? el('input', { type: 'checkbox', id: 'district-issues', checked: params.get('issues') === '1' }) : null;
  const tbodyHost = el('div');

  const dirty = () => entries.filter((e) => original.get(e.id) !== JSON.stringify(e));
  const refreshSave = () => {
    const n = dirty().length;
    saveBtn.disabled = !n;
    saveBtn.textContent = n ? 'Save ' + n + ' change' + (n === 1 ? '' : 's') : 'Save changes';
  };

  // A district needs attention when its region is "auto" and auto can't
  // place it (Data checks counts these), or it has no map position at all.
  const districtProblem = (e) => {
    if (e.active === false || e.id === 'Other') return null;
    const auto = autoResolve(e.label || e.id);
    const hasPos = (typeof e.lat === 'number' && typeof e.lng === 'number') || (auto && auto.lat != null);
    if (!e.region && !auto?.region) return 'Region can’t be found automatically - choose one.';
    if (!hasPos) return 'No map position - set one with Map.';
    return null;
  };

  function row(e) {
    const label = el('input', { type: 'text', value: e.label || e.name || '', 'aria-label': 'Label' });
    label.addEventListener('input', () => { e.label = label.value; refreshSave(); });
    const order = el('input', { type: 'number', step: 'any', value: e.order ?? '', class: 'w-order', 'aria-label': 'Order' });
    order.addEventListener('input', () => { e.order = order.value === '' ? null : Number(order.value); refreshSave(); });
    const act = el('input', { type: 'checkbox', checked: e.active !== false, 'aria-label': 'Shown in the field app' });
    act.addEventListener('change', () => { e.active = act.checked; refreshSave(); renderRows(); });
    const cells = [el('td', {}, label), el('td', { class: 'mono muted' }, e.id), el('td', {}, order), el('td', { class: 'center' }, act)];

    for (const col of cfg.columns || []) {
      let input;
      if (col.type === 'district') {
        const known = districtOptions.some((o) => o.value === e[col.key]);
        input = el('select', { 'aria-label': col.label }, [
          el('option', { value: '' }, '— choose —'),
          ...(e[col.key] && !known ? [el('option', { value: e[col.key] }, e[col.key] + ' (not on district list)')] : []),
          ...districtOptions.map((o) => el('option', { value: o.value }, o.label)),
        ]);
        input.value = e[col.key] || '';
        input.addEventListener('change', () => { e[col.key] = input.value; refreshSave(); });
      } else if (col.type === 'select') {
        input = el('select', { 'aria-label': col.label }, col.options.map((o) => el('option', { value: o.value }, o.label)));
        input.value = e[col.key] ?? col.default ?? '';
        input.addEventListener('change', () => { e[col.key] = input.value; refreshSave(); });
      } else {
        input = el('input', { type: 'text', value: e[col.key] ?? '', placeholder: col.placeholder || '', 'aria-label': col.label, class: 'w-unit' });
        input.addEventListener('input', () => { e[col.key] = input.value.trim(); refreshSave(); });
      }
      cells.push(el('td', {}, input));
    }

    let problemNode = null;
    if (isDistricts) {
      const auto = autoResolve(e.label || e.id);
      const region = el('select', { 'aria-label': 'Region' }, [
        el('option', { value: '' }, auto?.region ? 'Auto (' + auto.region + ')' : 'Auto - not found'),
        ...REGIONS.map((r) => el('option', { value: r }, r)),
      ]);
      region.value = e.region || '';
      region.addEventListener('change', () => { e.region = region.value || null; refreshSave(); renderRows(); });
      const posText = el('span', { class: 'small' });
      const showPos = () => {
        const custom = typeof e.lat === 'number' && typeof e.lng === 'number';
        posText.textContent = custom ? e.lat.toFixed(3) + ', ' + e.lng.toFixed(3) : auto && auto.lat != null ? 'Auto (' + auto.lat.toFixed(2) + ', ' + auto.lng.toFixed(2) + ')' : 'Not set';
        posText.className = 'small' + (custom ? '' : ' muted');
      };
      showPos();
      const mapBtn = el('button', { type: 'button', class: 'btn btn-outline btn-xs' }, 'Map');
      mapBtn.addEventListener('click', async () => {
        const custom = typeof e.lat === 'number' && typeof e.lng === 'number';
        const picked = await pickLocation({
          title: 'Position for ' + (e.label || e.id),
          initial: custom ? { lat: e.lat, lng: e.lng } : null,
          near: auto && auto.lat != null ? { lat: auto.lat, lng: auto.lng, zoom: 9 } : null,
          help: 'Search the district or its main town, or click the map at the district’s centre. This is where the district’s pin is drawn on the Regions map.',
        });
        if (!picked) return;
        e.lat = Math.round(picked.lat * 1000) / 1000;
        e.lng = Math.round(picked.lng * 1000) / 1000;
        refreshSave();
        renderRows();
      });
      const resetBtn = typeof e.lat === 'number'
        ? el('button', { type: 'button', class: 'link-btn small', onClick: () => { e.lat = null; e.lng = null; refreshSave(); renderRows(); } }, 'auto')
        : null;
      cells.push(el('td', {}, region), el('td', { class: 'pos-cell' }, [posText, mapBtn, resetBtn]));
      const problem = districtProblem(e);
      if (problem) problemNode = el('span', { class: 'tag tag-warn', title: problem }, '! ' + problem);
      cells.push(el('td', {}, problemNode));
    }
    return el('tr', { class: e.active === false ? 'row-muted' : problemNode ? 'row-warn' : '' }, cells);
  }

  function renderRows() {
    const q = search ? search.value.trim().toLowerCase() : '';
    const list = entries.filter((e) => (!q || String(e.label || e.id).toLowerCase().includes(q)) && (!issuesOnly || !issuesOnly.checked || districtProblem(e)) && (!districtFilter || !districtFilter.value || e.district === districtFilter.value));
    const headers = ['Label', 'Id', 'Order', 'Shown', ...(cfg.columns || []).map((c) => c.label), ...(isDistricts ? ['Region', 'Map position', ''] : [])];
    mount(tbodyHost,
      list.length ? table(headers, list.map(row)) : el('div', { class: 'empty-state' }, issuesOnly && issuesOnly.checked ? 'No districts need attention.' : 'Nothing matches.')
    );
  }
  if (search) search.addEventListener('input', renderRows);
  if (districtFilter) districtFilter.addEventListener('change', renderRows);
  if (issuesOnly) issuesOnly.addEventListener('change', renderRows);

  // ---- add
  const addLabel = el('input', { type: 'text', placeholder: 'New ' + cfg.title.toLowerCase().replace(/s$/, '') + ' name', value: isDistricts ? params.get('add') || '' : '' });
  const addDistrict = isVillages ? el('select', { 'aria-label': 'District' }, [el('option', { value: '' }, 'District…'), ...districtOptions.map((o) => el('option', { value: o.value }, o.label))]) : null;
  const addBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Add');
  addBtn.addEventListener('click', () => {
    const labelText = addLabel.value.trim();
    if (!labelText) return addLabel.focus();
    if (addDistrict && !addDistrict.value) {
      addDistrict.focus();
      return toast('Choose the village’s district.', 'error');
    }
    const id = cfg.idFromLabel ? cfg.idFromLabel(labelText, { district: addDistrict ? addDistrict.value : '' }) : slugFromLabel(labelText);
    if (!id || /[/]/.test(id)) {
      toast('Use letters and numbers in the name.', 'error');
      return;
    }
    if (entries.some((e) => e.id.toLowerCase() === id.toLowerCase() || (!isVillages && String(e.label).toLowerCase() === labelText.toLowerCase()))) {
      toast('“' + labelText + '” is already in the list' + (entries.find((e) => e.id.toLowerCase() === id.toLowerCase())?.active === false ? ' (hidden - tick Shown to bring it back).' : '.'), 'error');
      return;
    }
    let maxOrder = entries.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0);
    // A new district goes just before "Other", which stays last in the dropdown.
    const other = isDistricts && entries.find((e) => e.id === 'Other');
    if (other && Number(other.order) >= maxOrder) maxOrder = Number(other.order) - 1 - 1 / (entries.length + 2); // +1 below lands just under Other
    const extras = Object.fromEntries((cfg.columns || []).filter((c) => c.default !== undefined).map((c) => [c.key, c.default]));
    entries.push({ id, label: labelText, order: maxOrder + 1, active: true, ...extras, ...(isDistricts ? { country: 'UG' } : {}), ...(addDistrict ? { district: addDistrict.value } : {}) });
    addLabel.value = '';
    if (search) search.value = labelText;
    if (issuesOnly) issuesOnly.checked = false;
    renderRows();
    refreshSave();
  });

  saveBtn.addEventListener('click', async () => {
    const changed = dirty();
    const bad = changed.find((e) => !String(e.label || '').trim());
    if (bad) {
      errorBox.textContent = 'Every entry needs a label (' + bad.id + ' is blank).';
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const added = changed.filter((e) => !original.has(e.id)).map((e) => e.label);
    const summary = [added.length ? 'added ' + added.join(', ') : null, changed.length - added.length ? 'edited ' + changed.filter((e) => original.has(e.id)).map((e) => e.label).join(', ') : null].filter(Boolean).join('; ');
    try {
      await saveEntries(name, loaded, changed, summary);
      toast('Saved. Field phones pick this up next time they’re online.', 'success');
      renderList(host, name);
    } catch (err) {
      console.error(err);
      errorBox.textContent = 'Could not save: ' + (err.code === 'permission-denied' ? 'permission denied - the updated Firestore rules may not be deployed yet.' : err.message || 'please try again.');
      errorBox.hidden = false;
      refreshSave();
    }
  });

  // Build the village list from what's already on farmer records, so it
  // doesn't have to be typed from scratch. Added rows are unsaved until the
  // admin reviews them and presses Save.
  const fromFarmersBtn = isVillages ? el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Add villages already used by farmers') : null;
  if (fromFarmersBtn) fromFarmersBtn.addEventListener('click', async () => {
    fromFarmersBtn.disabled = true;
    try {
      const farmers = (await fetchAllFarmers()).filter((f) => f.status !== 'merged');
      const junk = new Set(['', 'n/a', 'na', 'none', 'unknown', '-', '--', '.', 'nil', 'other']);
      const norm = (t) => String(t || '').trim().replace(/\s+/g, ' ');
      const districtIdFor = (text) => {
        const t = norm(text).toLowerCase();
        const hit = districtOptions.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t || o.label.toLowerCase().replace(/[-\s]/g, '') === t.replace(/[-\s]/g, ''));
        return hit ? hit.value : norm(text);
      };
      let added = 0;
      let maxOrder = entries.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0);
      const seen = new Set(entries.map((e) => (e.district + '|' + e.label).toLowerCase()));
      for (const f of farmers) {
        const village = norm(f.village);
        if (junk.has(village.toLowerCase()) || !f.district) continue;
        // Title-case shouting ("OCEA" -> "Ocea"), keep everything else as written.
        const label = village === village.toUpperCase() ? village.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : village;
        const district = districtIdFor(f.district);
        const key = (district + '|' + label).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ id: cfg.idFromLabel(label, { district }), label, district, order: ++maxOrder, active: true });
        added++;
      }
      renderRows();
      refreshSave();
      toast(added ? 'Added ' + added + ' village' + (added === 1 ? '' : 's') + ' from farmer records - review them, then Save.' : 'Every village on farmer records is already listed.');
    } catch (err) {
      toast('Could not read farmers: ' + err.message, 'error');
    } finally {
      fromFarmersBtn.disabled = false;
    }
  });

  const problemCount = isDistricts ? entries.filter(districtProblem).length : 0;
  mount(host,
    el('p', { class: 'muted' }, cfg.help),
    loaded.seeded
      ? null
      : el('div', { class: 'notice' }, 'These are the built-in defaults the field app is using right now. Your first save stores the whole list, so nothing disappears from field phones.'),
    problemCount ? el('div', { class: 'notice notice-warn' }, problemCount + ' district' + (problemCount === 1 ? ' needs' : 's need') + ' a region or map position - these are counted in Data checks.') : null,
    el('p', { class: 'muted small' }, 'Untick “Shown” to retire an entry - it disappears from the field app but stays on old records. Entries are never deleted.'),
    search ? el('div', { class: 'filter-bar' }, [search, districtFilter, issuesOnly ? el('label', { class: 'check', for: 'district-issues' }, [issuesOnly, el('span', {}, 'Only districts needing attention')]) : null, fromFarmersBtn]) : null,
    cfg.noCreate ? null : el('div', { class: 'add-row' }, [addLabel, addDistrict, addBtn]),
    tbodyHost,
    errorBox,
    el('div', { class: 'panel-actions sticky-save' }, [saveBtn])
  );
  renderRows();
  if (isDistricts && params.get('add')) addLabel.focus();
}

// ------------------------------------------------------- new farmer form

function optionsToText(options) {
  return (options || []).map((o) => o.label).join('\n');
}
function textToOptions(text, previous = []) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((label) => {
    const prev = previous.find((o) => o.label.toLowerCase() === label.toLowerCase());
    return prev ? { ...prev, label } : { id: slugFromLabel(label) || label, label };
  });
}

async function renderFormFields(host) {
  const loaded = await loadCollection('newFarmerFields');
  const original = new Map(loaded.entries.map((e) => [e.id, JSON.stringify(e)]));
  const entries = loaded.entries.map((e) => ({ ...e }));
  const saveBtn = el('button', { type: 'button', class: 'btn btn-green btn-sm', disabled: true }, 'Save changes');
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const listHost = el('div', { class: 'form-fields' });
  const sections = () => [...new Set(entries.map((e) => e.section).filter(Boolean))];

  const dirty = () => entries.filter((e) => original.get(e.id) !== JSON.stringify(e));
  const refreshSave = () => {
    const n = dirty().length;
    saveBtn.disabled = !n;
    saveBtn.textContent = n ? 'Save ' + n + ' change' + (n === 1 ? '' : 's') : 'Save changes';
  };

  function card(e) {
    const builtIn = BUILT_IN_FIELDS.includes(e.id);
    const bind = (input, key, parse = (v) => v) => {
      input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
        e[key] = input.type === 'checkbox' ? input.checked : parse(input.value);
        refreshSave();
      });
      return input;
    };
    const typeChoices = FIELD_TYPES.includes(e.type) ? FIELD_TYPES : [e.type, ...FIELD_TYPES];
    // Village and District can be a dropdown from their Settings list (the
    // normal setup) or typed. Answers are the place name either way, so
    // switching never affects farmers already registered.
    const listSource = { village: 'villages', district: 'districts' }[e.id];
    const typeSelect = listSource
      ? el('select', {}, [
          el('option', { value: 'list' }, 'Dropdown from Settings → ' + (listSource === 'villages' ? 'Villages' : 'Districts')),
          el('option', { value: 'text' }, 'Typed by staff'),
        ])
      : el('select', { disabled: builtIn }, typeChoices.map((t) => el('option', { value: t }, TYPE_LABELS[t] || t)));
    typeSelect.value = listSource ? (e.optionsSource === listSource && e.type === 'select' ? 'list' : 'text') : e.type || 'text';
    const optionsBox = el('textarea', { rows: 3, placeholder: 'One option per line', disabled: builtIn && !!e.options });
    optionsBox.value = optionsToText(e.options);
    optionsBox.addEventListener('input', () => {
      e.options = textToOptions(optionsBox.value, JSON.parse(original.get(e.id) || '{}').options || []);
      refreshSave();
    });
    const optionsField = el('div', { class: 'field field-wide' }, [
      el('label', {}, 'Options' + (e.optionsSource ? ' (from the ' + e.optionsSource + ' list - edit it in its own tab)' : '')),
      e.optionsSource ? el('p', { class: 'muted small' }, 'Uses Settings → ' + (COLLECTIONS[e.optionsSource]?.title || e.optionsSource) + '.') : optionsBox,
    ]);
    const syncOptions = () => (optionsField.hidden = !['select', 'choice'].includes(e.type) || !!listSource);
    const specialNote = e.type === 'location'
      ? el('p', { class: 'muted small field-wide' }, 'Phones offer “use my current location” (works offline), a map with search, or typing coordinates. Admins can always set or correct a farm’s location on the farmer’s page here, whether or not this is shown.')
      : e.type === 'cropsLivestock'
        ? el('p', { class: 'muted small field-wide' }, ['The items come from ', el('a', { href: '#/settings?tab=cropsLivestock' }, 'Settings → Crops & livestock'), '. Staff tick what the farmer has and can enter how much.'])
        : null;
    typeSelect.addEventListener('change', () => {
      if (listSource) {
        if (typeSelect.value === 'list') {
          e.type = 'select';
          e.optionsSource = listSource;
        } else {
          e.type = 'text';
          delete e.optionsSource;
        }
        delete e.options;
        syncOptions();
        refreshSave();
        return;
      }
      e.type = typeSelect.value;
      if (['select', 'choice'].includes(e.type) && !e.options && !e.optionsSource) e.options = [];
      syncOptions();
      refreshSave();
    });
    syncOptions();

    const sectionInput = bind(el('input', { type: 'text', value: e.section || '', list: 'mh-sections' }), 'section');

    return el('div', { class: 'field-card' + (e.active === false ? ' inactive' : '') }, [
      el('div', { class: 'field-card-head' }, [
        el('strong', {}, e.label || e.id),
        el('span', { class: 'mono muted small' }, e.id),
        builtIn ? el('span', { class: 'tag' }, 'built-in') : el('span', { class: 'tag tag-good' }, 'custom'),
        e.active === false ? el('span', { class: 'tag tag-muted' }, 'hidden') : null,
      ]),
      el('div', { class: 'field-grid compact' }, [
        el('div', { class: 'field' }, [el('label', {}, 'Question'), bind(el('input', { type: 'text', value: e.label || '' }), 'label')]),
        el('div', { class: 'field' }, [el('label', {}, 'Section'), sectionInput]),
        el('div', { class: 'field' }, [el('label', {}, 'Answer type' + (builtIn && !listSource ? ' (fixed)' : '')), typeSelect]),
        el('div', { class: 'field' }, [el('label', {}, 'Order'), bind(el('input', { type: 'number', step: 'any', value: e.order ?? '' }), 'order', (v) => (v === '' ? null : Number(v)))]),
        el('div', { class: 'field' }, [el('label', {}, 'Hint text'), bind(el('input', { type: 'text', value: e.placeholder || '' }), 'placeholder')]),
        el('div', { class: 'field field-checks' }, [
          el('label', { class: 'check' }, [bind(el('input', { type: 'checkbox', checked: !!e.required }), 'required'), el('span', {}, 'Required')]),
          el('label', { class: 'check' }, [bind(el('input', { type: 'checkbox', checked: e.active !== false }), 'active'), el('span', {}, 'Shown')]),
        ]),
        optionsField,
        specialNote,
      ]),
    ]);
  }

  function renderCards() {
    entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    mount(listHost, el('datalist', { id: 'mh-sections' }, sections().map((s) => el('option', { value: s }))), ...entries.map(card));
  }

  const addLabel = el('input', { type: 'text', placeholder: 'e.g. “Is the farmer a member of a cooperative?”' });
  const addType = el('select', {}, FIELD_TYPES.map((t) => el('option', { value: t }, TYPE_LABELS[t])));
  addType.value = 'toggle';
  const addSection = el('input', { type: 'text', list: 'mh-sections', placeholder: 'Section', value: 'Production Details' });
  const addOptions = el('textarea', { rows: 3, placeholder: 'Answer options, one per line', hidden: true });
  const addRequired = el('input', { type: 'checkbox' });
  addType.addEventListener('change', () => (addOptions.hidden = !['select', 'choice'].includes(addType.value)));
  const addBtn = el('button', { type: 'button', class: 'btn btn-maroon btn-sm' }, 'Add question');
  addBtn.addEventListener('click', () => {
    const label = addLabel.value.trim();
    if (!label) return addLabel.focus();
    let id = slugFromLabel(label).slice(0, 40);
    if (!id) return toast('Use letters and numbers in the question.', 'error');
    if (BUILT_IN_FIELDS.includes(id) || ['fullName', 'phone'].includes(id) || entries.some((e) => e.id === id)) id += 'Custom';
    const type = addType.value;
    const options = ['select', 'choice'].includes(type) ? textToOptions(addOptions.value) : null;
    if (options && !options.length) {
      addOptions.focus();
      return toast('Add at least one answer option.', 'error');
    }
    const section = addSection.value.trim() || 'Production Details';
    // New questions go at the end of their section.
    const inSection = entries.filter((e) => e.section === section);
    const order = (inSection.length ? Math.max(...inSection.map((e) => Number(e.order) || 0)) : entries.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0)) + 0.5;
    entries.push({ id, label, type, section, order, required: addRequired.checked, active: true, ...(options ? { options } : {}) });
    addLabel.value = '';
    addOptions.value = '';
    addRequired.checked = false;
    renderCards();
    refreshSave();
    toast('Added - press Save to put it on the form.');
  });

  // Built-in questions this app version knows about but the saved form
  // doesn't have yet (a form saved before they existed won't get them on
  // its own, because a saved form replaces the defaults entirely).
  const missingHost = el('div');
  function renderMissing() {
    const missing = COLLECTIONS.newFarmerFields.defaults.filter((d) => !entries.some((e) => e.id === d.id));
    mount(missingHost, missing.length
      ? el('div', { class: 'notice' }, [
          el('strong', {}, 'Built-in questions not on your form yet: '),
          ...missing.flatMap((d) => [
            el('button', {
              type: 'button',
              class: 'btn btn-outline btn-xs',
              onClick: () => {
                entries.push({ ...d });
                renderMissing();
                renderCards();
                refreshSave();
              },
            }, '+ ' + d.label + (d.active === false ? ' (added hidden)' : '')),
            ' ',
          ]),
        ])
      : null);
  }

  saveBtn.addEventListener('click', async () => {
    const changed = dirty();
    const problem = changed.find((e) => !String(e.label || '').trim()) ? 'Every question needs wording.'
      : changed.find((e) => ['select', 'choice'].includes(e.type) && !e.optionsSource && !(e.options || []).length) ? 'A choice question needs at least one option.'
      : null;
    if (problem) {
      errorBox.textContent = problem;
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await saveEntries('newFarmerFields', loaded, changed, 'updated ' + changed.map((e) => e.label).join(', '));
      toast('Saved. The New Farmer form updates on field phones next time they’re online.', 'success');
      renderFormFields(host);
    } catch (err) {
      console.error(err);
      errorBox.textContent = 'Could not save: ' + (err.code === 'permission-denied' ? 'permission denied - the updated Firestore rules may not be deployed yet.' : err.message || 'please try again.');
      errorBox.hidden = false;
      refreshSave();
    }
  });

  mount(host,
    el('p', { class: 'muted' }, COLLECTIONS.newFarmerFields.help),
    loaded.seeded ? null : el('div', { class: 'notice' }, 'This is the built-in form the field app uses right now. Your first save stores the whole form.'),
    missingHost,
    el('section', { class: 'panel add-question' }, [
      el('h3', {}, 'Add a question'),
      el('p', { class: 'muted' }, 'Ask farmers something new at registration. Answers are saved on the farmer, shown and editable on their page here, and included in exports.'),
      el('div', { class: 'field-grid compact' }, [
        el('div', { class: 'field field-wide' }, [el('label', {}, 'Question'), addLabel]),
        el('div', { class: 'field' }, [el('label', {}, 'Answer type'), addType]),
        el('div', { class: 'field' }, [el('label', {}, 'Section'), addSection]),
        el('div', { class: 'field field-checks' }, [el('label', { class: 'check' }, [addRequired, el('span', {}, 'Required')])]),
        el('div', { class: 'field field-wide' }, [addOptions]),
      ]),
      el('div', { class: 'panel-actions' }, [addBtn]),
    ]),
    el('h2', {}, 'Questions on the form'),
    el('p', { class: 'muted small' }, 'Untick “Shown” to take a question off the form. Hide rather than reword a question into a different one - old answers stay attached to it.'),
    listHost,
    errorBox,
    el('div', { class: 'panel-actions sticky-save' }, [saveBtn])
  );
  renderMissing();
  renderCards();
}

// ------------------------------------------------------------------ staff

function identity(email) {
  if (email.endsWith('@office.malaikahoney.local')) return { kind: 'Field office', name: email.split('@')[0] };
  if (email.endsWith('@staff.malaikahoney.local')) return { kind: 'Phone account', name: email.split('@')[0] };
  return { kind: 'Personal account', name: email };
}

/**
 * Revoking a field office locks out every phone signed in as it, so it
 * takes typing the office's name - a plain "OK" was too easy to click
 * through while tidying up a list of old accounts (how Arua was locked out
 * on 6 Oct 2026).
 */
function confirmOfficeRevoke(name) {
  return openDialog('Revoke access for the ' + name + ' office?', (close) => {
    const input = el('input', { type: 'text', placeholder: name, autocomplete: 'off' });
    const go = el('button', { type: 'button', class: 'btn btn-danger btn-sm', disabled: true }, 'Revoke office access');
    input.addEventListener('input', () => (go.disabled = input.value.trim().toLowerCase() !== name.toLowerCase()));
    go.addEventListener('click', () => close(true));
    return [
      el('p', {}, ['Every phone signed in as ', el('strong', {}, name), ' will be locked out of farmer and purchase data the next time it goes online, and staff there will see “Approval Needed”.']),
      el('p', {}, 'If you only want to stop new sign-ins, hide the office in Settings → Field offices instead.'),
      el('div', { class: 'field' }, [el('label', {}, 'Type the office name to confirm'), input]),
      el('div', { class: 'dialog-actions' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => close(false) }, 'Cancel'), go]),
    ];
  }).then((v) => v === true);
}

async function renderStaff(host) {
  const [staff, requests, offices, audit] = await Promise.all([
    fetchStaff(),
    fetchSignupRequests(),
    fetchCollection('fieldOffices').catch(() => []),
    fetchAudit(300).catch(() => []),
  ]);
  const me = currentAdminEmail();
  const pending = requests.filter((r) => r.status === 'pending');
  // Keep the tab's "(n waiting)" in step after an approve/reject here.
  const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent.startsWith('Staff access'));
  if (tab) tab.textContent = 'Staff access' + (pending.length ? ' (' + pending.length + ' waiting)' : '');
  const hasAccess = new Set(staff.map((s) => s.id.trim().toLowerCase()));
  // Accounts revoked here that haven't been given access back since: the
  // newest revoke per account, with the role it had.
  const revoked = [];
  const seenRevoked = new Set();
  for (const e of audit) {
    if (e.action !== 'staff.revoke' || !e.target) continue;
    const email = String(e.target).trim();
    const key = email.toLowerCase();
    if (seenRevoked.has(key) || hasAccess.has(key)) continue;
    seenRevoked.add(key);
    revoked.push({ email, entry: e });
  }
  const officeRows = offices
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((o) => ({ office: o, email: officeIdToEmail(o.id), access: hasAccess.has(officeIdToEmail(o.id).toLowerCase()) }));
  const officeEmails = new Set(officeRows.map((r) => r.email.toLowerCase()));

  const act = (label, kind, fn) => {
    const b = el('button', { type: 'button', class: 'btn btn-xs ' + kind }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        if ((await fn()) !== false) renderStaff(host);
        else b.disabled = false;
      } catch (err) {
        console.error(err);
        toast('Failed: ' + (err.code === 'permission-denied' ? 'permission denied - the updated Firestore rules may not be deployed yet.' : err.message), 'error');
        b.disabled = false;
      }
    });
    return b;
  };

  // Offices have their own section below; this list is people/phones.
  const sorted = staff.filter((s) => !officeEmails.has(s.id.toLowerCase())).sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || a.id.localeCompare(b.id));

  // ---- add access: a field office, or a person
  const addResult = el('div');
  const officeName = el('input', { type: 'text', placeholder: 'e.g. Koboko' });
  const officeCode = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'e.g. 4821', autocomplete: 'off' });
  const officeBtn = el('button', { type: 'button', class: 'btn btn-maroon btn-sm' }, 'Add office');
  const personName = el('input', { type: 'text', placeholder: 'e.g. Cathy Atim' });
  const personEmail = el('input', { type: 'email', placeholder: 'name@malaikahoney.com', autocomplete: 'off' });
  const personPass = el('input', { type: 'text', placeholder: 'At least 6 characters', autocomplete: 'new-password' });
  const personBtn = el('button', { type: 'button', class: 'btn btn-maroon btn-sm' }, 'Give access');
  const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = on ? 'Working…' : label; };
  const showResult = (ok, text) => mount(addResult, el('div', { class: 'notice ' + (ok ? 'notice-good' : 'notice-warn') }, text));

  officeBtn.addEventListener('click', async () => {
    const name = officeName.value.trim();
    const code = officeCode.value.trim();
    if (!name) return officeName.focus();
    if (!code) return officeCode.focus();
    busy(officeBtn, true, 'Add office');
    try {
      const { officeId } = await createFieldOffice({ name, code });
      showResult(true, ['Office ', el('strong', {}, name), ' added. On the phone, staff choose ', el('strong', {}, name), ' and type code ', el('strong', {}, code), '. Write the code down now - it can’t be shown again.']);
      officeName.value = '';
      officeCode.value = '';
      toast('Office ' + officeId + ' added.', 'success');
      setTimeout(() => renderStaff(host).then(() => host.prepend(addResult)), 50);
    } catch (err) {
      console.error(err);
      showResult(false, 'Could not add the office: ' + (err.code === 'permission-denied' ? 'permission denied - the updated Firestore rules may not be deployed yet.' : err.message));
    } finally {
      busy(officeBtn, false, 'Add office');
    }
  });

  personBtn.addEventListener('click', async () => {
    const email = personEmail.value.trim();
    const password = personPass.value;
    if (!email) return personEmail.focus();
    if (password.length < 6) {
      personPass.focus();
      return showResult(false, 'The temporary password needs at least 6 characters.');
    }
    if (!(await confirmDialog('Give ' + email + ' management access?', 'Admins can use this management app: edit and merge records, import data, change settings and manage staff access - including other admins.', { confirmLabel: 'Give access' }))) return;
    busy(personBtn, true, 'Give access');
    try {
      const { existed } = await createPersonAccount({ email, password, displayName: personName.value, admin: true });
      showResult(true, existed
        ? [el('strong', {}, email), ' already had a sign-in account, so their existing password is unchanged - they now have management access.']
        : [el('strong', {}, email), ' can now sign in to this management app with the temporary password ', el('strong', {}, password), '. Send it to them privately and ask them to change it.']);
      personName.value = '';
      personEmail.value = '';
      personPass.value = '';
      setTimeout(() => renderStaff(host).then(() => host.prepend(addResult)), 50);
    } catch (err) {
      console.error(err);
      showResult(false, 'Could not give access: ' + (err.code === 'permission-denied' ? 'permission denied - the updated Firestore rules may not be deployed yet.' : err.message));
    } finally {
      busy(personBtn, false, 'Give access');
    }
  });

  const addPanel = el('section', { class: 'panel' }, [
    el('h3', {}, 'Add access'),
    el('div', { class: 'add-access' }, [
      el('div', { class: 'add-access-col' }, [
        el('h4', {}, 'New field office'),
        el('p', { class: 'muted small' }, 'One shared sign-in for everyone at an office, used on the phones: they pick the office and type its code.'),
        el('div', { class: 'field' }, [el('label', {}, 'Office name'), officeName]),
        el('div', { class: 'field' }, [el('label', {}, 'Sign-in code'), officeCode]),
        el('div', { class: 'panel-actions' }, [officeBtn]),
      ]),
      el('div', { class: 'add-access-col' }, [
        el('h4', {}, 'New management user'),
        el('p', { class: 'muted small' }, 'An individual account with their own email, for someone who uses this management app. Their changes are recorded under their name. They become an admin.'),
        el('div', { class: 'field' }, [el('label', {}, 'Name'), personName]),
        el('div', { class: 'field' }, [el('label', {}, 'Email'), personEmail]),
        el('div', { class: 'field' }, [el('label', {}, 'Temporary password'), personPass]),
        el('div', { class: 'panel-actions' }, [personBtn]),
      ]),
    ]),
    addResult,
  ]);

  mount(host, addPanel, 
    el('h2', {}, 'Waiting for approval'),
    pending.length
      ? table(['Who', 'Type', 'First tried', ''], pending.map((r) => {
          const who = identity(r.email);
          return el('tr', {}, [
            el('td', {}, [el('strong', {}, r.displayName || who.name), r.displayName && r.displayName !== who.name ? el('span', { class: 'muted' }, ' ' + who.name) : null]),
            el('td', {}, who.kind),
            el('td', {}, formatDateTime(r.requestedAt)),
            el('td', { class: 'actions' }, [
              act('Approve', 'btn-green', () => resolveSignupRequest(r, true).then(() => toast('Approved ' + who.name + '.', 'success'))),
              act('Reject', 'btn-outline', () => resolveSignupRequest(r, false)),
            ]),
          ]);
        }))
      : el('p', { class: 'muted' }, 'No one is waiting.'),

    el('h2', {}, 'Field offices'),
    el('p', { class: 'muted small' }, 'The offices on the phones’ sign-in screen, and whether each one can actually sign in. An office shown on phones without access leaves its staff stuck on “Approval Needed” - that is also flagged in Data checks.'),
    officeRows.length
      ? table(['Office', 'Sign-in name', 'On phones', 'Access', ''], officeRows.map(({ office, email, access }) => {
          const name = office.label || office.id;
          return el('tr', { class: access ? '' : office.active === false ? 'row-muted' : 'row-warn' }, [
            el('td', {}, el('strong', {}, name)),
            el('td', { class: 'mono small' }, office.id),
            el('td', {}, office.active === false ? el('span', { class: 'muted' }, 'hidden') : 'shown'),
            el('td', {}, access ? el('span', { class: 'tag tag-good' }, 'can sign in') : el('span', { class: 'tag tag-bad' }, 'no access')),
            el('td', { class: 'actions' }, access
              ? [act('Revoke access', 'btn-outline-danger', async () => {
                  if (!(await confirmOfficeRevoke(name))) return false;
                  await revokeStaff(email, null);
                  toast('Access revoked for ' + name + '.', 'success');
                })]
              : [act('Restore access', 'btn-green', async () => {
                  await restoreStaffAccess(email, { reason: 'field office' });
                  toast(name + ' can sign in again - on the phone, tap Check Again.', 'success');
                })]),
          ]);
        }))
      : el('p', { class: 'muted' }, 'No field offices yet - add one above.'),

    revoked.filter((r) => !officeEmails.has(r.email.toLowerCase())).length
      ? el('div', {}, [
          el('h2', {}, 'Recently revoked'),
          el('p', { class: 'muted small' }, 'Accounts whose access was revoked here. Restore puts it back exactly as it was (including admin).'),
          table(['Account', 'Type', 'Revoked', 'By', ''], revoked.filter((r) => !officeEmails.has(r.email.toLowerCase())).map(({ email, entry }) => {
            const who = identity(email);
            const role = entry.details && entry.details.role;
            return el('tr', {}, [
              el('td', {}, [el('strong', {}, who.name), role === 'admin' ? el('span', { class: 'tag' }, 'was admin') : null]),
              el('td', {}, who.kind),
              el('td', {}, formatDateTime(entry.atLocal)),
              el('td', {}, entry.by || '—'),
              el('td', { class: 'actions' }, [act('Restore access', 'btn-outline', async () => {
                await restoreStaffAccess(email, { role });
                toast('Access restored for ' + who.name + '.', 'success');
              })]),
            ]);
          })),
        ])
      : null,

    el('h2', {}, 'People and phone accounts'),
    el('p', { class: 'muted small' }, 'Admins can use this management app and approve staff in the field app. Revoking access stops an account reading or writing any data - though a field phone that is offline keeps working from its last sign-in until it next connects. You can’t change your own access here.'),
    table(['Account', 'Type', 'Role', ''], sorted.map((s) => {
      const who = identity(s.id);
      const self = s.id === me;
      return el('tr', {}, [
        el('td', {}, [el('strong', {}, who.name), self ? el('span', { class: 'tag' }, 'you') : null]),
        el('td', {}, who.kind),
        el('td', {}, s.role === 'admin' ? el('span', { class: 'tag tag-good' }, 'admin') : 'staff'),
        el('td', { class: 'actions' }, self ? [] : [
          s.role === 'admin'
            ? act('Remove admin', 'btn-outline', async () => {
                if (!(await confirmDialog('Remove admin role?', who.name + ' will keep normal staff access but lose this management app.', { confirmLabel: 'Remove admin' }))) return false;
                await setStaffRole(s.id, null);
              })
            : act('Make admin', 'btn-outline', async () => {
                if (!(await confirmDialog('Make ' + who.name + ' an admin?', 'Admins can edit and merge records, import data, change settings and manage staff access - including other admins.', { confirmLabel: 'Make admin' }))) return false;
                await setStaffRole(s.id, 'admin');
              }),
          act('Revoke access', 'btn-outline-danger', async () => {
            if (who.kind === 'Field office') {
              if (!(await confirmOfficeRevoke(who.name))) return false;
            } else if (!(await confirmDialog('Revoke access for ' + who.name + '?', ['This account will be locked out of farmer and purchase data.', 'You can undo this from “Recently revoked” on this page.'], { confirmLabel: 'Revoke access', danger: true }))) return false;
            await revokeStaff(s.id, s.role || null);
            toast('Access revoked for ' + who.name + '.', 'success');
          }),
        ]),
      ]);
    })),
    el('p', { class: 'muted small' }, 'Forgotten passwords and changing an office’s code are done in the Firebase Console → Authentication (see docs/Config-Management.md).')
  );
}

// --------------------------------------------------------------- activity

async function renderActivity(host) {
  const entries = await fetchAudit(300);
  mount(host, 
    el('p', { class: 'muted' }, 'Imports, merges, deactivations, settings and staff changes made in this app - newest first. Edits to individual farmers and purchases are in each record’s own edit history.'),
    entries.length
      ? table(['When', 'Who', 'Action', 'Details'], entries.map((e) =>
          el('tr', {}, [
            el('td', {}, formatDateTime(e.atLocal)),
            el('td', {}, e.by),
            el('td', { class: 'mono small' }, e.action),
            el('td', { class: 'wrap' }, e.summary),
          ])))
      : el('div', { class: 'empty-state' }, 'Nothing recorded yet.')
  );
}
