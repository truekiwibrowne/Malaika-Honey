import { el } from './ui.js';
import { getNewFarmerFields, getDistricts, getFarmSizes, getCropsLivestock, getVillages } from './referenceData.js';
import { dateField } from './datePicker.js';
import { pickLocation, formatPoint, isValidPoint } from './mapPicker.js';

/**
 * The schema-driven farmer form, shared by New Farmer (newFarmer.js) and
 * Edit Farmer (editFarmer.js) so the two can never drift apart - an admin
 * adding a field to `newFarmerFields` gets it on both screens with no code
 * change, and validation/"Other" handling only exists in one place.
 *
 * Pass `farmer` to prefill every control from an existing farmer document
 * (edit mode); omit it for a blank registration form.
 */

const YES_NO = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];

function choiceGroup(options, selectedValue, onSelect) {
  const group = el('div', { class: 'choice-group' });
  options.forEach((opt) => {
    const chip = el(
      'button',
      {
        type: 'button',
        class: 'choice-chip' + (opt.id === selectedValue ? ' selected' : ''),
        onClick: () => {
          group.querySelectorAll('.choice-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
          onSelect(opt.id);
        },
      },
      opt.label
    );
    group.appendChild(chip);
  });
  return group;
}

/**
 * A stored value that isn't one of the field's options came from the
 * "Other" free-text box the last time this farmer was saved (e.g. a
 * district not on the standard list). Detecting that on prefill is what
 * stops editing an unrelated field from silently wiping it.
 */
function isCustomValue(value, options) {
  return Boolean(value) && !options.some((o) => o.id === value);
}

/**
 * Farm GPS question: shows the current point and opens the shared map
 * picker (which offers "use my current location" offline, the map and
 * search online, and typed coordinates always).
 */
function locationControl(field, state) {
  const value = el('div', { class: 'location-value' });
  const clearBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, 'Clear');
  const setBtn = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Set location');
  const render = () => {
    const p = state[field.id];
    value.textContent = isValidPoint(p) ? formatPoint(p) + (p.accuracyM ? ' (±' + p.accuracyM + ' m)' : '') : 'Not set';
    value.classList.toggle('muted', !isValidPoint(p));
    clearBtn.hidden = !isValidPoint(p);
    setBtn.textContent = isValidPoint(p) ? 'Change' : 'Set location';
  };
  setBtn.addEventListener('click', async () => {
    const picked = await pickLocation({
      title: field.label,
      initial: state[field.id],
      help: 'Stand at the farm and tap “Use my current location”, or find the farm on the map.',
    });
    if (picked) {
      state[field.id] = picked;
      render();
    }
  });
  clearBtn.addEventListener('click', () => {
    state[field.id] = null;
    render();
  });
  render();
  return el('div', { class: 'location-field' }, [value, el('div', { class: 'location-actions' }, [setBtn, clearBtn])]);
}

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Village question, as a dropdown of the villages listed for the chosen
 * district (Settings -> Villages in the management app). The farmer stores
 * the village NAME, exactly as when it was typed, so old and new records
 * group together in reports. "Other" reveals a text box for a village not
 * listed yet; a district with no villages listed falls back to typing, so
 * registration can never be blocked by an empty list. Re-renders whenever
 * the district changes (see `onDistrictChange`).
 */
function villageControl(field, villages, state) {
  const wrap = el('div', { class: 'village-field' });
  const render = () => {
    const district = state.district;
    const options = villages.filter((v) => district && district !== 'Other' && (sameText(v.district, district) || sameText(v.districtLabel, district)));
    const current = state[field.id] || '';
    if (!options.length) {
      const input = el('input', {
        type: 'text',
        placeholder: district && district !== 'Other' ? 'Type the village name' : field.placeholder || 'Type the village name',
        value: current,
        onInput: (e) => (state[field.id] = e.target.value),
      });
      wrap.replaceChildren(input);
      return;
    }
    const known = options.find((o) => sameText(o.label, current));
    const other = el('input', { type: 'text', placeholder: 'Type the village name', hidden: !(current && !known), value: current && !known ? current : '' });
    other.addEventListener('input', () => (state[field.id] = other.value));
    const select = el('select', {}, [
      el('option', { value: '' }, field.placeholder || 'Select village'),
      ...options.map((o) => el('option', { value: o.label }, o.label)),
      el('option', { value: '__other' }, 'Other (not listed)'),
    ]);
    select.value = known ? known.label : current ? '__other' : '';
    select.addEventListener('change', () => {
      const isOther = select.value === '__other';
      other.hidden = !isOther;
      state[field.id] = isOther ? other.value : select.value;
      if (isOther) other.focus();
    });
    wrap.replaceChildren(select, other);
  };
  render();
  return { node: wrap, render };
}

/**
 * Crops & livestock question: one row per item from the cropsLivestock
 * list, grouped crops/livestock. Ticking an item reveals an optional
 * quantity box in that item's unit; state holds { itemId: qty | true }.
 */
function cropsControl(field, items, state) {
  const current = { ...(state[field.id] || {}) };
  state[field.id] = current;
  const group = (kind, title) => {
    const list = items.filter((i) => (i.kind || 'crop') === kind);
    if (!list.length) return null;
    return el('div', { class: 'crops-group' }, [
      el('div', { class: 'crops-title' }, title),
      ...list.map((item) => {
        const has = item.id in current;
        const qty = el('input', {
          type: 'number',
          inputmode: 'decimal',
          min: '0',
          step: 'any',
          class: 'crops-qty',
          placeholder: item.unit ? item.unit : 'how many',
          value: typeof current[item.id] === 'number' ? current[item.id] : '',
          hidden: !has || !item.unit,
          'aria-label': item.label + (item.unit ? ' (' + item.unit + ')' : ''),
        });
        const chip = el('button', { type: 'button', class: 'choice-chip' + (has ? ' selected' : '') }, item.label);
        chip.addEventListener('click', () => {
          const on = !(item.id in current);
          if (on) current[item.id] = Number(qty.value) > 0 ? Number(qty.value) : true;
          else delete current[item.id];
          chip.classList.toggle('selected', on);
          qty.hidden = !on || !item.unit;
          if (on && item.unit) qty.focus();
        });
        qty.addEventListener('input', () => {
          if (item.id in current) current[item.id] = Number(qty.value) > 0 ? Number(qty.value) : true;
        });
        return el('div', { class: 'crops-row' }, [chip, qty]);
      }),
    ]);
  };
  return el('div', { class: 'crops-field' }, [group('crop', 'Crops'), group('livestock', 'Livestock')]);
}

/**
 * Renders one schema field as a labeled control, wiring its value into
 * `state[field.id]`. `select`/`choice` fields whose options include one
 * literally valued "Other" get a secondary free-text input.
 */
function renderField(field, options, state, extra = {}) {
  const initial = state[field.id] ?? '';
  const label = el('label', {}, field.label + (field.required ? ' *' : ''));
  const otherInput = el('input', { type: 'text', placeholder: 'Please specify', hidden: true });
  const children = [label];
  const custom = isCustomValue(initial, options);

  function handleValue(value) {
    state[field.id] = value;
    otherInput.hidden = value !== 'Other';
    if (extra.onChange) extra.onChange(field.id);
  }

  if (field.optionsSource === 'villages') {
    const control = villageControl(field, extra.villages || [], state);
    extra.onVillageControl && extra.onVillageControl(control);
    return { node: el('div', { class: 'field' }, [label, control.node]), otherInput: null };
  }

  if (field.type === 'select') {
    const select = el(
      'select',
      { onChange: (e) => handleValue(e.target.value) },
      [el('option', { value: '' }, field.placeholder || ('Select ' + field.label)), ...options.map((o) => el('option', { value: o.id }, o.label))]
    );
    if (custom) {
      select.value = 'Other';
      state[field.id] = 'Other';
      otherInput.value = initial;
      otherInput.hidden = false;
    } else if (initial) {
      select.value = initial;
    }
    children.push(select, otherInput);
  } else if (field.type === 'choice') {
    if (custom) {
      state[field.id] = 'Other';
      otherInput.value = initial;
      otherInput.hidden = false;
    }
    children.push(choiceGroup(options, custom ? 'Other' : initial, handleValue), otherInput);
  } else if (field.type === 'toggle') {
    children.push(choiceGroup(YES_NO, initial, handleValue));
  } else if (field.type === 'location') {
    children.push(locationControl(field, state));
  } else if (field.type === 'cropsLivestock') {
    children.push(cropsControl(field, extra.cropsLivestock || [], state));
  } else if (field.type === 'date') {
    // Deliberately not a native <input type="date">: see datePicker.js for
    // why (Android's wheel picker makes a birth year decades back painful).
    const picker = dateField({ value: initial, onChange: (iso) => (state[field.id] = iso) });
    children.push(picker.node);
  } else {
    // text, tel, email, number
    const input = el('input', {
      type: field.type,
      placeholder: field.placeholder || '',
      value: initial,
      onInput: (e) => (state[field.id] = e.target.value),
    });
    children.push(input);
  }

  return { node: el('div', { class: 'field' }, children), otherInput };
}

function hasValue(field, state) {
  const raw = state[field.id];
  if (raw === undefined || raw === null) return false;
  if (field.type === 'location') return isValidPoint(raw);
  if (typeof raw === 'object') return Object.keys(raw).length > 0;
  return String(raw).trim().length > 0;
}

export async function buildFarmerForm({ farmer = null, fieldValues = {} } = {}) {
  const [fields, districts, farmSizes, cropsLivestock, villages] = await Promise.all([getNewFarmerFields(), getDistricts(), getFarmSizes(), getCropsLivestock(), getVillages()]);
  const activeFields = fields.filter((f) => f.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const state = { ...fieldValues };

  const fullNameInput = el('input', { type: 'text', id: 'fullName', placeholder: 'e.g. John Okello', value: farmer ? farmer.fullName : '' });
  const phoneInput = el('input', { type: 'tel', id: 'phone', placeholder: 'e.g. 077xxxxxxx', value: farmer ? farmer.phone : '' });

  const fieldNodes = []; // { field, otherInput } - resolved at submit time
  const sections = [
    el('h2', {}, 'Personal Information'),
    el('div', { class: 'field' }, [el('label', {}, 'Full Name *'), fullNameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Phone Number *'), phoneInput]),
  ];

  // Full Name/Phone above already sit under a hardcoded "Personal
  // Information" heading (they aren't part of the fetched schema) - start
  // here so the loop doesn't print that heading a second time for
  // whichever schema fields share that section.
  let currentSection = 'Personal Information';
  const villageControls = [];
  const extra = {
    cropsLivestock,
    villages,
    onVillageControl: (c) => villageControls.push(c),
    // District picked (or typed under "Other") -> re-offer the villages.
    onChange: (fieldId) => {
      if (fieldId === 'district') villageControls.forEach((c) => c.render());
    },
  };
  activeFields.forEach((field) => {
    const options = field.options || (field.optionsSource === 'districts' ? districts : field.optionsSource === 'farmSizes' ? farmSizes : []);
    if (field.section !== currentSection) {
      currentSection = field.section;
      sections.push(el('h2', {}, currentSection));
    }
    const { node, otherInput } = renderField(field, options, state, extra);
    fieldNodes.push({ field, otherInput });
    sections.push(node);
  });

  /** Resolves any `state[field.id] === 'Other'` to that field's typed free-text value. */
  function resolveOtherValues() {
    fieldNodes.forEach(({ field, otherInput }) => {
      if (state[field.id] === 'Other' && otherInput) {
        state[field.id] = otherInput.value.trim();
      }
    });
  }

  return {
    sections,
    /**
     * Resolves "Other" free-text first, then checks the fixed inputs and
     * every schema-required field. Returns an error message, or null when
     * the form is good to save.
     */
    validate() {
      resolveOtherValues();
      const missingRequired = activeFields.some((f) => f.required && !hasValue(f, state));
      if (!fullNameInput.value.trim() || !phoneInput.value.trim() || missingRequired) {
        return 'Please fill in Full Name, Phone, and all required fields before saving.';
      }
      return null;
    },
    getValues() {
      return {
        fullName: fullNameInput.value.trim(),
        phone: phoneInput.value.trim(),
        fieldValues: state,
      };
    },
  };
}
