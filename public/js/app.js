import './lib/firebase.js';
import { addRoute, startRouter } from './router.js';
import { initOfflineBanner } from './lib/ui.js';
import { waitForAuthReady, onAuthChange, getCurrentUser } from './lib/auth.js';
import { renderHeader } from './lib/header.js';

import { renderLogin } from './screens/login.js';
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
  await waitForAuthReady();

  startRouter({
    isAuthenticated: () => !!getCurrentUser(),
    onRouteMatched: (options, params) => {
      const backTo = typeof options.backTo === 'function' ? options.backTo(params) : options.backTo;
      renderHeader({ mode: options.headerMode, backTo });
    },
  });

  // Re-run routing whenever sign-in/out happens elsewhere (e.g. logout
  // button), so an unauthenticated user is bounced to /login immediately.
  onAuthChange(() => {
    const raw = location.hash.slice(1) || '/home';
    const isLoginRoute = raw.split('?')[0] === '/login';
    if (!getCurrentUser() && !isLoginRoute) {
      location.hash = '#/login';
    } else if (getCurrentUser() && isLoginRoute) {
      location.hash = '#/home';
    }
  });
}

start();
