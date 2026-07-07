import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase.js';

const googleProvider = new GoogleAuthProvider();

function friendlyAuthError(err) {
  switch (err.code) {
    case 'auth/network-request-failed':
      return 'No connection. Connect to the internet to sign in for the first time on this phone.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to a different sign-in method.';
    default:
      return 'Could not sign in. ' + (err.message || 'Please try again.');
  }
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Uses a popup for a normal browser tab - this is the reliable path.
 * signInWithRedirect's round trip through Firebase's separate authDomain
 * (typically <project>.firebaseapp.com, a different origin than the app
 * itself) can silently fail to persist the session on return, particularly
 * on iOS Safari's cross-site tracking prevention - the user ends up back
 * on the login screen with no visible error. A popup avoids that hop
 * entirely. Falls back to a redirect only once the app is installed to
 * the home screen as a standalone PWA (manifest.webmanifest "display":
 * "standalone"), where a popup has no separate window context to open
 * into.
 */
export async function signInWithGoogle() {
  if (isStandalonePwa()) {
    return signInWithRedirect(auth, googleProvider);
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

/**
 * Call once at app boot to surface any error from a just-completed
 * redirect sign-in (e.g. cancelled, network failure) - only relevant on
 * the standalone-PWA redirect path above; a no-op (resolves to null) for
 * popup-based sign-ins, since there's no pending redirect to consume. The
 * resulting user (if any) also arrives via the normal
 * onAuthStateChanged/waitForAuthReady flow - this is only needed for
 * error surfacing, not for the happy path.
 */
export async function consumeRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

export function signOutStaff() {
  return signOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

let authReadyPromise = null;

/**
 * Resolves once on the first auth state callback - fires even fully
 * offline, from the session persisted in IndexedDB, so the app can wait
 * for this before deciding whether to show the login screen (avoids a
 * flash of the login screen on a slow or offline start).
 */
export function waitForAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authReadyPromise;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentDisplayName() {
  const user = auth.currentUser;
  if (!user) return 'Unknown staff';
  if (user.displayName) return user.displayName;
  return user.email ? user.email.split('@')[0] : user.uid;
}

function tutorialSeenKey(uid) {
  return 'tutorialSeen:' + uid;
}

export function hasSeenTutorial(uid) {
  return localStorage.getItem(tutorialSeenKey(uid)) === '1';
}

export function markTutorialSeen(uid) {
  localStorage.setItem(tutorialSeenKey(uid), '1');
}

function authorizedKey(uid) {
  return 'authorized:' + uid;
}

/**
 * Fast, synchronous, offline-safe check - once a staff member has been
 * confirmed against the allowedStaff allowlist at least once (see
 * refreshAuthorization), this stays true on this device without needing
 * another server round-trip, so a returning staff member is never
 * blocked just because they're offline (the real access control is
 * still enforced server-side by firestore.rules regardless of this
 * local flag - see docs/Database-Schema.md "Staff accounts").
 */
export function isAuthorizedLocally(uid) {
  return localStorage.getItem(authorizedKey(uid)) === '1';
}

/**
 * Confirms whether the signed-in user's email is on the allowedStaff
 * allowlist (see firestore.rules and docs/Config-Management.md "Staff
 * account provisioning"). Must be awaited before routing a freshly
 * signed-in user anywhere, since access is gated on the result. If the
 * check can't reach the server (offline), falls back to whatever was
 * already established locally rather than demoting a previously-approved
 * staff member just because they're offline.
 */
export async function refreshAuthorization(user) {
  if (!user || !user.email) return false;
  try {
    const snap = await getDoc(doc(db, 'allowedStaff', user.email));
    if (snap.exists()) {
      localStorage.setItem(authorizedKey(user.uid), '1');
      return true;
    }
    return false;
  } catch {
    return isAuthorizedLocally(user.uid);
  }
}
