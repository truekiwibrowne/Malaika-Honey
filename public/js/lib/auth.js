import {
  GoogleAuthProvider,
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
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to a different sign-in method.';
    default:
      return 'Could not sign in. ' + (err.message || 'Please try again.');
  }
}

/**
 * Uses a redirect, not a popup - popups are unreliable (often silently
 * blocked) once the app is installed to the home screen as a standalone
 * PWA (see manifest.webmanifest "display": "standalone"), since there's
 * no proper separate window context for a popup in that mode.
 */
export function signInWithGoogle() {
  return signInWithRedirect(auth, googleProvider);
}

/**
 * Call once at app boot to surface any error from a just-completed
 * redirect sign-in (e.g. cancelled, network failure). The resulting user
 * (if any) also arrives via the normal onAuthStateChanged/waitForAuthReady
 * flow - this is only needed for error surfacing, not for the happy path.
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
