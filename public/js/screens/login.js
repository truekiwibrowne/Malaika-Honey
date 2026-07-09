import { el, mount } from '../lib/ui.js';
import { signInWithGoogle, signInWithPhone, createAccountWithPhone } from '../lib/auth.js';
import { GOOGLE_SIGNIN_ENABLED } from '../lib/constants.js';

function modeSwitch(mode, onSelect) {
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

export function renderLogin(root) {
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

  const submitBtn = el('button', { type: 'submit', class: 'btn btn-maroon' }, 'Sign In');

  const helpText = el(
    'p',
    { class: 'hint', style: 'text-align:center;margin-top:10px' },
    'Your account must be approved by an admin before you can use the app — if you’re new, create an account and then let your admin know so they can approve it.'
  );

  function applyMode() {
    nameField.hidden = mode !== 'create';
    passwordInput.autocomplete = mode === 'create' ? 'new-password' : 'current-password';
    submitBtn.textContent = mode === 'create' ? 'Create Account' : 'Sign In';
    errorBox.hidden = true;
  }

  const modeIds = ['signin', 'create'];
  const switcher = modeSwitch(mode, (next) => {
    mode = next;
    switcher.querySelectorAll('.choice-chip').forEach((c, i) => {
      c.classList.toggle('selected', modeIds[i] === mode);
    });
    applyMode();
  });

  const form = el(
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

  const children = [
    el('h1', { style: 'text-align:center' }, 'Sign In'),
    el('p', { class: 'welcome', style: 'text-align:center' }, 'Enter your phone number and password to use the app.'),
    form,
    helpText,
  ];

  if (GOOGLE_SIGNIN_ENABLED) {
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
    children.push(googleBtn);
  }

  mount(root, el('div', { class: 'centered-screen' }, children));

  phoneInput.focus();
}
