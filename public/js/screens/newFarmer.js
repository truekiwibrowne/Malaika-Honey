import { el, mount, locationIndicator } from '../lib/ui.js';
import { navigate } from '../router.js';
import { createFarmer, findFarmerByPhone, findFarmerByName } from '../lib/db.js';
import { iconEl } from '../lib/icons.js';
import { buildFarmerForm } from '../lib/farmerForm.js';
import { startLocationCapture, locationStatus } from '../lib/location.js';

function resetSaveBtnLabel(btn) {
  btn.replaceChildren(iconEl('check'), document.createTextNode(' Save Farmer'));
}

export async function renderNewFarmer(root) {
  mount(root, el('p', { class: 'hint' }, 'Loading form…'));

  // Ask for a fix now, while the form is being filled in - by save time it
  // has usually arrived. See location.js for why this isn't done at submit.
  startLocationCapture();

  const farmerForm = await buildFarmerForm();
  const errorBox = el('div', { class: 'field-error', hidden: true });

  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green' });
  resetSaveBtnLabel(saveBtn);

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const validationError = farmerForm.validate();
        if (validationError) {
          showError(validationError);
          return;
        }
        const { fullName, phone, fieldValues } = farmerForm.getValues();

        errorBox.hidden = true;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Checking…';

        try {
          const phoneMatch = await findFarmerByPhone(phone);
          if (phoneMatch) {
            showError(
              'A farmer with this phone number is already registered: ' +
              phoneMatch.fullName + ' (FRN ' + phoneMatch.frn + '). Each phone number can only be registered once — use Find Farmer instead if this is the same person.'
            );
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
          const frn = await createFarmer({ fullName, phone, fieldValues });
          navigate('#/new-farmer/success/' + frn);
        } catch (err) {
          console.error(err);
          showError('Could not save this farmer. ' + (err.message || 'Please try again.'));
          saveBtn.disabled = false;
          resetSaveBtnLabel(saveBtn);
        }
      },
    },
    [...farmerForm.sections, errorBox, saveBtn]
  );

  mount(
    root,
    el('h1', {}, 'New Farmer'),
    el('p', { class: 'welcome' }, 'Register a new farmer.'),
    locationIndicator(locationStatus),
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
