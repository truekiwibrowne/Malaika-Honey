import { collection, getDocs, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../lib/firebase.js';
import { el, mount } from '../lib/ui.js';
import { createOfficeAccount, officeIdToEmail } from '../lib/auth.js';
import { iconEl } from '../lib/icons.js';

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function renderSuccess(root, name, code) {
  mount(
    root,
    el('div', { class: 'centered-screen' }, [
      el('div', { class: 'confirm-icon' }, [iconEl('check')]),
      el('h1', { style: 'text-align:center' }, 'Office Added'),
      el('p', { class: 'welcome', style: 'text-align:center' }, name + ' — code ' + code),
      el('hr', { class: 'hr' }),
      el('a', { href: '#/home', class: 'btn btn-secondary' }, [iconEl('home'), 'Return Home']),
    ])
  );
}

/**
 * Admin-only: adds a brand-new field office from within the app instead
 * of the usual Firebase Console recipe (see docs/Config-Management.md
 * "Field office provisioning") - creates all three pieces a new office
 * needs: the Firebase Auth account (auth.js createOfficeAccount, via the
 * REST API so the admin's own session is untouched), the fieldOffices
 * document (powers the Login screen's dropdown), and the allowedStaff
 * document (grants real access immediately, same as the recommended
 * Console flow, so the office never sees "Approval Needed").
 */
export function renderAddOffice(root) {
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const nameInput = el('input', { type: 'text', placeholder: 'e.g. Gulu' });
  const codeInput = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'e.g. 1215' });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-maroon' }, 'Add Office');

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const code = codeInput.value.trim();
        const officeId = slugify(name);

        if (!name || !officeId) {
          errorBox.textContent = 'Enter an office name.';
          errorBox.hidden = false;
          return;
        }
        if (!code) {
          errorBox.textContent = 'Enter a code.';
          errorBox.hidden = false;
          return;
        }

        errorBox.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding…';

        try {
          const existing = await getDocs(collection(db, 'fieldOffices'));
          if (existing.docs.some((d) => d.id === officeId)) {
            throw new Error('An office with this name already exists.');
          }
          const nextOrder = existing.docs.reduce((max, d) => Math.max(max, d.data().order || 0), 0) + 1;

          await createOfficeAccount(officeId, code);
          await setDoc(doc(db, 'fieldOffices', officeId), { label: name, order: nextOrder, active: true });
          await setDoc(doc(db, 'allowedStaff', officeIdToEmail(officeId)), {});

          renderSuccess(root, name, code);
        } catch (err) {
          errorBox.textContent = err.message || 'Could not add this office. Please try again.';
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add Office';
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', {}, 'Office Name'), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Code'), codeInput]),
      errorBox,
      submitBtn,
    ]
  );

  mount(root, el('h1', {}, 'Add Office'), el('p', { class: 'welcome' }, 'Add a new field office.'), form);

  nameInput.focus();
}
