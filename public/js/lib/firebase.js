import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from '../config/firebase.config.js';

const app = initializeApp(firebaseConfig);

// Offline-first: cache reads/writes locally and sync automatically when a
// connection is available (see docs/System-Architecture.md "Offline
// behavior in detail"). Multi-tab manager lets the app also work if a
// staff member has it open in more than one browser tab.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const isLocalhost =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '';

if (isLocalhost) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  console.info('[Malaika Honey] Connected to local Firestore emulator.');
}
