import { el, mount } from '../lib/ui.js';
import { iconEl } from '../lib/icons.js';
import { APP_VERSION } from '../lib/constants.js';
import { getUnverifiedPurchases } from '../lib/db.js';
import { signOutStaff } from '../lib/auth.js';
import { getSyncState } from '../lib/sync.js';

function handleSignOut() {
  if (getSyncState() !== 'synced') {
    const proceed = window.confirm(
      'Some of your work hasn’t finished syncing yet. If you sign out now, it may not be saved to the server. Sign out anyway?'
    );
    if (!proceed) return;
  } else if (!window.confirm('Sign out?')) {
    return;
  }
  signOutStaff();
}

export function renderHome(root) {
  const reconcileBanner = el('div', { hidden: true });

  mount(
    root,
    el('h1', {}, 'Welcome'),
    el('p', { class: 'welcome' }, 'What would you like to do?'),
    reconcileBanner,
    el('hr', { class: 'hr' }),
    el('div', { class: 'home-buttons' }, [
      el(
        'a',
        { href: '#/find-farmer', class: 'btn btn-blue' },
        [iconEl('search'), 'Existing Farmer']
      ),
      el(
        'a',
        { href: '#/new-farmer', class: 'btn btn-maroon' },
        [iconEl('plus'), 'New Farmer']
      ),
      el(
        'a',
        { href: '#/buy', class: 'btn btn-yellow' },
        [iconEl('honeyJar'), 'Buy Produce']
      ),
    ]),
    el('button', { type: 'button', class: 'btn btn-secondary', onClick: handleSignOut }, [iconEl('logout'), 'Sign Out']),
    el('div', { class: 'home-footer' }, [
      el('p', {}, 'Malaika Honey Field App'),
      el('p', {}, 'v' + APP_VERSION),
    ])
  );

  getUnverifiedPurchases()
    .then((purchases) => {
      if (!purchases.length) return;
      reconcileBanner.hidden = false;
      reconcileBanner.replaceChildren(
        el('a', { href: '#/reconcile', class: 'reconcile-banner' }, [
          iconEl('search'),
          purchases.length + ' purchase' + (purchases.length === 1 ? '' : 's') + ' need' + (purchases.length === 1 ? 's' : '') + ' a farmer match — tap to fix',
        ])
      );
    })
    .catch(() => {});
}
