import { el, mount, toast } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getFarmerByFrn, updateFarmer, findFarmerByPhone, farmerToFieldValues } from '../lib/db.js';
import { iconEl } from '../lib/icons.js';
import { buildFarmerForm } from '../lib/farmerForm.js';

function resetSaveBtnLabel(btn) {
  btn.replaceChildren(iconEl('check'), document.createTextNode(' Save Changes'));
}

/**
 * Edits an existing farmer, reached from that farmer's profile. Uses the
 * same schema-driven form as New Farmer (see farmerForm.js), prefilled
 * from the stored document.
 *
 * Every save writes an audit record to `farmerEdits` (see db.js
 * updateFarmer) capturing what changed, when, and which office account
 * made the change. That history is deliberately not shown anywhere in this
 * app - it's kept for the future desktop/admin app.
 */
export async function renderEditFarmer(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading farmer…'));

  const farmer = await getFarmerByFrn(frn);
  if (!farmer) {
    mount(
      root,
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device. Reconnect to the internet and try again.')
    );
    return;
  }

  const farmerForm = await buildFarmerForm({ farmer, fieldValues: farmerToFieldValues(farmer) });
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
        saveBtn.textContent = 'Saving…';

        try {
          // Same one-registration-per-phone rule New Farmer enforces - but
          // only worth checking when the number actually changed, since a
          // farmer's own existing number will always "match" themselves.
          if (phone !== farmer.phone) {
            const phoneMatch = await findFarmerByPhone(phone);
            if (phoneMatch && phoneMatch.frn !== farmer.frn) {
              showError(
                'That phone number is already registered to ' + phoneMatch.fullName + ' (FRN ' + phoneMatch.frn + '). Each phone number can only be registered once.'
              );
              saveBtn.disabled = false;
              resetSaveBtnLabel(saveBtn);
              return;
            }
          }

          const { changed, committed } = await updateFarmer({ frn: farmer.frn, fullName, phone, fieldValues, existing: farmer });

          // The commit isn't awaited - offline it stays pending forever by
          // design, and blocking on it would hang the screen. But if the
          // server actively REJECTS it, the whole batch (farmer + audit
          // record) is rolled back, so staff must be told rather than
          // walking away believing a correction was saved.
          if (committed) {
            committed.catch(() => {
              toast('That change could not be saved and has been undone. Please try again, or tell an admin.');
            });
          }

          toast(changed ? 'Changes saved.' : 'No changes to save.');
          navigate('#/farmer/' + farmer.frn);
        } catch (err) {
          console.error(err);
          showError('Could not save these changes. ' + (err.message || 'Please try again.'));
          saveBtn.disabled = false;
          resetSaveBtnLabel(saveBtn);
        }
      },
    },
    [
      ...farmerForm.sections,
      errorBox,
      saveBtn,
      el('a', { href: '#/farmer/' + farmer.frn, class: 'btn btn-secondary' }, 'Cancel'),
    ]
  );

  mount(
    root,
    el('h1', {}, 'Edit Farmer'),
    el('p', { class: 'welcome' }, farmer.fullName + ' · ' + farmer.frn),
    form
  );
}
