import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc, getDocFromCache, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase.js';

const googleProvider = new GoogleAuthProvider();
// Always show the account chooser, even if the browser only knows one
// Google account - without this, Google silently re-signs-in the last
// account with no picker, making it look impossible to switch users on
// a shared device. Currently moot while Google Sign-In is hidden (see
// constants.js GOOGLE_SIGNIN_ENABLED), but keeps the path correct for
// whenever it's turned back on.
googleProvider.setCustomParameters({ prompt: 'select_account' });

const PHONE_EMAIL_DOMAIN = 'staff.malaikahoney.local';

/**
 * Turns a staff-entered phone number into the synthetic email Firebase
 * Auth's email/password provider actually stores the account under -
 * strips everything but digits so small formatting differences ("077...",
 * "+256 77...") don't accidentally create two different accounts for the
 * same person, as long as staff are consistent about how they type it.
 */
export function phoneToEmail(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits + '@' + PHONE_EMAIL_DOMAIN;
}

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
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect phone number or password.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this phone number. Use Sign In instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid phone number.';
    default:
      return 'Could not sign in. ' + (err.message || 'Please try again.');
  }
}

/**
 * Returning staff member: phone + their existing password. See
 * createAccountWithPhone for first-time sign-up.
 */
export async function signInWithPhone(phone, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, phoneToEmail(phone), password);
    return credential.user;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

/**
 * First-time sign-up: staff choose their own password against their phone
 * number. Deliberately a separate action from signInWithPhone rather than
 * one "auto-detect" flow - modern Firebase Auth returns the same generic
 * error for "wrong password" and "no such account" (to prevent account
 * enumeration), so there's no reliable way to tell them apart and decide
 * sign-in-vs-create automatically. Access still isn't granted just by
 * creating the account - it feeds into the exact same allowedStaff /
 * signupRequests / admin-approval flow as Google Sign-In (see
 * refreshAuthorization below and docs/Database-Schema.md "Staff accounts").
 */
export async function createAccountWithPhone(phone, password, displayName) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    return credential.user;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
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

/**
 * Human-facing identity string for a signed-in user - a phone-based
 * account's real email is a synthetic address (see phoneToEmail) that
 * would only confuse staff if shown as-is, so this strips it back down
 * to the phone number they actually typed. Google accounts just show
 * their real email.
 */
export function identityLabel(user) {
  if (!user) return 'your account';
  if (user.email && user.email.endsWith('@' + PHONE_EMAIL_DOMAIN)) {
    return user.email.split('@')[0];
  }
  return user.email || user.uid;
}

/**
 * Same idea as identityLabel, but for the raw email string stored on a
 * signupRequests/allowedStaff document (used by adminApprovals.js) rather
 * than a live Firebase user object - returns the phone number for a
 * synthetic phone-account email, or null if `email` is a real address.
 */
export function phoneFromSyntheticEmail(email) {
  if (email && email.endsWith('@' + PHONE_EMAIL_DOMAIN)) {
    return email.split('@')[0];
  }
  return null;
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

function adminKey(uid) {
  return 'admin:' + uid;
}

/**
 * Fast, synchronous, offline-safe check mirroring isAuthorizedLocally -
 * true only for the staff account(s) whose allowedStaff document has
 * `role: 'admin'` (see docs/Database-Schema.md "Staff accounts"). Gates
 * the "Approve Requests" button on Home (see home.js) and the
 * /admin/approvals screen.
 */
export function isAdminLocally(uid) {
  return localStorage.getItem(adminKey(uid)) === '1';
}

/**
 * Records (or refreshes) a pending signup request so an admin can see it
 * on /admin/approvals - called only for a signed-in-but-not-yet-approved
 * user (see refreshAuthorization below). Best-effort and not awaited by
 * the caller: this must never block or fail the "Approval Needed" screen
 * from showing, since recording the request is a nice-to-have, not a
 * requirement for the user to see their own status.
 */
function recordSignupRequest(user) {
  const ref = doc(db, 'signupRequests', user.email);
  getDoc(ref)
    .then((snap) => {
      const isNew = !snap.exists();
      return setDoc(
        ref,
        {
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          uid: user.uid,
          status: 'pending',
          lastAttemptAt: serverTimestamp(),
          ...(isNew ? { requestedAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );
    })
    .catch((err) => {
      console.warn('[Malaika Honey] Could not record signup request:', err.message);
    });
}

/**
 * Confirms whether the signed-in user's email is on the allowedStaff
 * allowlist (see firestore.rules and docs/Config-Management.md "Staff
 * account provisioning"). Must be awaited before routing a freshly
 * signed-in user anywhere, since access is gated on the result.
 *
 * When offline, this deliberately reads from cache only
 * (getDocFromCache) instead of attempting a live getDoc - a plain getDoc
 * still tries the server first and only falls back to cache after
 * detecting it can't connect, which can take several seconds on a cold
 * app start with no signal, making the app feel like it's hanging/not
 * working even though the answer was sitting in cache the whole time.
 * If nothing is cached yet (never confirmed online before), falls back to
 * whatever was already established locally rather than demoting a
 * previously-approved staff member just because they're offline.
 */
export async function refreshAuthorization(user) {
  if (!user || !user.email) return false;
  const ref = doc(db, 'allowedStaff', user.email);
  try {
    const snap = navigator.onLine ? await getDoc(ref) : await getDocFromCache(ref);
    if (snap.exists()) {
      localStorage.setItem(authorizedKey(user.uid), '1');
      if (snap.data().role === 'admin') {
        localStorage.setItem(adminKey(user.uid), '1');
      }
      return true;
    }
    if (navigator.onLine) recordSignupRequest(user);
    return false;
  } catch {
    return isAuthorizedLocally(user.uid);
  }
}
