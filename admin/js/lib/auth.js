import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase.js';

/**
 * Management sign-in: individual accounts with a real email address, NOT
 * the field app's shared office codes. Two reasons that matters:
 *
 *  - Admin actions (record corrections) become attributable to a person
 *    rather than an office - the gap noted in docs/Risk-Register.md R24.
 *  - Access to this tool can be granted and revoked per person.
 *
 * Accounts are provisioned in the Firebase Console only (Authentication ->
 * Add user, plus an allowedStaff/{email} document with role: 'admin'),
 * matching the existing deliberate rule that the admin role is never
 * self-service. See docs/Config-Management.md.
 */

let currentProfile = null;

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

/** The signed-in admin's display identity for audit records. */
export function currentAdminName() {
  const user = auth.currentUser;
  if (!user) return 'Unknown admin';
  return user.displayName || user.email || user.uid;
}

export function currentAdminEmail() {
  return auth.currentUser ? auth.currentUser.email || null : null;
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return credential.user;
}

export function signOut() {
  currentProfile = null;
  return fbSignOut(auth);
}

/**
 * True only if this account is on the allowedStaff allowlist AND carries
 * role: 'admin'.
 *
 * Worth being precise about what this is: it gates the management UI, not
 * the data. Firestore rules let any approved staff account read farmers and
 * purchases, because the field app's search depends on that. So this is a
 * product boundary, not a security boundary - see docs/Risk-Register.md R35.
 */
export async function loadAdminProfile(user) {
  if (!user || !user.email) return null;
  const snap = await getDoc(doc(db, 'allowedStaff', user.email));
  if (!snap.exists()) return null;
  const data = snap.data();
  currentProfile = { email: user.email, role: data.role || null, isAdmin: data.role === 'admin' };
  return currentProfile;
}

export function cachedProfile() {
  return currentProfile;
}

/** Short, non-technical message for each Firebase auth error code. */
export function friendlyAuthError(err) {
  const code = err && err.code ? err.code : '';
  if (code === 'auth/invalid-email') return 'That email address doesn’t look right.';
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Wrong email or password.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'auth/network-request-failed') return 'Could not reach the server. Check your internet connection.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  return 'Could not sign in. Please try again.';
}
