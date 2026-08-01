import { el } from './ui.js';
import { getNewFarmerFields, getDistricts, getFarmSizes } from './referenceData.js';
import { dateField } from './datePicker.js';

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
 * Renders one schema field as a labeled control, wiring its value into
 * `state[field.id]`. `select`/`choice` fields whose options include one
 * literally valued "Other" get a secondary free-text input.
 */
function renderField(field, options, state) {
  const initial = state[field.id] ?? '';
  const label = el('label', {}, field.label + (field.required ? ' *' : ''));
  const otherInput = el('input', { type: 'text', placeholder: 'Please specify', hidden: true });
  const children = [label];
  const custom = isCustomValue(initial, options);

  function handleValue(value) {
    state[field.id] = value;
    otherInput.hidden = value !== 'Other';
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
  return String(raw).trim().length > 0;
}

export async function buildFarmerForm({ farmer = null, fieldValues = {} } = {}) {
  const [fields, districts, farmSizes] = await Promise.all([getNewFarmerFields(), getDistricts(), getFarmSizes()]);
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
  activeFields.forEach((field) => {
    const options = field.options || (field.optionsSource === 'districts' ? districts : field.optionsSource === 'farmSizes' ? farmSizes : []);
    if (field.section !== currentSection) {
      currentSection = field.section;
      sections.push(el('h2', {}, currentSection));
    }
    const { node, otherInput } = renderField(field, options, state);
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
