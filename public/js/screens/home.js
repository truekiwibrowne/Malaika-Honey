import { collection, getDocs, getDocsFromCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../lib/firebase.js';
import { el, mount, toast } from '../lib/ui.js';
import { iconEl } from '../lib/icons.js';
import { APP_VERSION } from '../lib/constants.js';
import { getUnverifiedPurchases } from '../lib/db.js';
import { signOutStaff, getCurrentUser, isAdminLocally } from '../lib/auth.js';
import { getSyncState } from '../lib/sync.js';
import { isPushSupported, isPushEnabledLocally, enablePushNotifications, disablePushNotifications } from '../lib/push.js';

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

/**
 * Admin-only "Enable Notifications" toggle - hidden entirely unless
 * isPushSupported() resolves true (requires a configured vapidKey, see
 * push.js and docs/Push-Notifications.md, plus browser/platform support).
 * Lets an admin opt this specific device in/out of push notifications for
 * new sign-in requests, purchases, and farmer registrations.
 */
function renderNotifToggle(isAdmin, user) {
  const btn = el('button', { type: 'button', class: 'btn btn-outline', hidden: true });

  function setState(enabled) {
    btn.replaceChildren(iconEl('bell'), document.createTextNode(enabled ? ' Notifications On' : ' Enable Notifications'));
  }

  if (!isAdmin) return btn;

  isPushSupported().then((supported) => {
    if (!supported) return;
    btn.hidden = false;
    setState(isPushEnabledLocally(user.email));

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (isPushEnabledLocally(user.email)) {
          await disablePushNotifications();
          setState(false);
          toast('Notifications turned off on this device.');
        } else {
          await enablePushNotifications();
          setState(true);
          toast('Notifications enabled on this device.');
        }
      } catch (err) {
        toast(err.message || 'Could not update notification settings.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  return btn;
}

export function renderHome(root) {
  const reconcileBanner = el('div', { hidden: true });
  const user = getCurrentUser();
  const isAdmin = !!user && isAdminLocally(user.uid);

  const approveBtn = isAdmin
    ? el('a', { href: '#/admin/approvals', class: 'btn btn-outline' }, [iconEl('idCard'), 'Approve Requests'])
    : null;
  const notifToggle = renderNotifToggle(isAdmin, user);

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
      notifToggle,
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
