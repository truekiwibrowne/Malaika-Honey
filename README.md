# Malaika Honey — Farmer Relationship Manager (FRM)

A mobile-first web app for Malaika Honey field staff to register farmers, look up farmer records by FRN/name/phone, and record honey/bee-product purchases at buying centres — working offline with automatic sync.

## Documentation

Start here — the full project documentation set lives in [`docs/`](docs/):

- [Backlog](docs/Backlog.md) — what's built, what's next
- [Changelog](docs/Changelog.md)
- [Admin User Manual](docs/Admin-User-Manual.md) — for buying-centre staff
- [Config Management](docs/Config-Management.md)
- [Database Schema](docs/Database-Schema.md)
- [QA & Testing](docs/QA-Testing.md)
- [Release Management](docs/Release-Management.md)
- [Risk Register](docs/Risk-Register.md)
- [System Architecture](docs/System-Architecture.md)

## Running locally

Requires the [Firebase CLI](https://firebase.google.com/docs/cli) and Java 21+ (for the Firestore emulator).

```bash
firebase emulators:start
```

This serves the app (Hosting emulator) and a local Firestore instance together — open the URL it prints (see `firebase.json` for the port). The app auto-connects to the emulator on `localhost`; no real Firebase credentials are needed for local development. See [Config Management](docs/Config-Management.md) for how to point it at the real `malaikahoney-78577` project for production.

## Deploying

See [Release Management](docs/Release-Management.md) for Firebase Hosting and Netlify deploy steps.
