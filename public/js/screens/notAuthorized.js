import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getCurrentUser, refreshAuthorization, signOutStaff, hasSeenTutorial } from '../lib/auth.js';
import { iconEl } from '../lib/icons.js';

export function renderNotAuthorized(root) {
  const user = getCurrentUser();
  const email = user ? user.email : 'your account';

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
        statusBox.textContent = 'Still not approved yet. Ask your admin to add ' + email + ' to the staff list, then try again.';
      },
    },
    'Check Again'
  );

  mount(
    root,
    el('div', { class: 'confirm-icon', style: 'color:var(--color-yellow-dark)' }, [iconEl('person')]),
    el('h1', { style: 'text-align:center' }, 'Approval Needed'),
    el(
      'p',
      { class: 'welcome', style: 'text-align:center' },
      'You’re signed in as ' + email + ', but an admin needs to approve this account before you can use the app.'
    ),
    el('hr', { class: 'hr' }),
    checkBtn,
    statusBox,
    el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => signOutStaff() }, 'Sign Out')
  );
}
