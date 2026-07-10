import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from '../config/firebase.config.js';

export const app = initializeApp(firebaseConfig);

// Offline-first: cache reads/writes locally and sync automatically when a
// connection is available (see docs/System-Architecture.md "Offline
// behavior in detail"). Multi-tab manager lets the app also work if a
// staff member has it open in more than one browser tab.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Auth session persists in IndexedDB across app restarts, including fully
// offline ones - this is what lets a staff member sign in once (while
// online) and keep using the app with no connection afterwards.
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

const isLocalhost =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '';

if (isLocalhost) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.info('[Malaika Honey] Connected to local Firestore + Auth emulators.');
}
