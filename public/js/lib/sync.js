import { waitForPendingWrites } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';

let pendingCount = 0;
const listeners = new Set();

function currentState() {
  if (!navigator.onLine) return 'offline';
  return pendingCount > 0 ? 'not-synced' : 'synced';
}

function notify() {
  const state = currentState();
  listeners.forEach((fn) => fn(state));
}

/**
 * Wraps a Firestore write so the header's sync badge reflects it. Every
 * write in db.js goes through this - see docs/System-Architecture.md
 * "Offline behavior in detail" for why the write's own promise can't be
 * awaited by callers (it only resolves once the server acknowledges it,
 * which never happens until reconnection).
 */
export function trackWrite(promise, label) {
  pendingCount++;
  notify();
  promise
    .then(() => {
      pendingCount = Math.max(0, pendingCount - 1);
      notify();
    })
    .catch((err) => {
      pendingCount = Math.max(0, pendingCount - 1);
      notify();
      console.error('[Malaika Honey] Background sync failed for ' + label + ':', err);
    });
  return promise;
}

/** Subscribe to 'offline' | 'not-synced' | 'synced'. Fires once immediately. */
export function onSyncStateChange(callback) {
  listeners.add(callback);
  callback(currentState());
  return () => listeners.delete(callback);
}

window.addEventListener('online', notify);
window.addEventListener('offline', notify);

// Catches anything left queued from a previous session (e.g. the app was
// closed before a write synced) so the badge doesn't just say "Synced"
// by default while something is still actually pending underneath.
pendingCount++;
notify();
waitForPendingWrites(db)
  .catch(() => {})
  .finally(() => {
    pendingCount = Math.max(0, pendingCount - 1);
    notify();
  });
