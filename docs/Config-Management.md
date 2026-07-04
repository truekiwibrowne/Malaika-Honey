# Configuration Management — Malaika Honey FRM

## Environments

| Environment | Purpose | Firebase project | Data |
|---|---|---|---|
| **Local** | Development on a developer's machine | Firebase Local Emulator Suite (Firestore emulator) | Fake/seeded data, wiped freely |
| **Production** | The real app staff use in the field | `malaikahoney-78577` | Real farmer & purchase data — treat as sensitive |

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

Locally, none of this matters day-to-day: `public/js/lib/firebase.js` detects `localhost` and connects to the Firestore emulator instead, ignoring whether these values are real.

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

## Who can change what

Until Firebase Auth/roles exist (Backlog 2.1), anyone with the GitHub repo and Firebase console access can change configuration. Treat Firebase console access the same as production database access — don't share the project owner login broadly; add collaborators by email in Firebase Console → Project settings → Users and permissions instead.
