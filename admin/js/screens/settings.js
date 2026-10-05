import { el, mount, spinner, table, toast, confirmDialog, tabs, hashQuery, formatDateTime } from '../lib/ui.js';
import { COLLECTIONS, loadCollection, saveEntries, slugFromLabel } from '../lib/refdata.js';
import { fetchStaff, fetchSignupRequests, setStaffRole, revokeStaff, resolveSignupRequest } from '../lib/data.js';
import { fetchAudit } from '../lib/audit.js';
import { currentAdminEmail } from '../lib/auth.js';
import { REGIONS } from '../lib/geo.js';
import { navigate } from '../router.js';

const TABS = [
  { key: 'products', label: 'Products' },
  { key: 'grades', label: 'Grades' },
  { key: 'paymentMethods', label: 'Payment methods' },
  { key: 'farmSizes', label: 'Farm sizes' },
  { key: 'districts', label: 'Districts' },
  { key: 'fieldOffices', label: 'Field offices' },
  { key: 'newFarmerFields', label: 'New Farmer form' },
  { key: 'staff', label: 'Staff access' },
  { key: 'activity', label: 'Activity log' },
];

// Field ids the field app maps onto fixed farmer fields (farmerFields.js
// KNOWN_FIELD_IDS). Their type and options can't change without breaking
// how existing answers are stored, so only their wording/order/visibility
// is editable.
const BUILT_IN_FIELDS = ['dateOfBirth', 'gender', 'email', 'village', 'district', 'farmSize', 'hivesTraditional', 'hivesKtb', 'hivesModern', 'otherCropsOrLivestock', 'avgHarvestKgPerYear', 'usesChemicals', 'wantsTraining'];
const FIELD_TYPES = ['text', 'number', 'date', 'tel', 'email', 'select', 'choice', 'toggle'];

export async function renderSettings(root) {
  const active = TABS.some((t) => t.key === hashQuery().get('tab')) ? hashQuery().get('tab') : 'products';
  const host = el('div', { class: 'settings-body' }, spinner());
  mount(
    root,
    el('div', { class: 'page-head' }, [el('div', {}, [el('h1', {}, 'Settings'), el('p', { class: 'muted' }, 'The lists and options the field app uses, and who can sign in. Changes reach field phones the next time they’re online.')])]),
    tabs(TABS, active, (key) => navigate('#/settings?tab=' + key)),
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
  const loaded = await loadCollection(name);
  const isDistricts = name === 'districts';

  if (cfg.noCreate && !loaded.seeded) {
    mount(host, 
      el('p', { class: 'muted' }, cfg.help),
      el('div', { class: 'empty-state' }, 'No offices have been added yet. Add the first one from the field app (sign in as an admin, then Home → Add Office); it will appear here to rename, reorder or hide.')
    );
    return;
  }

  // Working copies; `original` lets us save only what changed.
  const original = new Map(loaded.entries.map((e) => [e.id, JSON.stringify(e)]));
  const entries = loaded.entries.map((e) => ({ ...e }));
  const saveBtn = el('button', { type: 'button', class: 'btn btn-green btn-sm', disabled: true }, 'Save changes');
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const search = isDistricts ? el('input', { type: 'search', placeholder: 'Find a district' }) : null;
  const tbodyHost = el('div');

  const dirty = () => entries.filter((e) => original.get(e.id) !== JSON.stringify(e));
  const refreshSave = () => {
    const n = dirty().length;
    saveBtn.disabled = !n;
    saveBtn.textContent = n ? 'Save ' + n + ' change' + (n === 1 ? '' : 's') : 'Save changes';
  };

  function row(e) {
    const label = el('input', { type: 'text', value: e.label || e.name || '', 'aria-label': 'Label' });
    label.addEventListener('input', () => { e.label = label.value; refreshSave(); });
    const order = el('input', { type: 'number', step: 'any', value: e.order ?? '', class: 'w-order', 'aria-label': 'Order' });
    order.addEventListener('input', () => { e.order = order.value === '' ? null : Number(order.value); refreshSave(); });
    const act = el('input', { type: 'checkbox', checked: e.active !== false, 'aria-label': 'Shown in the field app' });
    act.addEventListener('change', () => { e.active = act.checked; refreshSave(); });
    const cells = [el('td', {}, label), el('td', { class: 'mono muted' }, e.id), el('td', {}, order), el('td', { class: 'center' }, act)];
    if (isDistricts) {
      const region = el('select', { 'aria-label': 'Region' }, [el('option', { value: '' }, 'auto'), ...REGIONS.map((r) => el('option', { value: r }, r))]);
      region.value = e.region || '';
      region.addEventListener('change', () => { e.region = region.value || null; refreshSave(); });
      const coord = (key) => {
        const input = el('input', { type: 'number', step: '0.001', value: e[key] ?? '', class: 'w-coord', placeholder: 'auto', 'aria-label': key === 'lat' ? 'Latitude' : 'Longitude' });
        input.addEventListener('input', () => { e[key] = input.value === '' ? null : Number(input.value); refreshSave(); });
        return input;
      };
      cells.push(el('td', {}, region), el('td', {}, coord('lat')), el('td', {}, coord('lng')));
    }
    return el('tr', { class: e.active === false ? 'row-muted' : '' }, cells);
  }

  function renderRows() {
    const q = search ? search.value.trim().toLowerCase() : '';
    const list = entries.filter((e) => !q || String(e.label || e.id).toLowerCase().includes(q));
    mount(tbodyHost, 
      table(['Label', 'Id', 'Order', 'Shown', ...(isDistricts ? ['Region', 'Latitude', 'Longitude'] : [])], list.map(row))
    );
  }
  if (search) search.addEventListener('input', renderRows);

  // ---- add
  const addLabel = el('input', { type: 'text', placeholder: 'New ' + cfg.title.toLowerCase().replace(/s$/, '') + ' name' });
  const addBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Add');
  addBtn.addEventListener('click', () => {
    const labelText = addLabel.value.trim();
    if (!labelText) return addLabel.focus();
    const id = cfg.idFromLabel ? cfg.idFromLabel(labelText) : slugFromLabel(labelText);
    if (!id || /[/]/.test(id)) {
      toast('Use letters and numbers in the name.', 'error');
      return;
    }
    if (entries.some((e) => e.id.toLowerCase() === id.toLowerCase() || String(e.label).toLowerCase() === labelText.toLowerCase())) {
      toast('“' + labelText + '” is already in the list' + (entries.find((e) => e.id.toLowerCase() === id.toLowerCase())?.active === false ? ' (hidden - tick Shown to bring it back).' : '.'), 'error');
      return;
    }
    const maxOrder = entries.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0);
    entries.push({ id, label: labelText, order: maxOrder + 1, active: true, ...(isDistricts ? { country: 'UG' } : {}) });
    addLabel.value = '';
    if (search) search.value = '';
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

  mount(host, 
    el('p', { class: 'muted' }, cfg.help),
    loaded.seeded
      ? null
      : el('div', { class: 'notice' }, 'These are the built-in defaults the field app is using right now. Your first save stores the whole list, so nothing disappears from field phones.'),
    el('p', { class: 'muted small' }, 'Untick “Shown” to retire an entry - it disappears from the field app but stays on old records. Entries are never deleted.'),
    search ? el('div', { class: 'filter-bar' }, [search]) : null,
    tbodyHost,
    cfg.noCreate ? null : el('div', { class: 'add-row' }, [addLabel, addBtn]),
    errorBox,
    el('div', { class: 'panel-actions sticky-save' }, [saveBtn])
  );
  renderRows();
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
    const typeSelect = el('select', { disabled: builtIn }, FIELD_TYPES.map((t) => el('option', { value: t }, t)));
    typeSelect.value = e.type || 'text';
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
    const syncOptions = () => (optionsField.hidden = !['select', 'choice'].includes(e.type));
    typeSelect.addEventListener('change', () => {
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
        el('div', { class: 'field' }, [el('label', {}, 'Answer type' + (builtIn ? ' (fixed)' : '')), typeSelect]),
        el('div', { class: 'field' }, [el('label', {}, 'Order'), bind(el('input', { type: 'number', step: 'any', value: e.order ?? '' }), 'order', (v) => (v === '' ? null : Number(v)))]),
        el('div', { class: 'field' }, [el('label', {}, 'Hint text'), bind(el('input', { type: 'text', value: e.placeholder || '' }), 'placeholder')]),
        el('div', { class: 'field field-checks' }, [
          el('label', { class: 'check' }, [bind(el('input', { type: 'checkbox', checked: !!e.required }), 'required'), el('span', {}, 'Required')]),
          el('label', { class: 'check' }, [bind(el('input', { type: 'checkbox', checked: e.active !== false }), 'active'), el('span', {}, 'Shown')]),
        ]),
        optionsField,
      ]),
    ]);
  }

  function renderCards() {
    entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    mount(listHost, el('datalist', { id: 'mh-sections' }, sections().map((s) => el('option', { value: s }))), ...entries.map(card));
  }

  const addLabel = el('input', { type: 'text', placeholder: 'New question, e.g. “Member of a cooperative?”' });
  const addType = el('select', {}, FIELD_TYPES.map((t) => el('option', { value: t }, t)));
  addType.value = 'toggle';
  const addBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Add question');
  addBtn.addEventListener('click', () => {
    const label = addLabel.value.trim();
    if (!label) return addLabel.focus();
    let id = slugFromLabel(label).slice(0, 40);
    if (!id) return toast('Use letters and numbers in the question.', 'error');
    if (BUILT_IN_FIELDS.includes(id) || ['fullName', 'phone'].includes(id) || entries.some((e) => e.id === id)) id += 'Custom';
    const maxOrder = entries.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0);
    const type = addType.value;
    entries.push({ id, label, type, section: sections().slice(-1)[0] || 'Production Details', order: maxOrder + 1, required: false, active: true, ...(['select', 'choice'].includes(type) ? { options: [] } : {}) });
    addLabel.value = '';
    renderCards();
    refreshSave();
  });

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
    el('p', { class: 'muted small' }, 'Answers to custom questions are saved on the farmer record and included in exports. Hide a question rather than repurposing it - old answers stay attached to its id.'),
    listHost,
    el('div', { class: 'add-row' }, [addLabel, addType, addBtn]),
    errorBox,
    el('div', { class: 'panel-actions sticky-save' }, [saveBtn])
  );
  renderCards();
}

// ------------------------------------------------------------------ staff

function identity(email) {
  if (email.endsWith('@office.malaikahoney.local')) return { kind: 'Field office', name: email.split('@')[0] };
  if (email.endsWith('@staff.malaikahoney.local')) return { kind: 'Phone account', name: email.split('@')[0] };
  return { kind: 'Personal account', name: email };
}

async function renderStaff(host) {
  const [staff, requests] = await Promise.all([fetchStaff(), fetchSignupRequests()]);
  const me = currentAdminEmail();
  const pending = requests.filter((r) => r.status === 'pending');

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

  const sorted = staff.slice().sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || a.id.localeCompare(b.id));

  mount(host, 
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

    el('h2', {}, 'Who can sign in'),
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
            if (!(await confirmDialog('Revoke access for ' + who.name + '?', [who.kind === 'Field office' ? 'Everyone signing in as this office will be locked out of farmer and purchase data.' : 'This account will be locked out of farmer and purchase data.', 'To restore access later, they sign in again and you approve the request.'], { confirmLabel: 'Revoke access', danger: true }))) return false;
            await revokeStaff(s.id);
            toast('Access revoked for ' + who.name + '.', 'success');
          }),
        ]),
      ]);
    })),
    el('p', { class: 'muted small' }, 'New field offices are created from the field app (Home → Add Office), which sets their sign-in code. New management accounts are created in the Firebase Console (see docs/Config-Management.md).')
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
