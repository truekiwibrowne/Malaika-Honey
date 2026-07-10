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
| `district` | string | Required, dropdown-driven from the `districts` collection (see "Admin-editable reference data" below) |
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
| `customFields` | map | Values for any New Farmer form field an admin has added that isn't one of the known top-level fields above (see "New Farmer form schema" below). `{}` for every farmer registered before a given custom field existed |

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

### Admin-editable reference data

`products/{id}`, `grades/{id}`, `paymentMethods/{id}`, `farmSizes/{id}`, `districts/{id}`, and `newFarmerFields/{id}` are all real Firestore collections the field app reads from (via `public/js/lib/referenceData.js`), rather than hardcoded lists — an admin can add, edit, or deactivate entries directly today (Firebase Console's Firestore Data tab), ahead of the future admin app owning this UI. Every collection is small (a few dozen documents at most), so the app fetches each one whole and filters/sorts client-side rather than via a Firestore query — no composite indexes needed. `purchases.product`/`purchases.grade`/`purchases.paymentMethod` remain **plain strings**, not restricted enums, so new values read/write without any migration.

**Important:** each collection ships with a hardcoded fallback array (today's exact values) in `referenceData.js`, used only when the *live* fetch returns empty — this keeps the app fully usable offline on a fresh install with zero prior sync. Once an admin adds even one document to a previously-empty collection, the fallback stops applying entirely for that collection (it's an all-or-nothing swap, not a merge) — so seeding a collection for the first time should include every value meant to survive, not just the one being added.

- `products/{id}`, `grades/{id}`, `paymentMethods/{id}`, `farmSizes/{id}` — each `{ label, order, active }`.
- `districts/{id}` — `{ name, country, order, active }`. `country` is a code like `'UG'` (see "Country" below); districts with no `country` field are treated as visible everywhere.
- `newFarmerFields/{id}` — the New Farmer form's schema (see "New Farmer form schema" below).

#### New Farmer form schema

Full Name and Phone are **not** part of this collection — they're fixed, always-required inputs in `newFarmer.js` itself, since duplicate-checking (`findFarmerByPhone`) and name search both depend on them existing on every farmer. Every other field on the form (Date of Birth, Gender, Village, District, Farm Size, Hives, Other Crops, Harvest, Chemicals, Training, and anything an admin adds later) is driven by `newFarmerFields/{fieldId}`:

| Field | Type | Notes |
|---|---|---|
| `section` | string | Groups fields under a heading (`'Personal Information'`, `'Farm Information'`, `'Production Details'`, or any admin-added section name) |
| `label` | string | Displayed with a trailing ` *` automatically when `required` is true |
| `type` | string enum: `text`, `tel`, `email`, `date`, `number`, `select`, `choice`, `toggle` | `select`/`choice` render options from either `options` (inline) or `optionsSource`; `toggle` is a fixed Yes/No choice |
| `order` | number | Sort key within the whole form (not just within a section) — can be a decimal (e.g. `10.5`) to slot a new field between two existing ones without renumbering everything else |
| `required` | boolean | Enforced generically at submit time, not per-field-hardcoded |
| `active` | boolean | `false` soft-removes the field from the form without touching any farmer document that already has data under that field id |
| `options` | array of `{id, label}` | Inline option list, for a field whose choices aren't reused anywhere else (e.g. Gender) |
| `optionsSource` | string or absent | Name of another reference collection to pull options from instead (`'districts'`, `'farmSizes'`) — used when the same option list is also relevant elsewhere |
| `placeholder` | string or absent | Shown in the empty input/select |

An option literally valued `"Other"` on any `select`/`choice` field automatically reveals a secondary free-text input at render time, generalizing what used to be District-only special-casing (see `newFarmer.js` `renderField`/`resolveOtherValues`).

**Known field ids** (`dateOfBirth`, `gender`, `email`, `village`, `district`, `farmSize`, `hivesTraditional`, `hivesKtb`, `hivesModern`, `otherCropsOrLivestock`, `avgHarvestKgPerYear`, `usesChemicals`, `wantsTraining`) save into their existing top-level `farmers/{frn}` field, exactly as before this form became schema-driven — Farmer Profile/Card/History need no changes since they read those same top-level fields. Any **other** field id (something an admin adds later that isn't one of the above) is preserved under a new `farmers/{frn}.customFields` map instead of being dropped — though it isn't yet surfaced anywhere else in the UI (Profile, Card, etc.); that's tracked separately in [[Backlog]].

#### Country

`public/js/lib/country.js`'s `getCountryCode()` is the single seam for "which country is this device in," used to filter `districts`. Today it's just a per-device default (`'UG'`) cached in `localStorage` — there's no in-app country picker yet, since Malaika Honey only operates in Uganda today. Automatic detection (e.g. IP/ISP-based) can be added later entirely inside that one function without touching any caller; it can only ever be a best-effort *online* refinement, though, since a device that's never been online still needs a usable default.

## Future M&E-driven additions (not built yet — see [[Backlog]])

These are anticipated, not implemented, so they're named here to keep future schema changes consistent:

- `hiveVisits/{visitId}` — apiary inspection records (hive health, colony strength, GPS location) linked by `frn`, enabling "location of hives over time" and "success of hives" reporting.
- `trainings/{trainingId}` and `farmerTrainings/{id}` (join collection) — which farmers attended which training, for training-impact M&E.
- `incentives/{incentiveId}` — bonus/incentive payments linked by `frn`, separate from `purchases` since they aren't tied to a single delivery.
- `staff/{staffId}` — a richer staff-profile collection (role, assigned centre, etc.), if Firebase Auth's built-in user record ever stops being enough on its own.

### `allowedStaff/{email}`

The admin-managed allowlist that gates real access. Document ID is the staff member's email address as Firebase Auth stores it — for a phone+password account (the primary sign-in method today, see "Staff accounts" below) this is a **synthetic email** derived from the phone number (`{digits}@staff.malaikahoney.local`, e.g. `0772000111@staff.malaikahoney.local`), generated by `phoneToEmail()` in `public/js/lib/auth.js`; for a Google account (currently hidden, see below) it's the real Google account email (e.g. `jokello@gmail.com`).

| Field | Type | Notes |
|---|---|---|
| `addedAt` | string or timestamp | Informational only — when the admin approved this email. Not read by the app; the document's mere existence is what grants access |
| `role` | string, absent or `'admin'` | Absent (or any other value) means a regular staff account. `'admin'` grants access to `/admin/approvals` and the ability to approve/reject `signupRequests` from within the app — see below. Can only ever be set via Firebase Console/Admin SDK, never from the client |
| `fcmTokens` | array of string, absent or `[]` | FCM registration tokens for this staff member's devices that have opted in to push notifications (see [[Push-Notifications]], `public/js/lib/push.js`). A user may `update` only this one field on their own document (`firestore.rules`) — everything else on `allowedStaff` stays Console/Admin-SDK-only. Currently only meaningful for admins, since `functions/index.js` only sends to `role == 'admin'` docs |

The document can otherwise be empty — the rules only check `exists()`, not any field value (except `role`, read by `isAdmin()`). See "Staff accounts" below and [[Config-Management]] "Staff account provisioning" for how entries are added.

### `signupRequests/{email}`

Created client-side by a signed-in-but-unapproved user the first time they're turned away (see `public/js/lib/auth.js` `recordSignupRequest`), so an admin can see and act on it from the in-app `/admin/approvals` screen instead of needing to watch Firebase Console.

| Field | Type | Notes |
|---|---|---|
| `email` | string | Redundant copy of the doc ID (synthetic phone-account email or real Google email — see `allowedStaff` above) |
| `displayName` | string | The name staff typed when creating their phone account, or the Google account's display name |
| `uid` | string | The requester's Firebase Auth UID |
| `status` | string enum: `pending`, `approved`, `rejected` | `pending` until an admin acts. Re-attempting sign-in while still pending just refreshes `lastAttemptAt`; if previously rejected, a fresh sign-in attempt sets it back to `pending` rather than leaving the person permanently stuck with no path to re-request |
| `requestedAt` | timestamp | Set once, on first creation |
| `lastAttemptAt` | timestamp | Updated on every sign-in attempt while still unapproved |
| `resolvedAt` | timestamp or absent | Set when an admin approves/rejects |
| `resolvedBy` | string or absent | The admin's display name |

Approving a request (`/admin/approvals`, `adminApprovals.js` `approveRequest`) creates the corresponding `allowedStaff/{email}` document and sets `status: 'approved'`; rejecting only sets `status: 'rejected'` — no `allowedStaff` document is created, so the person stays blocked. Records are kept (not deleted) for an audit trail, and the fetch behind `/admin/approvals` filters to `status == 'pending'` client-side.

## Staff accounts (phone + password, primary; Google Sign-In, hidden)

Since some staff don't have a Google account, **phone number + a self-chosen password** is the primary sign-in method (`public/js/lib/auth.js` `signInWithPhone`/`createAccountWithPhone`, `public/js/screens/login.js`) — no admin step is required just to let someone *try* signing in. A staff member picks "Create Account" once (entering their name, phone, and a password of their choosing), then "Sign In" with the same phone + password on every later visit. Under the hood this still uses Firebase Auth's email/password provider: the phone number is converted to a synthetic email (`phoneToEmail()`, `{digits}@staff.malaikahoney.local`) so no real email address is required from staff who don't have one.

Google Sign-In (`signInWithGoogle`, the original method) is **not deleted** — it's fully functional in the codebase but hidden from the login screen behind `GOOGLE_SIGNIN_ENABLED` in `public/js/lib/constants.js` (currently `false`). Flipping that one flag back to `true` restores the "Sign in with Google" button with no other changes needed, in case it's wanted again later (e.g. for staff who'd prefer it once most staff have phone accounts).

Whichever method is used, signing in only creates a Firebase Auth session — it does **not** by itself grant access to farmer/purchase data. An account only gets real access once an admin approves it, adding its email (real or synthetic) as a document in the `allowedStaff` collection (see above). Until then, the app shows an "Approval Needed" screen with the signed-in identity displayed — a phone number for a phone account, or the real address for a Google account (`identityLabel()` strips the synthetic domain back down to just the phone number so the raw internal address is never shown to staff). The in-app `/admin/approvals` screen (see `signupRequests` above) works identically regardless of which sign-in method created the request — "admin adds a phone number for sign-in" is satisfied by the admin approving that person's self-service phone signup request there, the same flow already used for Google accounts.

This design (self-service sign-in of either kind + admin-gated data access) replaces an earlier username/password design that turned out to be fragile in practice — accounts created directly in Firebase Console with real email addresses didn't match the app's synthetic-email convention, so nobody could actually sign in. The current phone+password flow avoids that failure mode because account creation is self-service from within the app (staff type their own phone number, which `phoneToEmail()` converts consistently), never a manual Console step. The `allowedStaff` allowlist keeps access restricted to approved people despite sign-in itself being self-service (anyone who can create a phone account, or has a Google account, could otherwise reach farmer/purchase data without this gate).

**Trade-off, accepted:** a phone number is a weaker identity signal than a Google account — Google implicitly proves control of that specific Google identity, while anyone can type any phone number when creating an account (nothing here sends an SMS/OTP to verify it). This doesn't change the actual access-control boundary, though, since the real gate is always admin approval in `allowedStaff`, not which sign-in method was used to reach the "Approval Needed" screen — see [[Risk-Register]] R23.

`registeredBy` / `recordedBy` on farmer/purchase documents come from the signed-in user (`currentDisplayName()`, which falls back to the phone number for a phone account with no display name — in practice this never happens, since account creation always collects a name), giving real accountability per record.

Signing out (`signOutStaff()`) ends the Firebase Auth session outright, so a different staff member can sign in on the same shared device afterward — this is a meaningful difference from the (now-hidden) Google flow, where a browser that remembers a Google account can silently re-authenticate the same person without a picker; phone+password sign-in always requires typing the password again, so it doesn't have that failure mode.

Sessions persist locally (`browserLocalPersistence`) so a staff member who has signed in at least once while online can keep using the app fully offline afterward — `waitForAuthReady()` resolves from the cached session before the app decides whether to show the login screen. The *authorization* result (whether they're on the allowlist) is similarly cached locally (`localStorage`, keyed by uid) the first time it's confirmed online, so a returning approved staff member is never blocked from an authenticated screen just because they're offline — see `public/js/lib/auth.js` `refreshAuthorization`/`isAuthorizedLocally`. If an admin later removes someone from the allowlist, that only takes effect for a given device the next time it manages to reach the server (an inherent, accepted lag for an offline-first app — see [[Risk-Register]]).

## Firestore Security Rules (summary)

See `firestore.rules` in the repo root. Every `farmers`, `purchases`, and `devices` operation requires **both** `request.auth != null` **and** the signed-in user's email existing in `allowedStaff` (an `isApprovedStaff()` helper function in the rules file encapsulates this check). An `isAdmin()` helper additionally checks that the signed-in user's own `allowedStaff` document has `role == 'admin'`.

`allowedStaff` allows a signed-in user to `get` their own document (to check their own status), and an **admin** to `get` any document (needed to check whether an entry already exists before approving someone else's `signupRequests` entry — see `adminApprovals.js`) and `create` new entries — `list`/`delete` remain fully client-blocked, and `update` is allowed only against a user's own document and only for the `fcmTokens` field (push-notification opt-in, see [[Push-Notifications]]); revoking access or changing someone's role stays a Console-only action. `signupRequests` allows any signed-in user to `create` their own entry and read (`get`) it back, but only an admin can `list` the pending queue or `update` (resolve) a request.

`devices/{deviceCode}` additionally allows `create` only if the document doesn't already exist yet, and disallows `update`/`delete` entirely, so a device code can never be silently overwritten. The retired `counters/{counterId}` collection still allows `read` for approved staff (harmless, unused) but no longer allows `write`.
