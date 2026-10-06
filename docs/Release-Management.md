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

## Deployment target

The app is a static site with no build step, so deployment is just "publish the `public/` folder" to **Firebase Hosting**:
```bash
firebase deploy --only hosting
```
Uses `firebase.json` (`"public": "public"`) and the `malaikahoney-78577` project already linked via `.firebaserc`. This is what serves the real production app at `https://malaikahoney-78577.web.app/`.

Note: this does **not** deploy `functions/` (push notifications — see [[Push-Notifications]]), a separate, not-yet-active deploy target requiring the Blaze plan (`firebase deploy --only functions`, see that doc for the full one-time setup). Ordinary releases per this doc never need to touch it.

**Netlify is back as of v0.9.0 — but for the management app only.** It was previously an alternate host for the *field* app and removed in v0.6.2 for good reason (two hosts for one app added nothing). That reasoning doesn't apply now: these are two different applications with different audiences, and the field app remains Firebase-Hosting-only.

## Deploying the management app (`admin/`)

`netlify.toml` publishes `admin/` and runs one copy command first (not a bundler):

```bash
mkdir -p admin/js/shared && cp public/js/lib/farmerFields.js public/js/lib/referenceDefaults.js public/js/lib/mapPicker.js public/js/lib/officeAccounts.js public/js/config/firebase.config.js admin/js/shared/
```

That keeps `public/` as the single source of truth for the modules both apps share; `admin/js/shared/` is gitignored so a stale committed copy can't diverge. Run `.tools/sync-admin-shared.sh` before serving `admin/` locally.

The two deploys are fully independent — `firebase deploy --only hosting` publishes `public/` and never touches `admin/`, and a Netlify deploy never touches the field app. Only `firestore.rules` is shared, so a rules change must be deployed once (`firebase deploy --only firestore:rules`) regardless of which app prompted it.

**v0.11.0 needs all three deploys**: rules (new `villages`, `cropsLivestock`, `dataCheckDismissals`), the management app, and - unlike v0.10.0 - the **field app** too (`firebase deploy --only hosting`), which carries the village dropdown, crops & livestock and farm-location questions.

**Which Netlify site:** the management app staff use is `malaikahoney-management.netlify.app`. It is not linked to GitHub, so it needs a manual deploy (drag the synced `admin/` folder onto its Deploys page) unless it is linked under Site configuration → Build & deploy → Link repository. A second, GitHub-linked site `malaika-honey-management.netlify.app` exists and updates on every push.

**v0.10.0 needs a rules deploy.** Settings, Staff access, the Activity log and every audit entry depend on the new `firestore.rules`; until they are deployed, those screens fail with "permission denied" (the app says so) while everything else works. Deploy rules **before or together with** the Netlify deploy:

```bash
firebase deploy --only firestore:rules
```

Before the **first** Netlify deploy, complete the one-time Console setup in [[Config-Management]] "Management app setup" — otherwise sign-in works on localhost and fails in production.

## Rollback

- **Firebase Hosting**: Console → Hosting → previous release → "Rollback." Instant, no redeploy needed.
- **Data**: there is no automatic Firestore rollback. Because writes are additive (documents aren't overwritten destructively in normal flows), most releases don't need a data rollback. For anything that does touch existing data at scale, export a Firestore backup first (Console → Firestore → Import/Export) — see [[Risk-Register]].

## Pre-release checklist

- [ ] Ran through the [[QA-Testing]] golden-path checklist against the emulator.
- [ ] Tested at least once on an actual low-end Android phone / small screen, not just desktop preview.
- [ ] Tested offline → online sync at least once (airplane mode toggle) if the change touches data writes.
- [ ] [[Changelog]] updated.
- [ ] No secrets or real farmer data committed (check `.gitignore` coverage — see [[Config-Management]]).


### Single-file fallback for a manual Netlify deploy

If a Git-based deploy isn't available, the whole management app can be bundled into one self-contained `dist/index.html`:

```bash
python3 .tools/bundle-admin.py
```

It inlines the CSS, all modules (each wrapped in its own scope, since e.g. `farmers.js` and `purchases.js` both declare a module-level `cache`), and the logos as data URIs. Only the Firebase SDK stays remote. The result is ~480 KB and can be dragged onto Netlify on its own.

**This is an escape hatch, not the normal path.** It is a build artifact — `dist/` is gitignored, and `admin/` remains the source. Regenerate it after any change to the admin app, or you will deploy a stale copy.
