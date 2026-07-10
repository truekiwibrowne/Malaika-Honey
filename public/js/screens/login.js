import { el, mount } from '../lib/ui.js';
import { signInWithGoogle, signInWithPhone, createAccountWithPhone, signInWithOfficeCode } from '../lib/auth.js';
import { GOOGLE_SIGNIN_ENABLED, PHONE_SIGNIN_ENABLED } from '../lib/constants.js';
import { getFieldOffices } from '../lib/referenceData.js';

/**
 * Primary sign-in UI: pick the office, type its code - one shared
 * account per office, provisioned by an admin (see
 * docs/Config-Management.md "Field office provisioning"), not
 * self-service. Deliberately minimal text throughout this screen - many
 * field staff don't read/speak English well.
 */
function renderOfficeForm(offices) {
  const errorBox = el('div', { class: 'field-error', hidden: true });

  const officeSelect = el(
    'select',
    {},
    offices.map((o) => el('option', { value: o.id }, o.label))
  );

  const codeInput = el('input', {
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'current-password',
    placeholder: 'Code',
  });

  const submitBtn = el('button', { type: 'submit', class: 'btn btn-maroon' }, 'Sign In');

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const officeId = officeSelect.value;
        const code = codeInput.value;

        if (!officeId || !code) {
          errorBox.textContent = 'Enter the code.';
          errorBox.hidden = false;
          return;
        }

        errorBox.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        try {
          await signInWithOfficeCode(officeId, code);
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', {}, 'Office'), officeSelect]),
      el('div', { class: 'field' }, [el('label', {}, 'Code'), codeInput]),
      errorBox,
      submitBtn,
    ]
  );

  return form;
}

function phoneModeSwitch(mode, onSelect) {
  const group = el('div', { class: 'choice-group' });
  [
    { id: 'signin', label: 'Sign In' },
    { id: 'create', label: 'Create Account' },
  ].forEach((opt) => {
    const chip = el(
      'button',
      {
        type: 'button',
        class: 'choice-chip' + (opt.id === mode ? ' selected' : ''),
        onClick: () => onSelect(opt.id),
      },
      opt.label
    );
    group.appendChild(chip);
  });
  return group;
}

/**
 * Hidden by default behind PHONE_SIGNIN_ENABLED (constants.js) now that
 * office+code is primary - kept fully working, unchanged, so it can be
 * restored with no rewrite.
 */
function renderPhoneForm() {
  let mode = 'signin';

  const errorBox = el('div', { class: 'field-error', hidden: true });

  const nameField = el('div', { class: 'field', hidden: true }, [
    el('label', {}, 'Full Name'),
    el('input', { type: 'text', autocomplete: 'name', placeholder: 'e.g. Jane Nakato' }),
  ]);
  const nameInput = nameField.querySelector('input');

  const phoneInput = el('input', {
    type: 'tel',
    autocomplete: 'tel',
    placeholder: 'e.g. 0772123456',
  });

  const passwordInput = el('input', {
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Password',
  });

  const submitBtn = el('button', { type: 'submit', class: 'btn btn-outline' }, 'Sign In');

  function applyMode() {
    nameField.hidden = mode !== 'create';
    passwordInput.autocomplete = mode === 'create' ? 'new-password' : 'current-password';
    submitBtn.textContent = mode === 'create' ? 'Create Account' : 'Sign In';
    errorBox.hidden = true;
  }

  const modeIds = ['signin', 'create'];
  const switcher = phoneModeSwitch(mode, (next) => {
    mode = next;
    switcher.querySelectorAll('.choice-chip').forEach((c, i) => {
      c.classList.toggle('selected', modeIds[i] === mode);
    });
    applyMode();
  });

  return el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const phone = phoneInput.value.trim();
        const password = passwordInput.value;
        const name = nameInput.value.trim();

        if (!phone || !password) {
          errorBox.textContent = 'Please enter your phone number and password.';
          errorBox.hidden = false;
          return;
        }
        if (mode === 'create' && !name) {
          errorBox.textContent = 'Please enter your full name.';
          errorBox.hidden = false;
          return;
        }

        errorBox.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = mode === 'create' ? 'Creating account…' : 'Signing in…';

        try {
          if (mode === 'create') {
            await createAccountWithPhone(phone, password, name);
          } else {
            await signInWithPhone(phone, password);
          }
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'create' ? 'Create Account' : 'Sign In';
        }
      },
    },
    [
      switcher,
      nameField,
      el('div', { class: 'field' }, [el('label', {}, 'Phone Number'), phoneInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Password'), passwordInput]),
      errorBox,
      submitBtn,
    ]
  );
}

function renderGoogleButton() {
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const googleBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-outline',
      onClick: async () => {
        errorBox.hidden = true;
        googleBtn.disabled = true;
        googleBtn.textContent = 'Redirecting to Google…';
        try {
          await signInWithGoogle();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          googleBtn.disabled = false;
          googleBtn.textContent = 'Sign in with Google';
        }
      },
    },
    'Sign in with Google'
  );
  return el('div', {}, [googleBtn, errorBox]);
}

export async function renderLogin(root) {
  mount(root, el('div', { class: 'centered-screen' }, [el('p', { class: 'hint' }, 'Loading…')]));

  const offices = await getFieldOffices();

  const children = [el('h1', { style: 'text-align:center' }, 'Sign In'), renderOfficeForm(offices)];

  if (PHONE_SIGNIN_ENABLED) children.push(el('hr', { class: 'hr' }), renderPhoneForm());
  if (GOOGLE_SIGNIN_ENABLED) children.push(renderGoogleButton());

  mount(root, el('div', { class: 'centered-screen' }, children));
}
