import { el } from './ui.js';
import { iconEl } from './icons.js';
import { navigate } from '../router.js';
import { onSyncStateChange } from './sync.js';
import { signOutStaff } from './auth.js';

const headerEl = document.getElementById('app-header');

const SYNC_LABELS = { synced: 'Synced', 'not-synced': 'Not Synced', offline: 'Offline' };

// One persistent badge element, kept alive across every renderHeader()
// call and just relocated into whichever header layout is current - its
// content is driven entirely by the sync state subscription, not by
// route changes, so it stays live no matter which screen is showing.
const syncBadge = el('span', { class: 'sync-badge' });
let currentSyncState = 'synced';

function renderSyncBadge(state) {
  currentSyncState = state;
  syncBadge.className = 'sync-badge sync-' + state;
  syncBadge.textContent = SYNC_LABELS[state] || state;
}

onSyncStateChange(renderSyncBadge);

function iconButton(iconName, label, onClick) {
  return el('button', { type: 'button', class: 'header-icon-btn', 'aria-label': label, title: label, onClick }, [iconEl(iconName)]);
}

function handleLogout() {
  if (currentSyncState !== 'synced') {
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
 * mode: 'home' | 'sub' | 'login'. backTo: hash to navigate to for the
 * back button on 'sub' screens (defaults to history-less #/home).
 */
export function renderHeader({ mode = 'sub', backTo = '#/home' } = {}) {
  const logo = el('img', { class: 'logo', src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' });

  if (mode === 'login') {
    headerEl.replaceChildren(logo);
    return;
  }

  if (mode === 'home') {
    headerEl.replaceChildren(logo, el('div', { class: 'header-spacer' }), syncBadge);
    return;
  }

  headerEl.replaceChildren(
    iconButton('back', 'Back', () => navigate(backTo)),
    iconButton('home', 'Home', () => navigate('#/home')),
    el('div', { class: 'header-spacer' }),
    syncBadge,
    iconButton('logout', 'Sign out', handleLogout)
  );
}
