import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { createFarmer, findFarmerByPhone, findFarmerByName } from '../lib/db.js';
import { DISTRICTS, FARM_SIZES, GENDERS } from '../lib/constants.js';

function choiceGroup(name, options, selectedValue, onSelect) {
  const group = el('div', { class: 'choice-group', 'data-group': name });
  options.forEach((opt) => {
    const id = typeof opt === 'string' ? opt : opt.id;
    const label = typeof opt === 'string' ? opt : opt.label;
    const chip = el(
      'button',
      {
        type: 'button',
        class: 'choice-chip' + (id === selectedValue ? ' selected' : ''),
        onClick: () => {
          group.querySelectorAll('.choice-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
          onSelect(id);
        },
      },
      label
    );
    group.appendChild(chip);
  });
  return group;
}

export function renderNewFarmer(root) {

  const state = {
    gender: null,
    farmSize: null,
    usesChemicals: null,
    wantsTraining: null,
    district: '',
  };

  const errorBox = el('div', { class: 'field-error', hidden: true });

  const fullNameInput = el('input', { type: 'text', id: 'fullName', placeholder: 'e.g. John Okello' });
  const phoneInput = el('input', { type: 'tel', id: 'phone', placeholder: 'e.g. 077xxxxxxx' });
  const villageInput = el('input', { type: 'text', id: 'village', placeholder: 'e.g. Awuvu' });
  const dobInput = el('input', { type: 'date', id: 'dob' });
  const emailInput = el('input', { type: 'email', id: 'email', placeholder: 'Optional' });
  const otherCropsInput = el('input', { type: 'text', id: 'otherCrops', placeholder: 'Optional' });
  const harvestInput = el('input', { type: 'number', id: 'harvest', min: '0', placeholder: 'kg per year' });
  const hivesTrad = el('input', { type: 'number', id: 'hivesTrad', min: '0', value: '0' });
  const hivesKtb = el('input', { type: 'number', id: 'hivesKtb', min: '0', value: '0' });
  const hivesModern = el('input', { type: 'number', id: 'hivesModern', min: '0', value: '0' });

  const districtSelect = el(
    'select',
    {
      id: 'district',
      onChange: (e) => {
        state.district = e.target.value;
        otherDistrictInput.hidden = e.target.value !== 'Other';
      },
    },
    [el('option', { value: '' }, 'Select district'), ...DISTRICTS.map((d) => el('option', { value: d }, d))]
  );
  const otherDistrictInput = el('input', {
    type: 'text',
    placeholder: 'Type district name',
    hidden: true,
  });

  const genderGroup = choiceGroup('gender', GENDERS, state.gender, (v) => (state.gender = v));
  const farmSizeGroup = choiceGroup('farmSize', FARM_SIZES, state.farmSize, (v) => (state.farmSize = v));
  const chemicalsGroup = choiceGroup(
    'usesChemicals',
    [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
    null,
    (v) => (state.usesChemicals = v === 'yes')
  );
  const trainingGroup = choiceGroup(
    'wantsTraining',
    [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
    null,
    (v) => (state.wantsTraining = v === 'yes')
  );

  const saveBtn = el(
    'button',
    {
      type: 'submit',
      class: 'btn btn-green',
    },
    ['✔ Save Farmer']
  );

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const fullName = fullNameInput.value.trim();
        const phone = phoneInput.value.trim();
        const village = villageInput.value.trim();
        const district = state.district === 'Other' ? otherDistrictInput.value.trim() : state.district;

        if (!fullName || !phone || !village || !district) {
          errorBox.textContent = 'Please fill in Full Name, Phone, Village and District before saving.';
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
            saveBtn.textContent = '✔ Save Farmer';
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
              saveBtn.textContent = '✔ Save Farmer';
              return;
            }
          }

          saveBtn.textContent = 'Saving…';
          const frn = await createFarmer({
            fullName,
            phone,
            village,
            district,
            dateOfBirth: dobInput.value || null,
            gender: state.gender,
            email: emailInput.value.trim(),
            farmSize: state.farmSize,
            hivesTraditional: hivesTrad.value,
            hivesKtb: hivesKtb.value,
            hivesModern: hivesModern.value,
            otherCropsOrLivestock: otherCropsInput.value.trim(),
            avgHarvestKgPerYear: harvestInput.value,
            usesChemicals: state.usesChemicals,
            wantsTraining: state.wantsTraining,
          });
          navigate('#/new-farmer/success/' + frn);
        } catch (err) {
          console.error(err);
          errorBox.textContent = 'Could not save this farmer. ' + (err.message || 'Please try again.');
          errorBox.hidden = false;
          saveBtn.disabled = false;
          saveBtn.textContent = '✔ Save Farmer';
        }
      },
    },
    [
      el('h2', {}, 'Personal Information'),
      el('div', { class: 'field' }, [el('label', {}, 'Full Name *'), fullNameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Phone Number *'), phoneInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Date of Birth'), dobInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Gender'), genderGroup]),
      el('div', { class: 'field' }, [el('label', {}, 'Email Address'), emailInput]),

      el('h2', {}, 'Farm Information'),
      el('div', { class: 'field' }, [el('label', {}, 'Village *'), villageInput]),
      el('div', { class: 'field' }, [el('label', {}, 'District *'), districtSelect, otherDistrictInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Farm Size'), farmSizeGroup]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Number of Beehives'),
        el('div', { class: 'btn-row' }, [
          el('div', { class: 'field' }, [el('label', {}, 'Traditional'), hivesTrad]),
          el('div', { class: 'field' }, [el('label', {}, 'KTB'), hivesKtb]),
          el('div', { class: 'field' }, [el('label', {}, 'Modern'), hivesModern]),
        ]),
      ]),
      el('div', { class: 'field' }, [el('label', {}, 'Other Crops or Livestock'), otherCropsInput]),

      el('h2', {}, 'Production Details'),
      el('div', { class: 'field' }, [el('label', {}, 'Average Honey Harvest'), harvestInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Uses chemicals/pesticides?'), chemicalsGroup]),
      el('div', { class: 'field' }, [el('label', {}, 'Interested in training?'), trainingGroup]),

      errorBox,
      saveBtn,
    ]
  );

  mount(
    root,
    el('a', { href: '#/home', class: 'back-btn' }, '← Back'),
    el('h1', {}, 'New Farmer'),
    el('p', { class: 'welcome' }, 'Register a new farmer.'),
    form
  );
}

export function renderNewFarmerSuccess(root, { frn }) {
  mount(
    root,
    el('div', { class: 'confirm-icon' }, '✔'),
    el('h1', { style: 'text-align:center' }, 'Farmer Created'),
    el('p', { class: 'welcome', style: 'text-align:center' }, 'Registration complete.'),
    el('div', { class: 'frn-badge', style: 'align-self:center' }, 'FRN ' + frn),
    el('hr', { class: 'hr' }),
    el('a', { href: '#/buy/' + frn, class: 'btn btn-yellow' }, [el('span', { class: 'icon' }, '🍯'), 'Buy Produce']),
    el('a', { href: '#/card/' + frn, class: 'btn btn-outline' }, [el('span', { class: 'icon' }, '🪪'), 'Farmer Card']),
    el('a', { href: '#/home', class: 'btn btn-secondary' }, 'Done')
  );
}
