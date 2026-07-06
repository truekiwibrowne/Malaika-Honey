# Database Schema — Malaika Honey FRM

Database: **Cloud Firestore** (project `malaikahoney-78577`), Native mode.

Firestore is a document store, not relational — this schema describes collections, document shapes, and the indexes/queries they must support. Field names are `camelCase`. All monetary values are stored as integers in UGX (no decimals — UGX has no practical sub-unit in this trade).

## Design principles

- **FRN is the human-facing key**, but the Firestore document ID for a farmer is the FRN itself (e.g. `MH004826`, or the newer device-coded `MHA1000042` — see `devices/{deviceCode}` below). This makes farmer lookups by FRN a direct document read (no query needed) — fast and works offline from cache.
- Every write includes `createdAt` / `updatedAt` server timestamps for audit and future M&E time-series analysis.
- No field is deleted when requirements change — deprecate and add new fields instead, so historic records stay valid (see [[Config-Management]] for schema versioning).
- Collections are named as plural nouns; every document has a `schemaVersion` number so the app can migrate old records safely as the form grows.

## Collections

### `farmers/{frn}`

One document per registered farmer. Document ID = FRN.

| Field | Type | Notes |
|---|---|---|
| `frn` | string | Redundant copy of the doc ID, so query results carry it without needing the ID separately |
| `schemaVersion` | number | Currently `1` |
| `fullName` | string | Required |
| `fullNameLower` | string | Lowercased copy of `fullName`, kept in sync at write time — powers case-insensitive name search and the duplicate-name check on registration (see below) |
| `dateOfBirth` | string (`YYYY-MM-DD`) or null | Optional in the field; encouraged |
| `gender` | string enum: `male`, `female` | |
| `phone` | string | Primary contact, used for search and must be unique (see below) |
| `email` | string or null | Optional |
| `village` | string | Required |
| `district` | string | Required, dropdown-driven (Uganda district list) |
| `farmSize` | string enum: `small` (1–5 acres), `medium` (6–15), `large` (16+) | |
| `hives.traditional` | number | Count |
| `hives.ktb` | number | Kenya Top Bar hives count |
| `hives.modern` | number | Langstroth/modern hives count |
| `otherCropsOrLivestock` | string | Free text |
| `avgHarvestKgPerYear` | number | Self-reported at registration, baseline for M&E |
| `usesChemicals` | boolean | Pesticide/chemical use flag — quality & organic-certification signal |
| `wantsTraining` | boolean | Interest in Malaika training programs |
| `signatureDate` | string (`YYYY-MM-DD`) | Date the paper/digital agreement was signed |
| `photoUrl` | string or null | Reserved for future farmer photo on ID card (Firebase Storage URL) |
| `status` | string enum: `active`, `inactive` | Defaults to `active`; lets office deactivate a farmer without deleting history |
| `registeredBy` | string | Signed-in staff member's identifier (from Firebase Auth, see "Staff accounts" below) |
| `registeredAt` | timestamp | Server timestamp, set once |
| `updatedAt` | timestamp | Server timestamp, set on every edit |
| `lifetimeStats.totalKg` | number | Denormalized running total per product-agnostic weight, updated via a Firestore `increment()` FieldValue whenever a purchase is saved against a known farmer — avoids summing the whole `purchases` collection on every profile view |
| `lifetimeStats.totalPaidUgx` | number | Denormalized running total paid |
| `lifetimeStats.lastPurchaseAt` | timestamp or null | Denormalized, drives "Last Delivery" on the profile screen |

**Why denormalize `lifetimeStats`:** the Farmer Profile screen must render instantly and offline. Recomputing totals from the `purchases` collection on every screen load doesn't scale and doesn't work well offline.

**Why `increment()` instead of a transaction:** `runTransaction` fails immediately when the device is offline instead of queuing like an ordinary write — this was discovered after the original design (a single transaction writing both the purchase and the farmer's stats together) turned out to make purchase-recording impossible offline, which contradicted a hard requirement. `increment(n)` is safe to apply without first reading the current value, so a plain `updateDoc` carrying an `increment()` FieldValue queues correctly offline and applies once synced — at the cost of the purchase write and the stats update now being two independent writes instead of one atomic one (accepted; see [[Risk-Register]] R3's history and [[System-Architecture]] "Offline behavior in detail"). If the farmer isn't recognized on the device at write time (see `purchases.frnUnverified` below), the stats update is deferred entirely rather than guessed, and applied later once the FRN is confirmed via `/reconcile`.

**Phone uniqueness is enforced at the application layer, not by Firestore.** Firestore has no native "unique field" constraint, so `public/js/lib/db.js`'s `findFarmerByPhone` runs an exact-match query before every registration and blocks the save if a match exists. This is a check-then-act pattern, not a transaction — two staff registering the same phone number at the *exact* same instant on two different offline devices could theoretically both pass the check before either syncs. This is an accepted, low-probability edge case for now (see [[Risk-Register]]); if it ever matters at scale, real uniqueness would require either a document ID keyed by phone or a Cloud Function trigger that reconciles duplicates after sync. Full names are deliberately **not** unique — `findFarmerByName` only warns (via a confirm dialog) since two different farmers can share a name.

### `purchases/{purchaseId}`

One document per honey/product intake. Document ID = Firestore auto-ID.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | Currently `1` |
| `frn` | string | Reference to `farmers/{frn}` — stored as plain string, not a DocumentReference, so the field is queryable/exportable without SDK-specific handling |
| `farmerNameSnapshot` | string | Farmer's name at time of purchase, so receipts/reports don't break if the name is later edited |
| `product` | string enum: `honey`, `beeWax`, `pollen`, `propolis`, `beeVenom` | |
| `weightKg` | number | Decimal allowed (e.g. `24.5`) |
| `grade` | string enum: `A`, `B`, `C` | Quality grade from field QC check |
| `pricePerKgUgx` | number | Integer, set by staff at time of purchase (rate can vary by grade/season) |
| `totalUgx` | number | `weightKg * pricePerKgUgx`, computed client-side and stored (not recomputed later) so historic receipts remain accurate even if pricing logic changes |
| `paymentMethod` | string enum: `cash`, `mobileMoney`, `bank` | |
| `receiptNo` | string | Staff-entered physical receipt book number, used to reconcile paper and digital records |
| `purchaseDate` | string (`YYYY-MM-DD`) | Defaults to today, editable for back-dated entries |
| `centre` | string or null | Reserved: which buying centre/location recorded this purchase (see [[Backlog]] multi-centre support) |
| `recordedBy` | string | Signed-in staff member's identifier (from Firebase Auth) |
| `createdAt` | timestamp | Server timestamp |
| `syncedFromOffline` | boolean | `true` if the write was queued while offline and synced later — useful for QA and dispute resolution |
| `frnUnverified` | boolean | `true` if, at the moment this purchase was saved, the typed FRN wasn't found in this device's local cache (commonly because the device was offline and had never seen that farmer before, or because of a typo). The purchase is still saved either way — see [[System-Architecture]] "Offline behavior in detail" |
| `originalTypedFrn` | string or null | Set only when `frnUnverified` is `true` — preserves exactly what staff typed, for the `/reconcile` screen and for audit if the eventual match turns out wrong |

**Required composite indexes** (`firestore.indexes.json`):
- `frn ASC, purchaseDate DESC` — powers the farmer History screen (all purchases for one FRN, newest first).
- `frnUnverified ASC, createdAt DESC` — powers the `/reconcile` screen (all purchases still awaiting a confirmed farmer match, newest first).

**Reconciling an unverified purchase:** `resolveUnverifiedPurchase(purchaseId, confirmedFrn)` (in `public/js/lib/db.js`) sets `frn`/`farmerNameSnapshot` to the confirmed farmer, flips `frnUnverified` to `false`, and applies the `lifetimeStats` `increment()` that was deferred at save time. Used by the `/reconcile` screen, reachable from a banner on Home whenever unresolved purchases exist.

### `devices/{deviceCode}`

Registry of device codes used to mint collision-free FRNs without any server coordination at write time.

| Field | Type | Notes |
|---|---|---|
| `deviceCode` | string | 3 characters from `[A-Z0-9]` (46,656 combinations), generated once per device and cached in `localStorage` |
| `registeredAt` | timestamp | Server timestamp, set the first time this device is online after generating its code |

**FRN format:** `MH` + `deviceCode` + a locally-incremented sequence number zero-padded to 6 digits, e.g. `MHA1000042`. The sequence number lives in `localStorage` on the device and increments synchronously with no network dependency, so `createFarmer` never needs a server round-trip — unlike the original shared-counter-plus-transaction design (`counters/frnCounter`, now retired), which failed outright offline instead of queuing (see [[Risk-Register]] R3). Two devices can never mint the same FRN, by construction, without needing to coordinate: the `deviceCode` half guarantees no cross-device collision, and the local sequence guarantees no same-device collision.

The `devices` collection itself is a best-effort, self-check side record, not load-bearing for uniqueness: the first time a device is online after generating its code, it opportunistically writes a `create`-only document (Firestore rules reject the write if the code already exists — see below). On the near-impossible event of a collision, the device would regenerate and retry. The app works correctly even if this write never reaches the server (e.g. a device that's always offline) — FRN uniqueness never depends on it.

**Old-format FRNs are untouched:** farmers already registered under the original shared-counter format (`MH000001`, `MH000002`, ...) keep that FRN forever — there is no migration. Both formats are permanent, opaque, unique strings and every lookup (`getFarmerByFrn`, `searchFarmers`, etc.) treats them identically.

### `products`, `grades`, `paymentMethods` (reference collections, optional/future)

The product list (Honey, Bee Wax, Pollen, Propolis, Bee Venom), grade list (A/B/C), and payment method list (Cash, Mobile Money, Bank) are all hardcoded in `public/js/lib/constants.js` for the MVP, because these lists rarely change and hardcoding keeps the app usable fully offline on first install with zero reads.

This is deliberately not a schema limitation: `purchases.product`, `purchases.grade`, and `purchases.paymentMethod` are stored as **plain strings**, not restricted enums, so admin-added values (e.g. a new product, a 4th grade, a new mobile-money provider) can be written and read without any migration the moment the admin app exists. The only piece that needs to change when the list changes is the field app's UI options — today that means a code change to `constants.js`; if the admin app needs to add these without waiting for a field-app redeploy, promote each list to its own small Firestore collection (e.g. `products/{productId}`, `grades/{gradeId}`, `paymentMethods/{methodId}`) and have the field app read from there (falling back to the hardcoded list if offline on first run). The app already reads all three lists from one JS module, so that swap is localized and doesn't touch `purchases`/`farmers` documents at all.

## Future M&E-driven additions (not built yet — see [[Backlog]])

These are anticipated, not implemented, so they're named here to keep future schema changes consistent:

- `hiveVisits/{visitId}` — apiary inspection records (hive health, colony strength, GPS location) linked by `frn`, enabling "location of hives over time" and "success of hives" reporting.
- `trainings/{trainingId}` and `farmerTrainings/{id}` (join collection) — which farmers attended which training, for training-impact M&E.
- `incentives/{incentiveId}` — bonus/incentive payments linked by `frn`, separate from `purchases` since they aren't tied to a single delivery.
- `staff/{staffId}` — a richer staff-profile collection (role, assigned centre, etc.), if Firebase Auth's built-in user record ever stops being enough on its own.

### `allowedStaff/{email}`

The admin-managed allowlist that gates real access. Document ID is the staff member's Google account email address (exactly as Google/Firebase Auth returns it, e.g. `jokello@gmail.com`).

| Field | Type | Notes |
|---|---|---|
| `addedAt` | string or timestamp | Informational only — when the admin approved this email. Not read by the app; the document's mere existence is what grants access |

The document can otherwise be empty — the rules only check `exists()`, not any field value. See "Staff accounts" below and [[Config-Management]] "Staff account provisioning" for how entries are added.

## Staff accounts (Google Sign-In + admin allowlist)

Each staff member signs in with their own Google account (Firebase Auth's Google provider) — no passwords to create or manage, no admin step required just to let someone *try* signing in. Signing in with Google only creates a Firebase Auth session, though — it does **not** by itself grant access to farmer/purchase data. A signed-in account only gets real access once an admin adds that exact email address as a document in the `allowedStaff` collection (see above). Until then, the app shows an "Approval Needed" screen with the signed-in email displayed, so the person can tell their admin what to approve.

This two-step design (self-service sign-in + admin-gated data access) replaces an earlier username/password design that turned out to be fragile in practice — accounts created directly in Firebase Console with real email addresses didn't match the app's synthetic-email convention, so nobody could actually sign in. Google Sign-In removes that whole class of mismatch, and the `allowedStaff` allowlist keeps access restricted to approved people despite sign-in itself being self-service (Google accounts aren't scoped to Malaika Honey, so without this gate literally anyone with a Google account could otherwise reach farmer/purchase data).

`registeredBy` / `recordedBy` on farmer/purchase documents come from the signed-in user (`currentDisplayName()`, which prefers the Google account's display name), giving real accountability per record.

Sessions persist locally (`browserLocalPersistence`) so a staff member who has signed in at least once while online can keep using the app fully offline afterward — `waitForAuthReady()` resolves from the cached session before the app decides whether to show the login screen. The *authorization* result (whether they're on the allowlist) is similarly cached locally (`localStorage`, keyed by uid) the first time it's confirmed online, so a returning approved staff member is never blocked from an authenticated screen just because they're offline — see `public/js/lib/auth.js` `refreshAuthorization`/`isAuthorizedLocally`. If an admin later removes someone from the allowlist, that only takes effect for a given device the next time it manages to reach the server (an inherent, accepted lag for an offline-first app — see [[Risk-Register]]).

## Firestore Security Rules (summary)

See `firestore.rules` in the repo root. Every `farmers`, `purchases`, and `devices` operation requires **both** `request.auth != null` **and** the signed-in user's email existing in `allowedStaff` (an `isApprovedStaff()` helper function in the rules file encapsulates this check). `allowedStaff` itself only allows a signed-in user to `get` their own document (to check their own status) — nobody can list the roster or write to it from the client; entries are added only via Firebase Console's Firestore Data tab (or the Admin SDK, which bypasses rules). `devices/{deviceCode}` additionally allows `create` only if the document doesn't already exist yet, and disallows `update`/`delete` entirely, so a device code can never be silently overwritten. The retired `counters/{counterId}` collection still allows `read` for approved staff (harmless, unused) but no longer allows `write`.
