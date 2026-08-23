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
addRoute('/login', () => renderLogin(root), { public: true });

function renderNav() {
  const path = (location.hash.slice(1) || '/dashboard').split('/')[1];
  const link = (href, label, key) =>
    el('a', { href, class: 'nav-link' + (path === key ? ' active' : '') }, label);
  nav.replaceChildren(
    el('div', { class: 'nav-brand' }, [
      el('div', { class: 'nav-plate' }, [el('img', { src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' })]),
      el('span', {}, 'Management'),
    ]),
    el('nav', { class: 'nav-links' }, [
      link('#/dashboard', 'Dashboard', 'dashboard'),
      link('#/farmers', 'Farmers', 'farmers'),
      link('#/purchases', 'Purchases', 'purchases'),
    ]),
    el('div', { class: 'nav-user' }, [
      el('span', { class: 'muted' }, cachedProfile()?.email || ''),
      el('button', { class: 'link-btn', onClick: () => signOut() }, 'Sign out'),
    ])
  );
}

window.addEventListener('hashchange', () => {
  if (authState.ready && authState.isAdmin) renderNav();
});

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
  if (!location.hash || location.hash === '#/login') navigate('#/dashboard');
  else navigate(location.hash);
});
