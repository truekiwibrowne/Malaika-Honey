# Release Management — Malaika Honey FRM

## Branching strategy

Kept deliberately simple for a small team:

- **`main`** — always deployable. Every commit on `main` is what's live (or ready to be made live) in production.
- **Feature branches** — `feature/<short-name>` (e.g. `feature/buy-produce-history`), branched from `main`, merged back via pull request when working and tested against the emulator (see [[QA-Testing]]).
- **Hotfix branches** — `hotfix/<short-name>` for urgent production bugs, same PR process, fast-tracked review.

No long-lived `develop` branch — at this scale it adds overhead without benefit. Revisit if the team grows past a couple of concurrent contributors.

## Release process

1. Merge one or more feature/hotfix branches into `main` via PR.
2. Update [[Changelog]] with the change under an `Unreleased` section as you go; move it under a dated version heading at release time.
3. Bump `APP_VERSION` in `public/js/lib/constants.js` (semantic versioning: `MAJOR.MINOR.PATCH`).
4. Bump `CACHE_NAME` in `public/sw.js` to match (e.g. `malaika-shell-v1.2.3`) — this is what evicts the old cached app shell on a returning device and makes sure staff actually get the new release rather than an indefinitely-stale offline-cached copy of the old one (see "Offline app shell caching" below).
5. Tag the release in git: `git tag vX.Y.Z && git push origin vX.Y.Z`.
6. Deploy (see below).
7. Smoke-test production against the [[QA-Testing]] golden-path checklist before telling staff to use the new version.

### Versioning guide

- **PATCH** (`1.0.1`): bug fix, copy change, style tweak — no behavior change for staff.
- **MINOR** (`1.1.0`): new feature (e.g. a new field, a new screen) that's backward compatible.
- **MAJOR** (`2.0.0`): breaking change to data shape or workflow that requires staff retraining or a data migration.

### Offline app shell caching

`public/sw.js` is a service worker that precaches the app shell (HTML/CSS/JS/icons, plus the pinned Firebase SDK CDN files) so the app can still open with zero connectivity — e.g. after being force-quit and reopened while offline, which previously showed the browser's own "no internet" error before any app code could run. This is separate from Firestore's own offline *data* cache (see [[System-Architecture]] "Offline behavior in detail"), which only covers documents, not the page itself.

Because of this, staff won't see a new release until their device gets a chance to fetch the updated `sw.js` and its new `CACHE_NAME` while online (the old cache is deleted once the new one activates) — normal for a PWA, but worth knowing if a fix doesn't seem to have "reached" a specific device yet: it will, the next time that phone is online.

## Deployment targets

The app is a static site with no build step, so deployment is just "publish the `public/` folder." Two equivalent options are supported — pick one as primary, keep the other documented as a fallback:

### Option A — Firebase Hosting (recommended, same project as the database)
```bash
firebase deploy --only hosting
```
Uses `firebase.json` (`"public": "public"`) and the `malaikahoney-78577` project already linked via `.firebaserc`.

### Option B — Netlify
Connect the GitHub repo in the Netlify dashboard, or deploy manually:
```bash
netlify deploy --dir=public --prod
```
`netlify.toml` sets the publish directory so drag-and-drop or CI deploys behave the same way.

Both options serve the exact same static files — there is no environment-specific build, so there's no risk of the two hosts drifting in behavior.

## Rollback

- **Firebase Hosting**: Console → Hosting → previous release → "Rollback." Instant, no redeploy needed.
- **Netlify**: Deploys tab → previous deploy → "Publish deploy."
- **Data**: there is no automatic Firestore rollback. Because writes are additive (documents aren't overwritten destructively in normal flows), most releases don't need a data rollback. For anything that does touch existing data at scale, export a Firestore backup first (Console → Firestore → Import/Export) — see [[Risk-Register]].

## Pre-release checklist

- [ ] Ran through the [[QA-Testing]] golden-path checklist against the emulator.
- [ ] Tested at least once on an actual low-end Android phone / small screen, not just desktop preview.
- [ ] Tested offline → online sync at least once (airplane mode toggle) if the change touches data writes.
- [ ] [[Changelog]] updated.
- [ ] No secrets or real farmer data committed (check `.gitignore` coverage — see [[Config-Management]]).
