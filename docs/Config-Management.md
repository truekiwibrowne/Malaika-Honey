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
├── firebase.json           # hosting + emulator config
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

There are currently no server-side secrets (no Cloud Functions, no third-party API keys) — the app is 100% static front-end + Firestore. If Cloud Functions, SMS, or payment integrations are added later (see [[Backlog]]), their secrets belong in Firebase Functions config / Google Secret Manager, never in the `public/` folder, since everything under `public/` is shipped to end-user browsers.

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

Staff sign themselves in with Google (self-service, no Console step needed just to attempt sign-in), but only get real access once their email is approved on the `allowedStaff` allowlist (see [[Database-Schema]] "Staff accounts"). There is no in-app admin UI for this yet (that's Milestone 3 territory — see [[Backlog]]), so approving someone is a manual Firestore write:

1. Ask the staff member to open the app and tap **Sign in with Google** once — they'll land on an "Approval Needed" screen showing their signed-in email. They don't need to do anything else at this point.
2. Firebase Console → **Firestore Database** → `allowedStaff` collection → **Add document**.
3. Document ID: their exact email address as shown on their "Approval Needed" screen (e.g. `jokello@gmail.com`). No fields are required — the document existing at all is what grants access — but adding a note field (e.g. `addedAt`) is fine for your own record-keeping.
4. Tell them to reopen the app and tap **Check Again** on the approval screen (or just reload the app) — they'll land on Home.

**Prerequisite (one-time, per Firebase project):** the Google sign-in provider must be enabled in Firebase Console → **Authentication** → **Sign-in method** → **Google** → **Enable**, before any of the above works in production.

To revoke access, delete that person's document from `allowedStaff` — note that a device that already has cached access won't be blocked until it next reaches the server (see [[Risk-Register]]).

Locally, sign in against the **Auth emulator** (`http://localhost:4000/auth` when `./.tools/run-emulators.sh` is running) — it fakes the Google consent screen with a form, no real Google account needed — and add allowlist entries directly to the **Firestore emulator** the same way (Emulator UI's Firestore tab, or the Admin SDK, both of which bypass rules the way Console does against production).

## Who can change what

Until Firebase Auth/roles exist (Backlog 2.1), anyone with the GitHub repo and Firebase console access can change configuration. Treat Firebase console access the same as production database access — don't share the project owner login broadly; add collaborators by email in Firebase Console → Project settings → Users and permissions instead.
