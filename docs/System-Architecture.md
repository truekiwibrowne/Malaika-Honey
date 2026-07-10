# System Architecture — Malaika Honey FRM

## Purpose

Malaika Honey needs a Farmer Relationship Manager (FRM): a system that registers farmers once, tracks every honey/product delivery against that farmer over years, and eventually feeds Monitoring & Evaluation (M&E) reporting for NGOs and development partners. This document describes the technical architecture chosen to support that, starting from a single mobile-first field app.

## Guiding constraints (from the field brief)

- Used on inexpensive Android phones, in the field or at buying centres, often with **poor or no internet connectivity**.
- Must work **offline with automatic sync** when a connection returns — including registering a brand-new farmer and recording a purchase against an FRN the device has never seen before.
- Staff record a purchase in **at most 3 taps** after selecting a farmer — the architecture must not add network round-trips that slow that down.
- Every staff member signs in individually, for accountability, but a one-time sign-in while online must be enough to keep working fully offline afterward — the app must never force a re-login just because there's no signal.
- Data must remain queryable for years and exportable for M&E — it is the company's core operating record, not a throwaway app database.

## High-level architecture

```
┌─────────────────────────────┐
│   Field / Buying Centre     │
│                              │
│   Mobile Web App (PWA)      │
│   HTML / CSS / vanilla JS    │
│   - Login / Tutorial / Home /│
│     Existing/New Farmer /    │
│     Buy Produce / History /  │
│     Reconcile                │
│   - Firestore offline cache  │
│     (IndexedDB, built-in)    │
│   - Auth session persisted   │
│     locally (offline sign-in)│
└───────────────┬──────────────┘
                │ HTTPS (Firestore + Auth SDKs)
                │ queues writes while offline,
                │ syncs automatically on reconnect
                ▼
┌─────────────────────────────┐
│        Firebase              │
│                              │
│  Cloud Firestore             │  ← single source of truth
│  (farmers, purchases,        │
│   devices)                   │
│                              │
│  Firebase Authentication      │  ← staff accounts
│  Firebase Hosting             │  ← serves the static app
│  Firestore Security Rules     │  ← require request.auth != null
│  Cloud Functions (not yet     │  ← FCM push to admins, see
│  deployed - see Push-Notif.)  │    [[Push-Notifications]]
└───────────────┬──────────────┘
                │
                ▼
┌─────────────────────────────┐
│  Future: Admin / Desktop app │
│  (reporting, M&E exports,    │
│   farmer data management)    │
└─────────────────────────────┘
```

## Why this stack

- **Static HTML/CSS/JS, no build step, no framework runtime dependency.** The brief calls for "simple." A framework (React/Vue) adds a build pipeline and bundle weight that buys nothing for 3 screens and increases the barrier to a second developer picking this up later. The app is structured as a single-page shell (`index.html`) with plain ES modules per screen, so it stays simple to read but doesn't sprawl into unmaintainable spaghetti — see `public/js/screens/`.
- **Firebase Firestore, not a custom backend.** Firestore's client SDK has **offline persistence built in** (local IndexedDB cache + automatic write queue + sync on reconnect) — this is exactly the offline requirement, for free, without writing a custom sync engine. A custom Node/Express + Postgres backend would require building offline queuing and conflict resolution from scratch, which is a much bigger and riskier undertaking for a small team.
- **No server-side code driving the core field workflows.** FRN generation is entirely client-side (device code + local sequence) and lifetime-stat totals are updated via Firestore `increment()` FieldValues from the client (see [[Database-Schema]]) — deliberately **not** Firestore transactions, since transactions fail immediately when offline instead of queuing, which would break the offline requirement above. This keeps the field app itself free-tier-friendly and independent of any backend being up. The one exception is push notifications (see [[Push-Notifications]]): `functions/` holds Cloud Functions that send FCM pushes to admins on new sign-in requests/purchases/farmers — purely a notify-after-the-fact side effect, not on the critical path of any field-staff action, and not yet deployed (requires the Blaze plan — see [[Push-Notifications]] for the one-time setup).
- **Firebase Authentication (phone + password, primary; Google Sign-In, hidden), not a custom login system.** Phone+password is the primary method since some staff don't have a Google account — it still uses Firebase Auth's built-in email/password provider under the hood (via a synthetic email derived from the phone number), so no session management, password resets, or custom login backend needed to be built from scratch. Google Sign-In remains fully implemented but hidden behind a single flag (`GOOGLE_SIGNIN_ENABLED`), restorable without a rewrite. Either way, individual accounts give per-record accountability (`registeredBy`/`recordedBy`), and since self-service account creation is inherently open (anyone can create a phone account, or has a Google account), real data access is additionally gated by an admin-managed `allowedStaff` allowlist checked server-side in `firestore.rules` — sign-in and authorization are deliberately two separate steps (see [[Database-Schema]] "Staff accounts"). The SDK's local session persistence is what makes "sign in once online, then work offline indefinitely" possible, and the authorization result is cached the same way so a returning approved staff member is never blocked offline.
- **Firebase Hosting or Netlify for the static site.** Both are equivalent for this app (it's just static files); Firebase Hosting is the natural default since the database is already on Firebase, but Netlify remains a valid drop-in alternative (see [[Release-Management]]) since there's no server-side coupling.
- **GitHub for source control**, deploys triggered from the `main` branch (see [[Release-Management]]).

## Two applications, one database

The brief separates concerns into two apps sharing the same Firestore database:

1. **Field app (this build, v1)** — mobile-first (Login, Tutorial, Home, Existing Farmer, New Farmer, Buy Produce, History, Farmer Card, Reconcile), designed for buying-centre staff. Read/write access to `farmers`, `purchases`, and `devices`, gated by Firebase Auth.
2. **Admin/management app (future)** — desktop-focused, for reporting, data correction, M&E exports (Excel), and eventually managing training/incentive/hive-visit data. Reads the same collections; no schema changes needed to start it, since Firestore is schemaless and the admin app can simply add new collections (`trainings`, `hiveVisits`, etc. — see [[Database-Schema]]) without migrating the field app.

Splitting them into two deployable apps (rather than one app with hidden admin routes) keeps the field app's bundle and permissions minimal, which matters for load speed on cheap Android phones and for keeping the attack surface small before Auth is added.

## Offline behavior in detail

**The app shell itself (HTML/CSS/JS) is cached separately from Firestore data, by `public/sw.js`.** Firestore's offline persistence (below) only ever covers *documents* — it does nothing for the page itself, so a fresh navigation with no connectivity (e.g. the app was force-quit, then reopened while offline) previously failed before any app code could even run, showing the browser's own "no internet" error. `sw.js` is a service worker that precaches the shell plus the pinned Firebase SDK CDN files on first successful load, and serves them from cache first (updating in the background when online) — including falling back to the cached `index.html` for any offline navigation, since this is a hash-routed SPA where every route is really the same page. See [[Release-Management]] "Offline app shell caching" for the release-process implication.

Firestore's JS SDK is configured with persistent local cache (`persistentLocalCache`) on app start (`public/js/lib/firebase.js`). This means:

- Reads (e.g. "existing farmer" search) are served from the local cache instantly if the farmer was previously synced; if never seen on this device and offline, the search returns nothing until reconnect — communicated in the UI rather than left ambiguous. Every read in the app that could run while offline is guarded with `navigator.onLine ? getDoc(ref) : getDocFromCache(ref)` (or the `getDocs`/`getDocsFromCache` query equivalents) rather than calling the plain `getDoc`/`getDocs` unconditionally — a plain `getDoc`/`getDocs` always attempts a live server round-trip *first* regardless of actual connectivity, only falling back to cache after a real multi-second connectivity timeout, which made screens feel stuck/broken offline even though the needed data was already cached (especially when several such reads ran sequentially on one page). This pattern is applied consistently across `public/js/lib/db.js` (farmer/purchase lookups), `referenceData.js` (products/grades/etc.), `auth.js` (`refreshAuthorization`), `home.js`, and `adminApprovals.js` — not just the Buy Produce farmer lookup that first established it.
- Writes (new farmer, new purchase) are applied to the local cache immediately (so staff see instant confirmation and get the FRN/receipt right away) and queued for upload via plain `setDoc`/`updateDoc` calls, fired without being awaited — those promises only resolve once the server acknowledges the write, which never happens offline, so awaiting them directly would hang the UI. When the device regains connectivity, Firestore uploads the queue automatically — no custom code required. A shared `trackWrite()` helper (`public/js/lib/sync.js`) tracks how many of these are still in flight, which drives the header's sync badge (Synced / Not Synced / Offline).
- **Firestore transactions (`runTransaction`) are deliberately not used anywhere in this app.** An earlier design used a transaction to mint each FRN from a shared counter and another to update a farmer's lifetime stats atomically alongside each purchase — both were found (via Firebase's own documented behavior, confirmed empirically) to **fail immediately when offline** rather than queuing like ordinary writes, which directly broke the offline requirement. Both were replaced:
  - **FRN minting** is now entirely client-side: a random 3-character device code (generated once, cached in `localStorage`) plus a local sequence number, so two devices can never collide by construction and no server round-trip is ever needed (see [[Database-Schema]] `devices/{deviceCode}`).
  - **Lifetime-stat updates** use Firestore `increment()` FieldValues via a plain `updateDoc` — safe to apply without reading the current value first, so it queues and applies correctly offline, unlike a transactional read-modify-write. If the farmer isn't recognized in the local cache at the time a purchase is saved, the stats update is deferred (not guessed) until the purchase is reconciled to the correct farmer via `/reconcile`.
- **Auth sessions persist locally** (`browserLocalPersistence`), and the app waits for the first `onAuthStateChanged` callback (which fires even fully offline, from the cached session) before deciding whether to show the login screen — so a staff member who has signed in at least once while online is never blocked from using the app offline afterward.

## M&E data flow (future)

The data model is built so that today's operational data (registration + purchase) is already the raw material for tomorrow's M&E reporting:

- Income improvement → sum of `purchases.totalUgx` per `frn` over time.
- Crop yields / honey harvest trends → `purchases.weightKg` per `frn` over time vs. `farmers.avgHarvestKgPerYear` baseline.
- Quality improvement over time → trend of `purchases.grade` per `frn`.
- Location of hives over time → future `hiveVisits` collection (GPS + date), joined by `frn`.
- Training success → future `trainings`/`farmerTrainings` collections, joined by `frn`.

Because every record is keyed by FRN and timestamped, the admin app (or even a scheduled Cloud Function / BigQuery export later) can generate NGO-ready reports without re-architecting the field app.

## Non-goals for v1

- Role-based permissions — every signed-in staff account currently has identical Firestore access (tracked in [[Backlog]] 2.12).
- No SMS or payments integration. (Push notifications exist but aren't yet active — see [[Push-Notifications]].)
- No native mobile app — the PWA approach is intentional to avoid app-store distribution friction in rural Uganda.
