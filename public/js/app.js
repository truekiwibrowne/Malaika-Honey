import './lib/firebase.js';
import { addRoute, startRouter } from './router.js';
import { initOfflineBanner, toast, el, mount } from './lib/ui.js';
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

const root = document.getElementById('screen-root');

/**
 * Every screen module is imported lazily, on demand, right here - not
 * eagerly at the top of this file - so a first, uncached load only ever
 * fetches+parses the ONE screen actually being visited (plus the small
 * shared libs above) instead of all of them. This was the single biggest
 * factor in a slow first load on a real mobile connection: this file
 * used to statically import all 12 screens up front, meaning every
 * screen's JS (and whatever it in turn imports, e.g. db.js,
 * referenceData.js) had to load before even the Login screen could
 * render. The dynamic import() below is native ES modules, no bundler
 * needed - consistent with this app's "no build step" design (see
 * docs/System-Architecture.md). public/sw.js's precache list is
 * unaffected - it still warms every screen into the offline cache
 * eventually, this only changes what blocks the very first paint.
 */
function lazyRoute(loader, render) {
  return async (params, query) => {
    mount(root, el('p', { class: 'hint' }, 'Loading…'));
    const mod = await loader();
    render(mod, params, query);
  };
}

addRoute('/login', lazyRoute(() => import('./screens/login.js'), (m) => m.renderLogin(root)), {
  public: true,
  headerMode: 'login',
});
addRoute('/not-authorized', lazyRoute(() => import('./screens/notAuthorized.js'), (m) => m.renderNotAuthorized(root)), {
  headerMode: 'sub',
  backTo: '#/login',
  skipAuthorizationCheck: true,
});
addRoute('/tutorial', lazyRoute(() => import('./screens/tutorial.js'), (m) => m.renderTutorial(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute('/home', lazyRoute(() => import('./screens/home.js'), (m) => m.renderHome(root)), { headerMode: 'home' });
addRoute('/reconcile', lazyRoute(() => import('./screens/reconcile.js'), (m) => m.renderReconcile(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute('/admin/approvals', lazyRoute(() => import('./screens/adminApprovals.js'), (m) => m.renderAdminApprovals(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute('/new-farmer', lazyRoute(() => import('./screens/newFarmer.js'), (m) => m.renderNewFarmer(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute(
  '/new-farmer/success/:frn',
  lazyRoute(() => import('./screens/newFarmer.js'), (m, params) => m.renderNewFarmerSuccess(root, params)),
  { headerMode: 'sub', backTo: '#/home' }
);
addRoute('/find-farmer', lazyRoute(() => import('./screens/findFarmer.js'), (m) => m.renderFindFarmer(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute(
  '/farmer/:frn',
  lazyRoute(() => import('./screens/farmerProfile.js'), (m, params) => m.renderFarmerProfile(root, params)),
  { headerMode: 'sub', backTo: '#/find-farmer' }
);
addRoute('/buy', lazyRoute(() => import('./screens/buyProduce.js'), (m) => m.renderBuyProduceEntry(root)), {
  headerMode: 'sub',
  backTo: '#/home',
});
addRoute(
  '/buy/:frn',
  lazyRoute(() => import('./screens/buyProduce.js'), (m, params) => m.renderBuyProduce(root, params)),
  { headerMode: 'sub', backTo: '#/buy' }
);
addRoute(
  '/buy/:frn/success/:purchaseId',
  lazyRoute(() => import('./screens/buyProduce.js'), (m, params) => m.renderBuyProduceSuccess(root, params)),
  { headerMode: 'sub', backTo: '#/home' }
);
addRoute(
  '/history/:frn',
  lazyRoute(() => import('./screens/history.js'), (m, params) => m.renderHistory(root, params)),
  { headerMode: 'sub', backTo: (params) => '#/farmer/' + params.frn }
);
addRoute('/card/:frn', lazyRoute(() => import('./screens/card.js'), (m, params) => m.renderCard(root, params)), {
  headerMode: 'sub',
  backTo: (params) => '#/farmer/' + params.frn,
});

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
  if (user) {
    // Resolve authorization before the router's first route match, so a
    // reload landing directly on an authenticated route (not /login)
    // doesn't get bounced to /not-authorized just because the check
    // hadn't run yet.
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
