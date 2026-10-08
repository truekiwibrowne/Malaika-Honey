import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getCurrentUser, refreshAuthorization, signOutStaff, hasSeenTutorial, identityLabel, syntheticEmailKind } from '../lib/auth.js';
import { iconEl } from '../lib/icons.js';

export function renderNotAuthorized(root) {
  const user = getCurrentUser();
  const email = identityLabel(user);

  const statusBox = el('p', { class: 'hint' });
  // Say what is actually wrong and who can fix it - an office here has
  // signed in with the right code, but its access is off (never approved,
  // or revoked in the management app), so retrying the code won't help.
  const isOffice = user && syntheticEmailKind(user.email) === 'office';
  const explain = el('p', { class: 'welcome', style: 'text-align:center' }, isOffice
    ? 'The code is right, but this office’s access is switched off. Ask your manager to approve “' + email + '” in the management app (Settings → Staff access), then tap Check Again.'
    : 'Your sign-in worked, but this account hasn’t been approved yet. Ask your manager to approve it, then tap Check Again.');

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
        statusBox.textContent = 'Not approved yet. Ask your manager, then try again.';
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
      explain,
      el('hr', { class: 'hr' }),
      checkBtn,
      statusBox,
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => signOutStaff() }, 'Sign Out'),
    ])
  );
}
