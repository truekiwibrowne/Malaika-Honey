# Database Schema — Malaika Honey FRM

Database: **Cloud Firestore** (project `malaikahoney-78577`), Native mode.

Firestore is a document store, not relational — this schema describes collections, document shapes, and the indexes/queries they must support. Field names are `camelCase`. All monetary values are stored as integers in UGX (no decimals — UGX has no practical sub-unit in this trade).

## Design principles

- **FRN is the human-facing key**, but the Firestore document ID for a farmer is the FRN itself (e.g. `MH004826`). This makes farmer lookups by FRN a direct document read (no query needed) — fast and works offline from cache.
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
| `registeredBy` | string | Staff name/ID who captured the record (free text until login exists, see [[Backlog]]) |
| `registeredAt` | timestamp | Server timestamp, set once |
| `updatedAt` | timestamp | Server timestamp, set on every edit |
| `lifetimeStats.totalKg` | number | Denormalized running total per product-agnostic weight, updated by a transaction whenever a purchase is saved — avoids summing the whole `purchases` collection on every profile view |
| `lifetimeStats.totalPaidUgx` | number | Denormalized running total paid |
| `lifetimeStats.lastPurchaseAt` | timestamp or null | Denormalized, drives "Last Delivery" on the profile screen |

**Why denormalize `lifetimeStats`:** the Farmer Profile screen must render instantly and offline. Recomputing totals from the `purchases` collection on every screen load doesn't scale and doesn't work well offline. Instead, `buyProduce` writes update both the new `purchases` doc and the farmer's `lifetimeStats` in a single Firestore transaction.

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
| `recordedBy` | string | Staff name/ID, free text until login exists |
| `createdAt` | timestamp | Server timestamp |
| `syncedFromOffline` | boolean | `true` if the write was queued while offline and synced later — useful for QA and dispute resolution |

**Required composite index:** `frn ASC, purchaseDate DESC` — powers the farmer History screen (all purchases for one FRN, newest first). Defined in `firestore.indexes.json`.

### `counters/frnCounter`

Single document holding the sequence used to mint new FRNs.

| Field | Type | Notes |
|---|---|---|
| `lastValue` | number | Last FRN sequence number issued (e.g. `4826`) |

FRN format: `MH` + `lastValue` zero-padded to 6 digits, e.g. `MH004826`. When online, incrementing and reading `lastValue` happens inside a Firestore transaction together with the `farmers/{frn}` document creation, so two staff members registering farmers at the same moment can never be issued the same FRN. Transactions require a live connection, though, so `createFarmer()` falls back to a non-transactional batched write off the locally cached counter value when offline (see [[System-Architecture]] "Offline behavior in detail") — this keeps registration working with no signal, at the cost of a rare cross-device FRN collision if two devices happen to register offline at the exact same moment (see [[Risk-Register]] R3).

### `products`, `grades`, `paymentMethods` (reference collections, optional/future)

The product list (Honey, Bee Wax, Pollen, Propolis, Bee Venom), grade list (A/B/C), and payment method list (Cash, Mobile Money, Bank) are all hardcoded in `public/js/lib/constants.js` for the MVP, because these lists rarely change and hardcoding keeps the app usable fully offline on first install with zero reads.

This is deliberately not a schema limitation: `purchases.product`, `purchases.grade`, and `purchases.paymentMethod` are stored as **plain strings**, not restricted enums, so admin-added values (e.g. a new product, a 4th grade, a new mobile-money provider) can be written and read without any migration the moment the admin app exists. The only piece that needs to change when the list changes is the field app's UI options — today that means a code change to `constants.js`; if the admin app needs to add these without waiting for a field-app redeploy, promote each list to its own small Firestore collection (e.g. `products/{productId}`, `grades/{gradeId}`, `paymentMethods/{methodId}`) and have the field app read from there (falling back to the hardcoded list if offline on first run). The app already reads all three lists from one JS module, so that swap is localized and doesn't touch `purchases`/`farmers` documents at all.

## Future M&E-driven additions (not built yet — see [[Backlog]])

These are anticipated, not implemented, so they're named here to keep future schema changes consistent:

- `hiveVisits/{visitId}` — apiary inspection records (hive health, colony strength, GPS location) linked by `frn`, enabling "location of hives over time" and "success of hives" reporting.
- `trainings/{trainingId}` and `farmerTrainings/{id}` (join collection) — which farmers attended which training, for training-impact M&E.
- `incentives/{incentiveId}` — bonus/incentive payments linked by `frn`, separate from `purchases` since they aren't tied to a single delivery.
- `staff/{staffId}` — once login is added, replaces free-text `registeredBy`/`recordedBy` with a real reference.

## Firestore Security Rules (summary)

See `firestore.rules` in the repo root. MVP rules: open read/write for the mobile app while there is no login (acceptable only because the Firebase project is not publicly advertised and the next milestone is adding App Check + Firebase Auth before wider rollout — tracked in [[Risk-Register]] and [[Backlog]]).
