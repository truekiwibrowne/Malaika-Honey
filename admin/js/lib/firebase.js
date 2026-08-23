import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from '../shared/firebase.config.js';

/**
 * Same Firebase project as the field app, different host (Netlify). That
 * works because Firestore and email/password Auth are plain API calls with
 * no origin coupling - unlike Google Sign-In, whose redirect depends on
 * `authDomain` matching the serving domain (see docs/Risk-Register.md R18).
 * That is exactly why this app must stay on email+password.
 *
 * NOTE: no persistentLocalCache here, deliberately. The field app is
 * offline-first because it has to be; this is a desk tool on a real
 * connection, and management must never be shown stale figures from a
 * cache without realising it.
 */
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

const isLocalhost =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '';

if (isLocalhost) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.info('[Malaika Admin] Connected to local Firestore + Auth emulators.');
}
