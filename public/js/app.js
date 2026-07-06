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
import { renderNotAuthorized } from './screens/notAuthorized.js';
import { renderTutorial } from './screens/tutorial.js';
import { renderHome } from './screens/home.js';
import { renderNewFarmer, renderNewFarmerSuccess } from './screens/newFarmer.js';
import { renderFindFarmer } from './screens/findFarmer.js';
import { renderFarmerProfile } from './screens/farmerProfile.js';
import { renderBuyProduce, renderBuyProduceEntry, renderBuyProduceSuccess } from './screens/buyProduce.js';
import { renderHistory } from './screens/history.js';
import { renderCard } from './screens/card.js';
import { renderReconcile } from './screens/reconcile.js';

const root = document.getElementById('screen-root');

addRoute('/login', () => renderLogin(root), { public: true, headerMode: 'login' });
addRoute('/not-authorized', () => renderNotAuthorized(root), { headerMode: 'sub', backTo: '#/login', skipAuthorizationCheck: true });
addRoute('/tutorial', () => renderTutorial(root), { headerMode: 'sub', backTo: '#/home' });
addRoute('/home', () => renderHome(root), { headerMode: 'home' });
addRoute('/reconcile', () => renderReconcile(root), { headerMode: 'sub', backTo: '#/home' });
addRoute('/new-farmer', () => renderNewFarmer(root), { headerMode: 'sub', backTo: '#/home' });
addRoute('/new-farmer/success/:frn', (params) => renderNewFarmerSuccess(root, params), { headerMode: 'sub', backTo: '#/home' });
addRoute('/find-farmer', () => renderFindFarmer(root), { headerMode: 'sub', backTo: '#/home' });
addRoute('/farmer/:frn', (params) => renderFarmerProfile(root, params), { headerMode: 'sub', backTo: '#/find-farmer' });
addRoute('/buy', () => renderBuyProduceEntry(root), { headerMode: 'sub', backTo: '#/home' });
addRoute('/buy/:frn', (params) => renderBuyProduce(root, params), { headerMode: 'sub', backTo: '#/buy' });
addRoute('/buy/:frn/success/:purchaseId', (params) => renderBuyProduceSuccess(root, params), { headerMode: 'sub', backTo: '#/home' });
addRoute('/history/:frn', (params) => renderHistory(root, params), { headerMode: 'sub', backTo: (params) => '#/farmer/' + params.frn });
addRoute('/card/:frn', (params) => renderCard(root, params), { headerMode: 'sub', backTo: (params) => '#/farmer/' + params.frn });

initOfflineBanner();

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
