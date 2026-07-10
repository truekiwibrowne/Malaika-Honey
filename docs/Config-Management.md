# Configuration Management — Malaika Honey FRM

## Environments

| Environment | Purpose | Firebase project | Data |
|---|---|---|---|
| **Local** | Development on a developer's machine | Firebase Local Emulator Suite (Firestore + Auth emulators) | Fake/seeded data, wiped freely |
| **Production** | The real app staff use in the field | `malaikahoney-78577` | Real farmer & purchase data — treat as sensitive |

Local development runs the Firestore emulator (port `8080`) and the Auth emulator (port `9099`) side by side via `./.tools/run-emulators.sh` — `public/js/lib/firebase.js` detects `localhost` and connects to both automatically. Staff accounts created in the Auth emulator are throwaway/local-only and don't touch the real `malaikahoney-78577` user directory.

There is deliberately no separate "staging" Firebase project yet — the emulator suite covers local testing needs at this scale. Add a staging project (e.g. `malaikahoney-staging`) in [[Backlog]] Milestone 2 if the team grows or before any risky schema migration.

## Repository layout

```
Malaika Honey/
├── docs/                  # this documentation set
├── public/                # the deployable static field app
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── lib/           # firebase.js, constants.js, utils.js
│   │   ├── screens/       # one module per screen
│   │   └── config/
│   │       ├── firebase.config.example.js   # template/reference
│   │       └── firebase.config.js           # committed — see note below
│   └── assets/            # logo, icons
├── functions/              # Cloud Functions (push notifications - see docs/Push-Notifications.md, not yet deployed)
├── firebase.json           # hosting + functions + emulator config
├── .firebaserc             # maps this repo to the malaikahoney-78577 project
├── firestore.rules
├── firestore.indexes.json
└── netlify.toml             # optional alternate host
```

## Firebase Web App configuration

The Firebase **web app config object** (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) is required by the client SDK to connect to `malaikahoney-78577`. This is *not* a server secret — it's safe to ship in a public web app, because access is actually controlled by Firestore Security Rules, not by hiding this object.

**`public/js/config/firebase.config.js` is committed to git with the real values**, deliberately. This app is a static site with no build step and no environment-variable injection at deploy time (Netlify/Firebase Hosting just publish the `public/` folder as-is) — so if this file isn't in the repo, the deployed app has no config to import and fails to start (a blank screen, since the very first module import throws). Gitignoring it was tried initially and broke the first Netlify deploy for exactly this reason.

The web app registration was created via `firebase apps:create WEB` and its config fetched via `firebase apps:sdkconfig WEB <appId>` — both one-time CLI operations against `malaikahoney-78577`. If the app is ever recreated or the project changes, regenerate this file the same way, or from Firebase Console → Project settings → General → "Your apps".

Locally, none of this matters day-to-day: `public/js/lib/firebase.js` detects `localhost` and connects to the Firestore **and Auth** emulators instead, ignoring whether these values are real (the emulator handles sign-in entirely locally, with no cross-domain hop at all — see the `authDomain` note just below).

**`authDomain` must match the domain the app is actually hosted on, not just any valid Firebase domain.** Firebase's default web app config points `authDomain` at `<project-id>.firebaseapp.com` regardless of which Firebase Hosting domain you actually serve the app from. If those differ (e.g. the app is served from `malaikahoney-78577.web.app` but `authDomain` is set to `malaikahoney-78577.firebaseapp.com`), Google Sign-In's redirect/popup round trip becomes cross-origin from the browser's perspective — and Safari's cross-site tracking prevention (especially on iOS) can silently block the storage handoff needed to complete it, bouncing the user back to the login screen with no visible error. Firebase Hosting automatically serves the required `/__/auth/**` handler on **every** domain associated with the project (`.web.app`, `.firebaseapp.com`, and any custom domain), so it's always safe to set `authDomain` to whichever domain your users actually load the app from.

## Environment variables / secrets

There are still no server-side secrets to manage — `functions/` (push notifications, see [[Push-Notifications]]) authenticates via the Cloud Functions runtime's own default service account (Firebase Admin SDK auto-credentials), not a manually-configured secret. If a future Cloud Function, SMS, or payment integration ever needs a real API key, it belongs in Firebase Functions config / Google Secret Manager, never in the `public/` folder, since everything under `public/` is shipped to end-user browsers. The one client-side value related to this, `vapidKey` in `public/js/config/firebase.config.js`, is a Web Push public key, not a secret — same category as the rest of the Firebase web app config above.

## Versioning

- **App version**: tracked in `public/js/lib/constants.js` (`APP_VERSION`) and mirrored in [[Changelog]]. Bump on every release per [[Release-Management]].
- **Data schema version**: each Firestore document carries a `schemaVersion` number (see [[Database-Schema]]) so future app versions can detect and migrate older records instead of assuming a fixed shape.

## Branch/config relationship

| Git branch | Deploys to | Firebase project used |
|---|---|---|
| `main` | Production hosting | `malaikahoney-78577` |
| feature branches | Local machine only (emulator) | Emulator |

See [[Release-Management]] for the full branching and deployment workflow.

## Staff account provisioning

Staff sign themselves in — with **phone number + a self-chosen password** (the primary method today, since not everyone has a Google account) or, if `GOOGLE_SIGNIN_ENABLED` in `public/js/lib/constants.js` is flipped back to `true`, with Google — self-service, no Console step needed just to attempt sign-in. Either way, an account only gets real access once its email (real, for Google, or the synthetic phone-based one — see [[Database-Schema]] `allowedStaff`) is approved on the `allowedStaff` allowlist (see [[Database-Schema]] "Staff accounts"). There are two ways to approve someone — an in-app flow for day-to-day use, and a Console fallback for bootstrapping the very first admin (or if the in-app flow is ever unavailable).

### In-app (normal way, once at least one admin exists)

1. Ask the staff member to open the app, tap **Create Account**, and enter their name, phone number, and a password of their choosing (once — after that they use **Sign In** with the same phone + password). They'll land on an "Approval Needed" screen showing their phone number. This automatically creates a `signupRequests` entry, visible to admins.
2. An admin opens the app, taps **Approve Requests** on Home, and taps **Approve** (or **Reject**) next to that person's name/phone.
3. Tell them to reopen the app and tap **Check Again** on the approval screen (or just reload the app) — they'll land on Home.

### Via Firebase Console (bootstrapping the first admin, or as a fallback)

1. Firebase Console → **Firestore Database** → `allowedStaff` collection → **Add document**.
2. Document ID: their exact email address as shown on their "Approval Needed" screen for a Google account (e.g. `jokello@gmail.com`), or the synthetic phone-account address for a phone account — digits-only phone number + `@staff.malaikahoney.local` (e.g. a staff member who typed `0772 123 456` gets `0772123456@staff.malaikahoney.local`). No fields are required to grant plain staff access — but adding a note field (e.g. `addedAt`) is fine for your own record-keeping.
3. **To make this person an admin** (able to see and act on `/admin/approvals`), add a `role` field with string value `admin` to their document. This is the **only** way to grant admin — it can never be done from within the app itself, by design, so a compromised staff account can't grant itself or others elevated access.

**Prerequisite (one-time, per Firebase project):** the **Email/Password** sign-in provider must be enabled in Firebase Console → **Authentication** → **Sign-in method** → **Email/Password** → **Enable**, before phone+password sign-in works in production (it's the provider phone accounts actually use under the hood). The **Google** provider only needs enabling if `GOOGLE_SIGNIN_ENABLED` is ever flipped back to `true`.

To revoke access, delete that person's document from `allowedStaff` (Console only — this can't be done from the app). Note that a device that already has cached access won't be blocked until it next reaches the server (see [[Risk-Register]]).

Locally, sign in against the **Auth emulator** (`http://localhost:4000/auth` when `./.tools/run-emulators.sh` is running) — the phone+password Create Account/Sign In flow works exactly as in production, no real phone or SMS involved (it's just Firebase Auth's email/password provider under a synthetic address) — and add allowlist entries (with `role: admin` for a test admin) directly to the **Firestore emulator** the same way (Emulator UI's Firestore tab, or the Admin SDK, both of which bypass rules the way Console does against production).

## Editing reference data

Products, grades, payment methods, farm sizes, districts, and the New Farmer form's own field set are all admin-editable Firestore collections (see [[Database-Schema]] "Admin-editable reference data"), not hardcoded lists — the same "Console is the admin UI for now" pattern as staff provisioning above, until the dedicated admin app exists.

1. Firebase Console → **Firestore Database** → the relevant collection (`products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, or `newFarmerFields`).
2. **Add document** to add a new option/field, or open an existing document to edit/deactivate it (set `active: false` rather than deleting, so historical records referencing it stay meaningful).
3. Changes take effect the next time a device reconnects and re-fetches that collection (each is fetched once per app load, not live-updated mid-session).

**Important:** these collections ship empty. The field app falls back to today's hardcoded defaults only while a collection is completely empty — the moment you add even one document, the fallback stops applying for that collection entirely (it's a swap, not a merge). So the **first** edit to any of these collections should include every value you want to keep, not just the new one — e.g. adding a 4th grade means creating documents for `A`, `B`, `C`, **and** the new grade, not just the new one alone.

For `newFarmerFields` specifically: field ids `dateOfBirth`, `gender`, `email`, `village`, `district`, `farmSize`, `hivesTraditional`, `hivesKtb`, `hivesModern`, `otherCropsOrLivestock`, `avgHarvestKgPerYear`, `usesChemicals`, `wantsTraining` map onto existing farmer record fields — anything else is saved under `customFields` instead (see [[Database-Schema]]).

Locally, edit the same collections in the **Firestore emulator** (Emulator UI's Firestore tab, or the Admin SDK) — changes there never touch production data.

## Who can change what

Until Firebase Auth/roles exist (Backlog 2.1), anyone with the GitHub repo and Firebase console access can change configuration. Treat Firebase console access the same as production database access — don't share the project owner login broadly; add collaborators by email in Firebase Console → Project settings → Users and permissions instead.
