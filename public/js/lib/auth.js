import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase.js';

const STAFF_EMAIL_DOMAIN = 'staff.malaikahoney.local';

export function usernameToEmail(username) {
  const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return sanitized + '@' + STAFF_EMAIL_DOMAIN;
}

function friendlyAuthError(err) {
  switch (err.code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect username or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'No connection, and this account has never signed in on this phone before. Connect to the internet once to sign in for the first time.';
    default:
      return 'Could not sign in. ' + (err.message || 'Please try again.');
  }
}

export async function signIn(username, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    return credential.user;
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
