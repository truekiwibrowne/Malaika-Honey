import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { signIn, hasSeenTutorial } from '../lib/auth.js';

export function renderLogin(root) {
  const errorBox = el('div', { class: 'field-error', hidden: true });
  const usernameInput = el('input', { type: 'text', id: 'username', autocapitalize: 'off', autocorrect: 'off', placeholder: 'e.g. jokello' });
  const passwordInput = el('input', { type: 'password', id: 'password', placeholder: 'Password' });

  const signInBtn = el('button', { type: 'submit', class: 'btn btn-maroon' }, 'Sign In');

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        if (!username || !password) {
          errorBox.textContent = 'Enter your username and password.';
          errorBox.hidden = false;
          return;
        }
        errorBox.hidden = true;
        signInBtn.disabled = true;
        signInBtn.textContent = 'Signing in…';
        try {
          const user = await signIn(username, password);
          navigate(hasSeenTutorial(user.uid) ? '#/home' : '#/tutorial');
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          signInBtn.disabled = false;
          signInBtn.textContent = 'Sign In';
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', {}, 'Username'), usernameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Password'), passwordInput]),
      errorBox,
      signInBtn,
    ]
  );

  mount(
    root,
    el('h1', {}, 'Sign In'),
    el('p', { class: 'welcome' }, 'Enter your staff username and password.'),
    form,
    el('p', { class: 'hint', style: 'text-align:center;margin-top:10px' }, "Forgotten password? Ask your admin to reset it.")
  );
}
