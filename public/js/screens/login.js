import { el, mount } from '../lib/ui.js';
import { signInWithGoogle } from '../lib/auth.js';

export function renderLogin(root) {
  const errorBox = el('div', { class: 'field-error', hidden: true });

  const signInBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-maroon',
      onClick: async () => {
        errorBox.hidden = true;
        signInBtn.disabled = true;
        signInBtn.textContent = 'Redirecting to Google…';
        try {
          await signInWithGoogle();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          signInBtn.disabled = false;
          signInBtn.textContent = 'Sign in with Google';
        }
      },
    },
    'Sign in with Google'
  );

  mount(
    root,
    el('h1', {}, 'Sign In'),
    el('p', { class: 'welcome' }, 'Sign in with your Google account to use the app.'),
    errorBox,
    signInBtn,
    el(
      'p',
      { class: 'hint', style: 'text-align:center;margin-top:10px' },
      'Your account must be approved by an admin before you can use the app — if you’re new, sign in once and then let your admin know so they can approve your email.'
    )
  );
}
