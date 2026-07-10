// Real Firebase Web App config for malaikahoney-78577. This is safe to
// commit and ship in the client bundle - access is controlled by
// Firestore Security Rules (firestore.rules), not by hiding this object.
// See docs/Config-Management.md.
//
// When running on localhost, public/js/lib/firebase.js automatically
// connects to the local Firestore emulator instead of production, so
// these values are only actually used once deployed.

export const firebaseConfig = {
  apiKey: 'AIzaSyCM4RbcKeHPa3nn7ykmncc3r5BRhKmh6XE',
  authDomain: 'malaikahoney-78577.web.app',
  projectId: 'malaikahoney-78577',
  storageBucket: 'malaikahoney-78577.firebasestorage.app',
  messagingSenderId: '404440263125',
  appId: '1:404440263125:web:e9473bf7e8761a4b77355c',
};

// Web Push certificate key pair ("VAPID key") for push notifications (see
// docs/Push-Notifications.md) - deliberately left blank until that setup is
// done: Firebase Console -> Project settings -> Cloud Messaging -> Web Push
// certificates -> generate a key pair, then paste the "Key pair" value here.
// public/js/lib/push.js checks this is non-empty before showing any
// notification UI, so leaving it blank keeps the feature fully inert (no
// broken button, no permission prompt) rather than half-working.
export const vapidKey = '';
