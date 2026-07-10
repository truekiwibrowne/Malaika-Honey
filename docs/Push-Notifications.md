# Push Notifications — Malaika Honey FRM

**Status: built, not yet active.** Every piece described here is in the repo and functionally complete, but it stays completely inert in production until the one-time setup below is done — see "Why it's safe to merge before that" at the end.

## What it does

Admin staff (`allowedStaff` docs with `role: 'admin'`, see [[Database-Schema]]) can opt a device in to push notifications from Home, and from then on that device gets a native push notification — even if the app isn't open — whenever:

- a new sign-in request needs approval (`signupRequests` created),
- a purchase is recorded (`purchases` created),
- a new farmer is registered (`farmers` created).

Tapping a notification opens the app to the relevant screen (Approve Requests, or the farmer's profile).

## How it works

- **Client** (`public/js/lib/push.js`): registers this device with Firebase Cloud Messaging (FCM) and saves the resulting token onto the admin's own `allowedStaff/{email}.fcmTokens` array. Reuses the existing `public/sw.js` service worker registration (no second service worker) — `public/sw.js` has a `push` event handler that shows the notification, and a `notificationclick` handler that focuses/opens the app to the right screen.
- **UI**: an "Enable Notifications" button on Home, visible only to admins, and only once the setup below is complete (see `isPushConfigured()`/`isPushSupported()` in `push.js`) — no broken button shown to anyone in the meantime.
- **Server** (`functions/index.js`, new Cloud Functions): three Firestore `onDocumentCreated` triggers (`signupRequests`, `purchases`, `farmers`) that look up every admin's registered tokens and send a push via `firebase-admin`'s Messaging API, pruning any token FCM reports as dead (app uninstalled, notifications revoked, etc.).

## One-time setup (do this when ready to go live)

1. **Upgrade the Firebase project to the Blaze (pay-as-you-go) plan.** Cloud Functions aren't available on the free Spark plan — Firebase Console → your project → bottom-left "Upgrade". Blaze still has a generous free allotment before any charges apply; see [[Risk-Register]] R8, which already anticipated this upgrade for other reasons (quota growth).
2. **Generate a Web Push certificate (VAPID key):** Firebase Console → Project settings → **Cloud Messaging** tab → **Web Push certificates** → "Generate key pair". Copy the resulting key.
3. **Paste it into `public/js/config/firebase.config.js`** as `vapidKey` (currently `''`). This single change is what flips the feature from inert to live for staff.
4. **Deploy the functions:**
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
5. **Deploy the updated Firestore rules and hosting** (rules now allow a staff member to update only their own `fcmTokens` field — see `firestore.rules`):
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```
6. **Test it:** sign in as an admin, tap **Enable Notifications** on Home, allow the browser permission prompt, then from a different account trigger one of the three events (e.g. submit a sign-in request) and confirm the notification arrives.

## Platform notes

- **iOS**: Web Push only works for a PWA actually **added to the Home Screen** (see the fullscreen/`apple-mobile-web-app-capable` fix in [[Changelog]] 0.5.3) — it does not work for a regular Safari tab. `isPushSupported()` in `push.js` checks this via Firebase's own `isSupported()` helper and hides the button entirely where it can't work, rather than showing a button that fails.
- **Android/Chrome**: works in a regular browser tab, no install required.
- Notifications only reach a device that (a) has notification permission granted and (b) has tapped **Enable Notifications** at least once — there's no way to push to a device that has never opted in.

## Why it's safe to merge before that

- `vapidKey` defaults to `''`, and `push.js`'s `isPushConfigured()`/`isPushSupported()` gate every bit of UI and every `getToken()` call behind it being non-empty — no permission prompt, no button, no behavior change for any current user.
- `functions/` isn't deployed by any existing release step — `firebase deploy --only hosting` (the current release process, see [[Release-Management]]) never touches it.
- The `firestore.rules` change only adds a narrowly-scoped self-update path (a user's own `fcmTokens` field, nothing else) — it doesn't loosen anything that exists today.
