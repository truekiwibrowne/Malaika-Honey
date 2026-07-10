import { getMessaging, getToken, deleteToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { app, db } from './firebase.js';
import { vapidKey } from '../config/firebase.config.js';
import { getCurrentUser } from './auth.js';

/**
 * Push notifications are inert (no permission prompt, no UI) until a real
 * vapidKey is configured - see docs/Push-Notifications.md for the one-time
 * Firebase Console setup (Blaze plan + Web Push certificate) this depends
 * on. Screens should gate any "Enable notifications" affordance behind
 * this check rather than assuming the feature is live.
 */
export function isPushConfigured() {
  return !!vapidKey;
}

/**
 * Guards against browsers/contexts where Firebase Messaging can't work at
 * all (no Notification API, no service worker, or - notably - iOS Safari
 * outside of an installed home-screen PWA, which doesn't support Web Push
 * for regular browser tabs).
 */
export async function isPushSupported() {
  if (!isPushConfigured()) return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

function tokenKey(email) {
  return 'pushToken:' + email;
}

/**
 * Requests permission (if not already decided) and registers this device
 * for push notifications, saving the resulting FCM token onto the signed-in
 * user's own allowedStaff document (see firestore.rules - a user may only
 * ever update their own fcmTokens array). Reuses the service worker
 * registration already created for offline app-shell caching (see
 * public/sw.js and app.js) rather than registering a second one - the same
 * push subscription mechanism works through any service worker at this
 * origin's scope.
 */
export async function enablePushNotifications() {
  const user = getCurrentUser();
  if (!user || !user.email) throw new Error('Sign in first.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

  await updateDoc(doc(db, 'allowedStaff', user.email), { fcmTokens: arrayUnion(token) });
  localStorage.setItem(tokenKey(user.email), token);
  return token;
}

/** Unregisters this device's current token, both from Firestore and FCM itself. */
export async function disablePushNotifications() {
  const user = getCurrentUser();
  if (!user || !user.email) return;

  const token = localStorage.getItem(tokenKey(user.email));
  if (token) {
    await updateDoc(doc(db, 'allowedStaff', user.email), { fcmTokens: arrayRemove(token) }).catch(() => {});
  }
  localStorage.removeItem(tokenKey(user.email));

  try {
    const messaging = getMessaging(app);
    await deleteToken(messaging);
  } catch {
    // Best-effort - the Firestore-side token removal above is what
    // actually stops future sends from reaching this device.
  }
}

/** True once this exact device has a saved token for the given user. */
export function isPushEnabledLocally(email) {
  return !!localStorage.getItem(tokenKey(email));
}
