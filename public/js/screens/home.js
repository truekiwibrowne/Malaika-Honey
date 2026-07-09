import { collection, getDocs, getDocsFromCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../lib/firebase.js';
import { el, mount } from '../lib/ui.js';
import { iconEl } from '../lib/icons.js';
import { APP_VERSION } from '../lib/constants.js';
import { getUnverifiedPurchases } from '../lib/db.js';
import { signOutStaff, getCurrentUser, isAdminLocally } from '../lib/auth.js';
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
  const user = getCurrentUser();
  const isAdmin = !!user && isAdminLocally(user.uid);

  const approveBtn = isAdmin
    ? el('a', { href: '#/admin/approvals', class: 'btn btn-outline' }, [iconEl('idCard'), 'Approve Requests'])
    : null;

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
      approveBtn,
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

  if (isAdmin && approveBtn) {
    const ref = collection(db, 'signupRequests');
    (navigator.onLine ? getDocs(ref) : getDocsFromCache(ref))
      .then((snap) => {
        const pending = snap.docs.filter((d) => d.data().status === 'pending').length;
        if (pending > 0) {
          approveBtn.replaceChildren(iconEl('idCard'), document.createTextNode(' Approve Requests (' + pending + ')'));
        }
      })
      .catch(() => {});
  }
}
