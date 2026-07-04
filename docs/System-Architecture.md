# System Architecture — Malaika Honey FRM

## Purpose

Malaika Honey needs a Farmer Relationship Manager (FRM): a system that registers farmers once, tracks every honey/product delivery against that farmer over years, and eventually feeds Monitoring & Evaluation (M&E) reporting for NGOs and development partners. This document describes the technical architecture chosen to support that, starting from a single mobile-first field app.

## Guiding constraints (from the field brief)

- Used on inexpensive Android phones, in the field or at buying centres, often with **poor or no internet connectivity**.
- Must work **offline with automatic sync** when a connection returns.
- Staff record a purchase in **at most 3 taps** after selecting a farmer — the architecture must not add network round-trips that slow that down.
- No login required for v1, but the design must not block adding one later.
- Data must remain queryable for years and exportable for M&E — it is the company's core operating record, not a throwaway app database.

## High-level architecture

```
┌─────────────────────────────┐
│   Field / Buying Centre     │
│                              │
│   Mobile Web App (PWA)      │
│   HTML / CSS / vanilla JS    │
│   - Home / Find / Register / │
│     Buy Produce / History    │
│   - Firestore offline cache  │
│     (IndexedDB, built-in)    │
└───────────────┬──────────────┘
                │ HTTPS (Firestore SDK)
                │ queues writes while offline,
                │ syncs automatically on reconnect
                ▼
┌─────────────────────────────┐
│        Firebase              │
│                              │
│  Cloud Firestore             │  ← single source of truth
│  (farmers, purchases,        │
│   counters)                  │
│                              │
│  Firebase Hosting             │  ← serves the static app
│  Firestore Security Rules     │
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
- **No server-side code (no Cloud Functions) in v1.** FRN generation and lifetime-stat totals are handled with Firestore transactions directly from the client (see [[Database-Schema]]). This keeps hosting free-tier-friendly and avoids a deployment target beyond static hosting. Cloud Functions can be introduced later (e.g. for SMS receipts, scheduled M&E exports) without changing the client architecture.
- **Firebase Hosting or Netlify for the static site.** Both are equivalent for this app (it's just static files); Firebase Hosting is the natural default since the database is already on Firebase, but Netlify remains a valid drop-in alternative (see [[Release-Management]]) since there's no server-side coupling.
- **GitHub for source control**, deploys triggered from the `main` branch (see [[Release-Management]]).

## Two applications, one database

The brief separates concerns into two apps sharing the same Firestore database:

1. **Field app (this build, v1)** — mobile-first, 3 screens (Find Farmer, New Farmer, Buy Produce), designed for buying-centre staff. Read/write access to `farmers` and `purchases`.
2. **Admin/management app (future)** — desktop-focused, for reporting, data correction, M&E exports (Excel), and eventually managing training/incentive/hive-visit data. Reads the same collections; no schema changes needed to start it, since Firestore is schemaless and the admin app can simply add new collections (`trainings`, `hiveVisits`, etc. — see [[Database-Schema]]) without migrating the field app.

Splitting them into two deployable apps (rather than one app with hidden admin routes) keeps the field app's bundle and permissions minimal, which matters for load speed on cheap Android phones and for keeping the attack surface small before Auth is added.

## Offline behavior in detail

Firestore's JS SDK is configured with persistent local cache (`persistentLocalCache`) on app start (`public/js/lib/firebase.js`). This means:

- Reads (e.g. "find farmer") are served from the local cache instantly if the farmer was previously synced; if never seen on this device and offline, the search returns nothing until reconnect — communicated in the UI rather than left ambiguous.
- Writes (new farmer, new purchase) are applied to the local cache immediately (so staff see instant confirmation and get the FRN/receipt right away) and queued for upload. When the device regains connectivity, Firestore uploads the queue automatically — no custom code required.
- The FRN counter transaction and lifetime-stat transaction still work offline: Firestore resolves transactions against the local cache and replays them safely on sync, since transactions are per-document and FRNs are only ever issued by one device's queued write at a time reaching the server in order. (See [[Risk-Register]] for the rare multi-device-offline-simultaneously edge case and its mitigation.)

## M&E data flow (future)

The data model is built so that today's operational data (registration + purchase) is already the raw material for tomorrow's M&E reporting:

- Income improvement → sum of `purchases.totalUgx` per `frn` over time.
- Crop yields / honey harvest trends → `purchases.weightKg` per `frn` over time vs. `farmers.avgHarvestKgPerYear` baseline.
- Quality improvement over time → trend of `purchases.grade` per `frn`.
- Location of hives over time → future `hiveVisits` collection (GPS + date), joined by `frn`.
- Training success → future `trainings`/`farmerTrainings` collections, joined by `frn`.

Because every record is keyed by FRN and timestamped, the admin app (or even a scheduled Cloud Function / BigQuery export later) can generate NGO-ready reports without re-architecting the field app.

## Non-goals for v1

- No user accounts/login (tracked in [[Backlog]]).
- No push notifications, SMS, or payments integration.
- No native mobile app — the PWA approach is intentional to avoid app-store distribution friction in rural Uganda.
