import { el, mount } from '../lib/ui.js';
import { signIn, friendlyAuthError } from '../lib/auth.js';

export function renderLogin(root) {
  const emailInput = el('input', { type: 'email', autocomplete: 'username', placeholder: 'you@malaikahoney.com', required: true });
  const passwordInput = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-maroon' }, 'Sign In');

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';
        try {
          await signIn(emailInput.value, passwordInput.value);
          // The router's auth listener takes over from here.
        } catch (err) {
          errorBox.textContent = friendlyAuthError(err);
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', {}, 'Email'), emailInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Password'), passwordInput]),
      errorBox,
      submitBtn,
    ]
  );

  mount(
    root,
    el('div', { class: 'login-card' }, [
      el('img', { class: 'login-logo', src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' }),
      el('h1', {}, 'Management'),
      el('p', { class: 'muted' }, 'Sign in with your management account.'),
      form,
    ])
  );

  emailInput.focus();
}

/** Shown to an account that signs in successfully but isn't an admin. */
export function renderNoAccess(root, email, onSignOut) {
  mount(
    root,
    el('div', { class: 'login-card' }, [
      el('img', { class: 'login-logo', src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' }),
      el('h1', {}, 'No management access'),
      el('p', { class: 'muted' }, (email || 'This account') + ' is signed in, but does not have management access.'),
      el('p', { class: 'muted' }, 'Ask an administrator to grant your account the admin role, then sign in again.'),
      el('button', { class: 'btn btn-secondary', onClick: onSignOut }, 'Sign Out'),
    ])
  );
}
