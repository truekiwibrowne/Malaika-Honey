/**
 * Cloud Functions - admin push notifications. See docs/Push-Notifications.md
 * for the full setup checklist (Blaze plan, VAPID key, deploy command);
 * these triggers do nothing until deployed and no client currently has a
 * token to receive them until public/js/config/firebase.config.js's
 * vapidKey is filled in (see public/js/lib/push.js).
 *
 * Not part of the field app's offline-first client architecture (see
 * docs/System-Architecture.md) - this runs server-side, triggered by
 * Firestore writes the client makes regardless of connectivity, so it
 * fires once a write actually reaches the server (immediately if the
 * device was online, or on sync if it was queued offline).
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// FCM error codes that mean a token is permanently dead (app
// uninstalled/notifications revoked) rather than a transient send failure -
// safe to prune from the owning allowedStaff doc so it doesn't keep being
// retried forever.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Sends one push notification to every device an admin (allowedStaff doc
 * with role == 'admin') has registered (see public/js/lib/push.js), then
 * prunes any token FCM reports as dead. `path` is a hash-route (e.g.
 * '/admin/approvals') the app opens to on notification tap - see the
 * 'notificationclick' handler in public/sw.js.
 */
async function sendToAdmins(title, body, path) {
  const adminsSnap = await db.collection('allowedStaff').where('role', '==', 'admin').get();

  const tokens = [];
  const ownerByToken = new Map();
  adminsSnap.forEach((doc) => {
    (doc.data().fcmTokens || []).forEach((token) => {
      tokens.push(token);
      ownerByToken.set(token, doc.ref);
    });
  });
  if (!tokens.length) return;

  const response = await messaging.sendEachForMulticast({
    tokens,
    webpush: {
      notification: { title, body, icon: '/assets/icons/icon-192.png' },
      data: { path },
    },
  });

  const deadTokenUpdates = new Map(); // doc ref -> tokens to remove
  response.responses.forEach((res, i) => {
    if (res.success || !DEAD_TOKEN_CODES.has(res.error?.code)) return;
    const ref = ownerByToken.get(tokens[i]);
    if (!deadTokenUpdates.has(ref)) deadTokenUpdates.set(ref, []);
    deadTokenUpdates.get(ref).push(tokens[i]);
  });

  await Promise.all(
    Array.from(deadTokenUpdates.entries()).map(([ref, deadTokens]) =>
      ref.update({ fcmTokens: FieldValue.arrayRemove(...deadTokens) })
    )
  );
}

exports.notifyAdminsOnSignupRequest = onDocumentCreated('signupRequests/{email}', async (event) => {
  const request = event.data.data();
  await sendToAdmins(
    'New sign-in request',
    (request.displayName || 'A staff member') + ' is waiting for approval.',
    '/admin/approvals'
  );
});

exports.notifyAdminsOnPurchase = onDocumentCreated('purchases/{purchaseId}', async (event) => {
  const purchase = event.data.data();
  const who = purchase.farmerNameSnapshot || purchase.frn;
  await sendToAdmins(
    'New purchase recorded',
    who + ': ' + purchase.weightKg + 'kg ' + purchase.product + ' — UGX ' + Number(purchase.totalUgx).toLocaleString(),
    '/farmer/' + purchase.frn
  );
});

exports.notifyAdminsOnFarmerRegistered = onDocumentCreated('farmers/{frn}', async (event) => {
  const farmer = event.data.data();
  await sendToAdmins('New farmer registered', farmer.fullName + ' (' + farmer.frn + ')', '/farmer/' + farmer.frn);
});
