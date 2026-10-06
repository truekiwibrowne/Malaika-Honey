import { addRoute, startRouter, navigate } from './router.js';
import { el, mount, spinner } from './lib/ui.js';
import { onAuthChange, loadAdminProfile, signOut, cachedProfile, currentUser } from './lib/auth.js';
import { renderLogin, renderNoAccess } from './screens/login.js';

const root = document.getElementById('view');
const shell = document.getElementById('shell');
const nav = document.getElementById('nav');

let authState = { ready: false, user: null, isAdmin: false };

function showLoading(message) {
  mount(root, spinner(message));
}

// Screens are imported on demand, same reasoning as the field app's
// app.js - nothing but the login screen is needed until someone signs in.
addRoute('/dashboard', async () => {
  showLoading('Loading dashboard…');
  const { renderDashboard } = await import('./screens/dashboard.js');
  renderDashboard(root);
});
addRoute('/regions', async () => {
  showLoading('Loading map…');
  const { renderRegions } = await import('./screens/regions.js');
  renderRegions(root);
});
addRoute('/farmers', async () => {
  showLoading('Loading farmers…');
  const { renderFarmers } = await import('./screens/farmers.js');
  renderFarmers(root);
});
addRoute('/farmers/:frn', async (params) => {
  showLoading('Loading farmer…');
  const { renderFarmerDetail } = await import('./screens/farmerDetail.js');
  renderFarmerDetail(root, params);
});
addRoute('/purchases', async () => {
  showLoading('Loading purchases…');
  const { renderPurchases } = await import('./screens/purchases.js');
  renderPurchases(root);
});
addRoute('/purchases/:purchaseId', async (params) => {
  showLoading('Loading purchase…');
  const { renderPurchaseDetail } = await import('./screens/purchaseDetail.js');
  renderPurchaseDetail(root, params);
});
addRoute('/import', async () => {
  showLoading('Loading…');
  const { renderImportData } = await import('./screens/importData.js');
  renderImportData(root);
});
addRoute('/checks', async () => {
  showLoading('Checking records…');
  const { renderDataHealth } = await import('./screens/dataHealth.js');
  renderDataHealth(root);
});
addRoute('/settings', async () => {
  showLoading('Loading settings…');
  const { renderSettings } = await import('./screens/settings.js');
  renderSettings(root);
});
addRoute('/login', () => renderLogin(root), { public: true });

// ------------------------------------------------------------ sidebar width
// Remembered per browser. Dragging the sidebar's edge resizes it;
// double-clicking the edge puts it back to the default.
const NAV_DEFAULT = 232;
const NAV_MIN = 180;
const NAV_MAX = 420;
function setNavWidth(px, save = true) {
  const w = Math.round(Math.min(NAV_MAX, Math.max(NAV_MIN, px)));
  document.documentElement.style.setProperty('--nav-width', w + 'px');
  if (save) {
    try {
      localStorage.setItem('mh-admin-nav-width', String(w));
    } catch {
      /* private mode - width just isn't remembered */
    }
  }
}
try {
  const saved = Number(localStorage.getItem('mh-admin-nav-width'));
  if (saved) setNavWidth(saved, false);
} catch {
  /* ignore */
}

function navResizer() {
  const handle = el('div', { class: 'nav-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize menu', tabindex: '0', title: 'Drag to resize · double-click to reset' });
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => setNavWidth(ev.clientX);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      window.dispatchEvent(new Event('resize')); // let maps/charts re-measure
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('dblclick', () => {
    setNavWidth(NAV_DEFAULT);
    window.dispatchEvent(new Event('resize'));
  });
  handle.addEventListener('keydown', (e) => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-width'), 10) || NAV_DEFAULT;
    if (e.key === 'ArrowLeft') setNavWidth(current - 16);
    if (e.key === 'ArrowRight') setNavWidth(current + 16);
  });
  return handle;
}

// Open Data checks issues, shown as a badge on the menu item. The checks
// module (and the data layer behind it) loads only after sign-in.
let checksCount = 0;
const checksModule = () => import('./lib/checks.js');
function updateChecksBadge(n) {
  checksCount = n;
  const badge = document.getElementById('checks-badge');
  if (badge) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = !n;
    badge.title = n + ' data check' + (n === 1 ? '' : 's') + ' to review';
  }
}
let badgeHooked = false;
// Any screen that changes something checks look at fires this.
window.addEventListener('mh:data-changed', () => {
  if (authState.isAdmin) checksModule().then((m) => m.refreshChecksBadge());
});

function renderNav() {
  const path = (location.hash.slice(1) || '/dashboard').split('?')[0].split('/')[1];
  const link = (href, label, key, extra = null) =>
    el('a', { href, class: 'nav-link' + (path === key ? ' active' : '') }, [label, extra]);
  nav.replaceChildren(
    el('div', { class: 'nav-brand' }, [
      el('div', { class: 'nav-plate' }, [el('img', { src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' })]),
      el('span', {}, 'Management'),
    ]),
    el('nav', { class: 'nav-links' }, [
      link('#/dashboard', 'Dashboard', 'dashboard'),
      link('#/regions', 'Regions & map', 'regions'),
      link('#/farmers', 'Farmers', 'farmers'),
      link('#/purchases', 'Purchases', 'purchases'),
      el('div', { class: 'nav-sep' }),
      link('#/import', 'Import & Export', 'import'),
      link('#/checks', 'Data checks', 'checks', el('span', { id: 'checks-badge', class: 'nav-badge', hidden: !checksCount }, checksCount > 99 ? '99+' : String(checksCount))),
      link('#/settings', 'Settings', 'settings'),
    ]),
    el('div', { class: 'nav-user' }, [
      el('span', { class: 'muted' }, cachedProfile()?.email || ''),
      el('button', { class: 'link-btn', onClick: () => signOut() }, 'Sign out'),
    ]),
    navResizer()
  );
}

window.addEventListener('hashchange', () => {
  if (authState.ready && authState.isAdmin) renderNav();
});

// The router runs before Firebase has restored the session, so on a reload
// it briefly redirects to #/login - remember where the person was going so
// a refresh or a pasted link (e.g. #/farmers?district=Arua) lands there.
let pendingHash = location.hash && !location.hash.startsWith('#/login') ? location.hash : null;

startRouter({
  isAuthenticated: () => authState.ready && authState.isAdmin,
});

onAuthChange(async (user) => {
  if (!user) {
    authState = { ready: true, user: null, isAdmin: false };
    shell.classList.add('signed-out');
    nav.replaceChildren();
    navigate('#/login');
    renderLogin(root);
    return;
  }

  showLoading('Checking access…');
  let profile = null;
  try {
    profile = await loadAdminProfile(user);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not verify your access: ' + (err.message || 'unknown error')));
    return;
  }

  if (!profile || !profile.isAdmin) {
    authState = { ready: true, user, isAdmin: false };
    shell.classList.add('signed-out');
    nav.replaceChildren();
    renderNoAccess(root, user.email, () => signOut());
    return;
  }

  authState = { ready: true, user, isAdmin: true };
  shell.classList.remove('signed-out');
  renderNav();
  checksModule().then((m) => {
    if (!badgeHooked) {
      m.onChecksCount(updateChecksBadge);
      badgeHooked = true;
    }
    m.refreshChecksBadge();
  });
  const target = pendingHash || (!location.hash || location.hash === '#/login' ? '#/dashboard' : location.hash);
  pendingHash = null;
  navigate(target);
});
