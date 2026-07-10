import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getCurrentUser, refreshAuthorization, signOutStaff, hasSeenTutorial, identityLabel } from '../lib/auth.js';
import { iconEl } from '../lib/icons.js';

export function renderNotAuthorized(root) {
  const user = getCurrentUser();
  const email = identityLabel(user);

  const statusBox = el('p', { class: 'hint' });

  const checkBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-maroon',
      onClick: async () => {
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking…';
        const user = getCurrentUser();
        const approved = await refreshAuthorization(user);
        if (approved) {
          navigate(hasSeenTutorial(user.uid) ? '#/home' : '#/tutorial');
          return;
        }
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check Again';
        statusBox.textContent = 'Not yet. Ask your admin.';
      },
    },
    'Check Again'
  );

  mount(
    root,
    el('div', { class: 'centered-screen' }, [
      el('div', { class: 'confirm-icon', style: 'color:var(--color-yellow-dark)' }, [iconEl('person')]),
      el('h1', { style: 'text-align:center' }, 'Approval Needed'),
      el('p', { class: 'welcome', style: 'text-align:center' }, email),
      el('hr', { class: 'hr' }),
      checkBtn,
      statusBox,
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => signOutStaff() }, 'Sign Out'),
    ])
  );
}
