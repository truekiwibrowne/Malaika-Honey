import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { createFarmer, findFarmerByPhone, findFarmerByName } from '../lib/db.js';
import { iconEl } from '../lib/icons.js';
import { getNewFarmerFields, getDistricts, getFarmSizes } from '../lib/referenceData.js';

function resetSaveBtnLabel(btn) {
  btn.replaceChildren(iconEl('check'), document.createTextNode(' Save Farmer'));
}

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

const YES_NO = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];

/**
 * Renders one field from the newFarmerFields schema (see referenceData.js)
 * as a labeled form control, wiring its value into `state[field.id]`.
 * `select`/`choice` fields whose options include one literally valued
 * "Other" get a secondary free-text input, generalizing what used to be
 * District-only special-casing to any admin-configured field.
 */
function renderField(field, options, state) {
  const label = el('label', {}, field.label + (field.required ? ' *' : ''));
  const otherInput = el('input', { type: 'text', placeholder: 'Please specify', hidden: true });
  const children = [label];

  function handleValue(value) {
    state[field.id] = value;
    if (otherInput) otherInput.hidden = value !== 'Other';
  }

  if (field.type === 'select') {
    const select = el(
      'select',
      { onChange: (e) => handleValue(e.target.value) },
      [el('option', { value: '' }, field.placeholder || ('Select ' + field.label)), ...options.map((o) => el('option', { value: o.id }, o.label))]
    );
    children.push(select, otherInput);
  } else if (field.type === 'choice') {
    children.push(choiceGroup(options, null, handleValue), otherInput);
  } else if (field.type === 'toggle') {
    children.push(choiceGroup(YES_NO, null, handleValue));
  } else {
    // text, tel, email, number, date
    const input = el('input', {
      type: field.type,
      placeholder: field.placeholder || '',
      onInput: (e) => (state[field.id] = e.target.value),
    });
    children.push(input);
  }

  return el('div', { class: 'field' }, children);
}

function hasValue(field, state) {
  const raw = state[field.id];
  if (raw === undefined || raw === null) return false;
  return String(raw).trim().length > 0;
}

/** Resolves any `state[field.id] === 'Other'` entries to the typed free-text value from that field's otherInput, reading it from the DOM at submit time. */
function resolveOtherValues(fieldsWithNodes, state) {
  fieldsWithNodes.forEach(({ field, otherInput }) => {
    if (state[field.id] === 'Other' && otherInput) {
      state[field.id] = otherInput.value.trim();
    }
  });
}

export async function renderNewFarmer(root) {
  mount(root, el('p', { class: 'hint' }, 'Loading form…'));

  const [fields, districts, farmSizes] = await Promise.all([getNewFarmerFields(), getDistricts(), getFarmSizes()]);
  const activeFields = fields.filter((f) => f.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const state = {};
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const fullNameInput = el('input', { type: 'text', id: 'fullName', placeholder: 'e.g. John Okello' });
  const phoneInput = el('input', { type: 'tel', id: 'phone', placeholder: 'e.g. 077xxxxxxx' });

  const fieldNodes = []; // { field, otherInput } for resolving "Other" at submit time
  const sections = [];
  // Full Name/Phone above are already grouped under a hardcoded "Personal
  // Information" heading (they aren't part of the fetched schema) - start
  // here so the loop doesn't print that same heading a second time for
  // whichever fields also happen to share that section.
  let currentSection = 'Personal Information';
  activeFields.forEach((field) => {
    const options = field.options || (field.optionsSource === 'districts' ? districts : field.optionsSource === 'farmSizes' ? farmSizes : []);
    if (field.section !== currentSection) {
      currentSection = field.section;
      sections.push(el('h2', {}, currentSection));
    }
    const fieldEl = renderField(field, options, state);
    fieldNodes.push({ field, otherInput: fieldEl.querySelector('input[placeholder="Please specify"]') });
    sections.push(fieldEl);
  });

  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green' });
  resetSaveBtnLabel(saveBtn);

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const fullName = fullNameInput.value.trim();
        const phone = phoneInput.value.trim();
        resolveOtherValues(fieldNodes, state);

        const missingRequired = activeFields.some((f) => f.required && !hasValue(f, state));
        if (!fullName || !phone || missingRequired) {
          errorBox.textContent = 'Please fill in Full Name, Phone, and all required fields before saving.';
          errorBox.hidden = false;
          errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        errorBox.hidden = true;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Checking…';

        try {
          const phoneMatch = await findFarmerByPhone(phone);
          if (phoneMatch) {
            errorBox.textContent =
              'A farmer with this phone number is already registered: ' +
              phoneMatch.fullName + ' (FRN ' + phoneMatch.frn + '). Each phone number can only be registered once — use Find Farmer instead if this is the same person.';
            errorBox.hidden = false;
            errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            saveBtn.disabled = false;
            resetSaveBtnLabel(saveBtn);
            return;
          }

          const nameMatch = await findFarmerByName(fullName);
          if (nameMatch) {
            const proceed = window.confirm(
              'A farmer named "' + fullName + '" is already registered (FRN ' + nameMatch.frn + '). ' +
              'Continue creating a separate, new registration for this person?'
            );
            if (!proceed) {
              saveBtn.disabled = false;
              resetSaveBtnLabel(saveBtn);
              return;
            }
          }

          saveBtn.textContent = 'Saving…';
          const frn = await createFarmer({ fullName, phone, fieldValues: state });
          navigate('#/new-farmer/success/' + frn);
        } catch (err) {
          console.error(err);
          errorBox.textContent = 'Could not save this farmer. ' + (err.message || 'Please try again.');
          errorBox.hidden = false;
          saveBtn.disabled = false;
          resetSaveBtnLabel(saveBtn);
        }
      },
    },
    [
      el('h2', {}, 'Personal Information'),
      el('div', { class: 'field' }, [el('label', {}, 'Full Name *'), fullNameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Phone Number *'), phoneInput]),
      ...sections,
      errorBox,
      saveBtn,
    ]
  );

  mount(
    root,
    el('h1', {}, 'New Farmer'),
    el('p', { class: 'welcome' }, 'Register a new farmer.'),
    form
  );
}

export function renderNewFarmerSuccess(root, { frn }) {
  mount(
    root,
    el('div', { class: 'centered-screen' }, [
      el('div', { class: 'confirm-icon' }, [iconEl('check')]),
      el('h1', { style: 'text-align:center' }, 'Farmer Created'),
      el('p', { class: 'welcome', style: 'text-align:center' }, 'Registration complete.'),
      el('div', { class: 'frn-badge', style: 'align-self:center' }, 'FRN ' + frn),
      el('hr', { class: 'hr' }),
      el('a', { href: '#/buy/' + frn, class: 'btn btn-yellow' }, [iconEl('honeyJar'), 'Buy Produce']),
      el('a', { href: '#/card/' + frn, class: 'btn btn-outline' }, [iconEl('idCard'), 'Farmer Card']),
      el('a', { href: '#/home', class: 'btn btn-secondary' }, 'Done'),
    ])
  );
}
