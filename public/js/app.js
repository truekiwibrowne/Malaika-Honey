import './lib/firebase.js';
import { addRoute, startRouter } from './router.js';
import { initOfflineBanner, toast } from './lib/ui.js';
import {
  waitForAuthReady,
  onAuthChange,
  getCurrentUser,
  consumeRedirectResult,
  refreshAuthorization,
  isAuthorizedLocally,
  hasSeenTutorial,
} from './lib/auth.js';
import { renderHeader } from './lib/header.js';

import { renderLogin } from './screens/login.js';
import { renderHome } from './screens/home.js';

const root = document.getElementById('screen-root');

// Only login and home - the two possible landing screens on a cold open
// - are imported eagerly above. Every other screen is fetched on first
// visit instead, so a cold app open doesn't have to download and parse
// every screen in the app before it can show the one the user actually
// asked for. Each of these is precached by the service worker (see
// sw.js) after the first load, so this only costs a network round trip
// once per device.
addRoute('/login', () => renderLogin(root), { public: true, headerMode: 'login' });
addRoute('/not-authorized', async () => {
  const { renderNotAuthorized } = await import('./screens/notAuthorized.js');
  renderNotAuthorized(root);
}, { headerMode: 'sub', backTo: '#/login', skipAuthorizationCheck: true });
addRoute('/tutorial', async () => {
  const { renderTutorial } = await import('./screens/tutorial.js');
  renderTutorial(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/home', () => renderHome(root), { headerMode: 'home' });
addRoute('/reconcile', async () => {
  const { renderReconcile } = await import('./screens/reconcile.js');
  renderReconcile(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/admin/approvals', async () => {
  const { renderAdminApprovals } = await import('./screens/adminApprovals.js');
  renderAdminApprovals(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/new-farmer', async () => {
  const { renderNewFarmer } = await import('./screens/newFarmer.js');
  renderNewFarmer(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/new-farmer/success/:frn', async (params) => {
  const { renderNewFarmerSuccess } = await import('./screens/newFarmer.js');
  renderNewFarmerSuccess(root, params);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/find-farmer', async () => {
  const { renderFindFarmer } = await import('./screens/findFarmer.js');
  renderFindFarmer(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/farmer/:frn', async (params) => {
  const { renderFarmerProfile } = await import('./screens/farmerProfile.js');
  renderFarmerProfile(root, params);
}, { headerMode: 'sub', backTo: '#/find-farmer' });
addRoute('/buy', async () => {
  const { renderBuyProduceEntry } = await import('./screens/buyProduce.js');
  renderBuyProduceEntry(root);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/buy/:frn', async (params) => {
  const { renderBuyProduce } = await import('./screens/buyProduce.js');
  renderBuyProduce(root, params);
}, { headerMode: 'sub', backTo: '#/buy' });
addRoute('/buy/:frn/success/:purchaseId', async (params) => {
  const { renderBuyProduceSuccess } = await import('./screens/buyProduce.js');
  renderBuyProduceSuccess(root, params);
}, { headerMode: 'sub', backTo: '#/home' });
addRoute('/history/:frn', async (params) => {
  const { renderHistory } = await import('./screens/history.js');
  renderHistory(root, params);
}, { headerMode: 'sub', backTo: (params) => '#/farmer/' + params.frn });
addRoute('/card/:frn', async (params) => {
  const { renderCard } = await import('./screens/card.js');
  renderCard(root, params);
}, { headerMode: 'sub', backTo: (params) => '#/farmer/' + params.frn });

initOfflineBanner();

// Caches the app shell itself (see public/sw.js) so a fresh, offline
// navigation - e.g. reopening the app after it was force-quit with no
// connection - can still load, instead of the browser's own "no
// internet" error page. Separate from, and in addition to, Firestore's
// own offline data cache.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('[Malaika Honey] Service worker registration failed:', err.message);
  });
}

async function start() {
  try {
    await consumeRedirectResult();
  } catch (err) {
    toast(err.message);
  }

  const user = await waitForAuthReady();
  if (user && !isAuthorizedLocally(user.uid)) {
    // Only block first paint on the network for a device that hasn't
    // confirmed this staff member before - otherwise a reload landing
    // directly on an authenticated route (not /login) would get bounced
    // to /not-authorized just because the check hadn't run yet. A
    // previously-approved staff member on a reload/reopen must NOT wait
    // on a live round trip here (see docs/QA-Testing.md "no repeated
    // approval check hitting the network") - that's what was adding
    // several seconds to every app open.
    await refreshAuthorization(user);
  }

  startRouter({
    isAuthenticated: () => !!getCurrentUser(),
    isAuthorized: () => {
      const current = getCurrentUser();
      return !!current && isAuthorizedLocally(current.uid);
    },
    onRouteMatched: (options, params) => {
      const backTo = typeof options.backTo === 'function' ? options.backTo(params) : options.backTo;
      renderHeader({ mode: options.headerMode, backTo });
    },
  });

  if (user && isAuthorizedLocally(user.uid)) {
    // Already confirmed on this device - refresh quietly in the
    // background (after the UI is already up) so a since-revoked staff
    // member still gets caught out eventually, without holding up every
    // single app open on a network round trip.
    refreshAuthorization(user);
  }

  // Re-run routing whenever sign-in/out happens elsewhere (e.g. logout
  // button, or a fresh Google sign-in completing).
  onAuthChange(async () => {
    const raw = location.hash.slice(1) || '/home';
    const path = raw.split('?')[0];
    const current = getCurrentUser();

    if (!current) {
      if (path !== '/login') location.hash = '#/login';
      return;
    }

    // Only decide where a *fresh* sign-in goes if they were actually on
    // the login screen - otherwise this fires harmlessly on every reload
    // (onAuthStateChanged always replays the current state once) and must
    // not yank someone away from whatever authenticated route they're
    // already on.
    if (path === '/login') {
      const approved = await refreshAuthorization(current);
      location.hash = !approved ? '#/not-authorized' : hasSeenTutorial(current.uid) ? '#/home' : '#/tutorial';
    }
  });
}

start();
