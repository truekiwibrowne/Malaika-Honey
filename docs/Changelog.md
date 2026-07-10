# Changelog — Malaika Honey FRM

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows semantic versioning (see [[Release-Management]]).

## [Unreleased]

## [0.6.4] - 2026-07-10

### Added
- **Short office codes now work as sign-in passwords.** Firebase Auth requires at least 6 characters, but office codes are meant to be short (e.g. 4 digits) for staff to remember and type easily. `signInWithOfficeCode` (`public/js/lib/auth.js`) now transparently appends a fixed, non-secret suffix (`-mhfrm`) to the typed code before it's sent to Firebase — staff only ever type the short code shown to them; the padded value only exists as the real Firebase password, set once when the account is provisioned (see [[Config-Management]] "Field office provisioning", updated with the exact password format to use in Console).

## [0.6.3] - 2026-07-10

Office+code sign-in as the primary method — this and the `0.5.3`–`0.6.2` releases below were developed in parallel and merged together; this entry covers only what's genuinely new here, not the overlapping perf/fullscreen work already described under those versions.

### Added
- **Office + code sign-in**: one shared login per field office (`signInWithOfficeCode` in `public/js/lib/auth.js`) — pick the office from a dropdown, type its code. Unlike every prior sign-in method, this is admin-provisioned rather than self-service (see [[Config-Management]] "Field office provisioning"); the office's code is literally its Firebase Auth password. New `fieldOffices/{officeId}` Firestore collection (`{ label, order, active }`, same pattern as `products`/`grades`/etc.) powers the dropdown — the one collection in the whole schema readable with no sign-in at all, since the picker has to render before anyone is authenticated.
- **`PHONE_SIGNIN_ENABLED`** flag (`public/js/lib/constants.js`, `false` by default): phone+password is now hidden the same way Google already was, both fully retained in the code and restorable by flipping a flag.
- Minimal-text redesign of Login and "Approval Needed" (`notAuthorized.js`) — long explanatory paragraphs removed, short labels/identity only, for staff who don't read/speak English well.

### Fixed
- **A second, independent fix for the same `adminApprovals.js` regression addressed by 0.6.1's rules change below:** removed the client-side pre-check (`getDoc` on the target account, added in 0.5.2) entirely rather than relying on the rules loosening alone — `approveRequest` now just attempts the `create` and treats a `permission-denied` result as "already exists, nothing to grant." Kept alongside 0.6.1's `firestore.rules` change (both are correct and harmless together) since it makes the client code correct independent of that specific rule.

### Merge note
This release reconciles two sets of changes to the same files developed in parallel: `app.js`'s lazy/eager route split, `index.html`'s preconnects and boot spinner, and the `0.5.3`/`0.5.4` perf and fullscreen work all took the version already on `main` (described below) as-is. Combined the two independent fullscreen approaches: kept `apple-mobile-web-app-status-bar-style: black-translucent` (over `default`) with the safe-area padding applied to `#app` as a whole (over `.app-header` alone), so the inset covers the offline banner too when it's showing, not just the header — otherwise identical to what's described under 0.5.4.

## [0.6.2] - 2026-07-10

Reconciles this branch with the startup-speed fix (`app.js` lazy auth/screen loading, boot-time spinner) pushed directly to `main` while this PR was open — no functional change beyond the version/cache-name bump needed to keep the two independently-numbered `0.5.3` releases straight (see below).

## [0.6.1] - 2026-07-10

### Fixed
- **Approving a signup request failed with "Missing or insufficient permissions"** for any admin approving someone *other than themselves* (i.e. every real case) — `adminApprovals.js`'s `approveRequest()` reads the requester's own `allowedStaff` doc first (added in 0.5.2, to check whether it already exists before deciding create-vs-skip), but `firestore.rules` only ever allowed a user to `get` their *own* `allowedStaff` document, not an admin reading someone else's. Fixed by allowing `get` for `request.auth.token.email == email || isAdmin()`, the same self-or-admin pattern already used for `signupRequests`. This is a live production bug (unrelated to the fullscreen/push-notification work in this same PR) — deploy `firestore.rules` as soon as possible: `firebase deploy --only firestore:rules`.

### Removed
- **Netlify support.** Firebase Hosting is now the only deploy target — deleted `netlify.toml` and the Netlify GitHub integration/preview deploys, removed Netlify from `docs/Release-Management.md`/`Config-Management.md`/`System-Architecture.md`/`README.md`/`Backlog.md`, and dropped the `.netlify` entry from `.gitignore`. Production has always been `https://malaikahoney-78577.web.app/` (Firebase Hosting) regardless; this just removes the now-unused second option so PRs stop getting Netlify preview-deploy noise.

## [0.6.0] - 2026-07-10

Admin push notifications — built and functionally complete, but **inert until deployed** (see [[Push-Notifications]] for the one-time Blaze-plan/VAPID-key setup this depends on; no behavior change for any current user until then).

### Added
- **`functions/`**: new Cloud Functions codebase (`notifyAdminsOnSignupRequest`, `notifyAdminsOnPurchase`, `notifyAdminsOnFarmerRegistered`) — Firestore `onDocumentCreated` triggers that push a notification to every admin's registered device via Firebase Cloud Messaging whenever a sign-in request, purchase, or new farmer is created. Prunes dead tokens automatically. Not deployed by the existing `firebase deploy --only hosting` release process, and requires the Blaze plan.
- **`public/js/lib/push.js`**: client-side FCM registration — requests notification permission, saves the device's token onto the signed-in admin's own `allowedStaff/{email}.fcmTokens`, and reuses the existing `sw.js` service worker registration rather than adding a second one.
- **"Enable Notifications" toggle on Home** (admin-only, `home.js`), hidden entirely unless `isPushConfigured()`/`isPushSupported()` both pass (real `vapidKey` configured, and the platform actually supports Web Push — notably excludes iOS Safari outside an installed home-screen PWA).
- **`public/sw.js`**: `push` and `notificationclick` handlers — shows the incoming notification and, on tap, focuses/opens the app to the relevant screen (Approve Requests, or a farmer's profile).
- **`vapidKey`** in `public/js/config/firebase.config.js` (currently `''`) — the single value that flips this feature from inert to live once filled in.
- **`firestore.rules`**: a signed-in user may now `update` their own `allowedStaff` document, but only the `fcmTokens` field — everything else (`role`, `addedAt`) stays immutable from the client, so this can't be used for privilege escalation.
- **`docs/Push-Notifications.md`**: full setup checklist and architecture notes for this feature.

## [0.5.4] - 2026-07-10

### Fixed
- **App didn't run fullscreen when added to the Home Screen on iOS**, showing Safari's own chrome above the header — added the `apple-mobile-web-app-capable`/`apple-mobile-web-app-status-bar-style`/`apple-mobile-web-app-title` meta tags `index.html` was missing (the `manifest.webmanifest`'s `"display": "standalone"` alone isn't enough for older iOS Safari to treat it as a true standalone app).
- **Visible colour seam behind the status bar**: `.app-header` now pads itself with `env(safe-area-inset-top)` so its white background extends up under the status bar/notch instead of showing the page's cream background there, making the status bar and header read as one continuous surface. Added matching `env(safe-area-inset-bottom)` padding to `#app` so the bottom of the screen isn't crowded against the home-indicator area either.
- **Logo crowded the sync badge** in the header — `.app-header img.logo` was rendered at a fixed `48px` height regardless of the lockup's wide aspect ratio, leaving little room for the "Synced" badge next to it on narrow phones. Reduced to `38px` and added a small `gap` on `.app-header` for consistent minimum spacing.

## [0.5.3] - 2026-07-10

Startup speed fix: opening the app took as long as ~8 seconds with nothing visible on screen. Three compounding causes, all fixed:

### Fixed
- **App open no longer blocks on a live network call for a staff member already approved on this device.** `app.js`'s `start()` used to always `await refreshAuthorization(user)` (a live Firestore `getDoc`) before the router ran its first route or rendered anything — on every single app open, not just the first. This directly contradicted the documented QA expectation ("no repeated approval check hitting the network," see [[QA-Testing]]) and was the single biggest contributor to the delay, especially on a slow mobile connection. Now this network round trip is only awaited the first time a device confirms a given staff member; on every subsequent open it's skipped up front (the already-cached local flag is used instead) and refreshed quietly in the background after the UI is already showing, so a since-revoked account is still caught eventually without holding up the render.
- **Non-landing screens are no longer fetched and parsed before the app can show anything.** `app.js` used to `import` all 12 screens (including Buy Produce, Reconcile, Farmer Card, etc.) eagerly at the top of the file, so a cold open had to download and evaluate the whole app before routing to even the Login or Home screen. Every screen except Login and Home (the only two possible landing screens) is now fetched via a dynamic `import()` the first time its route is visited, shrinking the initial module graph substantially. Each screen is still precached by the service worker after first visit, so this only costs a network round trip once per device.
- **Blank white screen for the entire load.** `index.html` now paints the header logo and a loading spinner immediately from static markup, before `js/app.js` has even been fetched, instead of leaving `#app-header`/`#screen-root` empty until the app finished booting. Also added `<link rel="preconnect">` for the Firebase SDK CDN and Auth/Firestore API origins, and `<link rel="modulepreload">` for the app's own critical-path modules, so those connections/fetches start in parallel with HTML parsing instead of only being discovered after `app.js` runs.

## [0.5.2] - 2026-07-09

### Added
- **`public/sw.js`**: a service worker that precaches the app shell (HTML/CSS/JS/icons + the pinned Firebase SDK CDN files), registered from `app.js`. Fixes the app failing to open at all — showing the browser's own "no internet" error — when force-quit and reopened with no connectivity. This is separate from Firestore's own offline *data* cache, which only ever covered documents, not the page itself. See [[Release-Management]] "Offline app shell caching" for the release-process implication (bump `CACHE_NAME` alongside `APP_VERSION` on every release).

### Fixed
- **Password field on Login** rendered noticeably smaller than the Phone Number field above it — `input[type="password"]` was missing from the shared input styling rule in `styles.css` (every other input type was listed explicitly), so it fell back to the browser's own smaller default size.
- **Approve Requests' empty state** ("No pending sign-in requests.") had its heading left-aligned instead of centered like the rest of that screen — added the same `text-align:center` styling already used consistently elsewhere (Login, Not Authorized, the success screens). Reconcile's matching "nothing to fix" empty state had the same issue, fixed the same way.
- **Approving a signup request silently failed** (`permission-denied`, caught but not obviously surfaced) whenever that email already had an `allowedStaff` document — e.g. an admin bootstrapped directly in Firebase Console per [[Config-Management]], who still had a stale pending request left over from their own first sign-in attempt. Firestore rules only allow an admin to `create` an `allowedStaff` document, never `update` one, by design (revoking access or changing role stays Console-only) — a plain `setDoc` against an *existing* document is legally an "update" and got rejected. `approveRequest` now checks first and skips the write entirely if the document already exists (nothing to grant), only ever `create`-ing a genuinely new one.

## [0.5.1] - 2026-07-09

Phone number + password as the primary sign-in method (Google Sign-In hidden but retained), a systemic offline-read performance fix, screen-layout corrections based on real-device feedback, and a dark-mode logo fix.

### Added
- **Phone + password sign-in**: `createAccountWithPhone`/`signInWithPhone` (`public/js/lib/auth.js`) let staff without a Google account create their own account (name, phone, self-chosen password) and sign back in later — under the hood this uses Firebase Auth's email/password provider against a synthetic email derived from the phone number (`phoneToEmail()`), so no real email address is required. Feeds into the exact same `allowedStaff`/`signupRequests`/admin-approval pipeline as Google Sign-In (added in 0.4.0) — no separate approval mechanism was needed.
- **`login.js` rewrite**: explicit **Sign In** / **Create Account** toggle (Create Account also collects a name) — deliberately two separate actions rather than one auto-detecting flow, since modern Firebase Auth returns the same generic error for "wrong password" and "no such account" to prevent account enumeration.
- **`GOOGLE_SIGNIN_ENABLED`** flag (`public/js/lib/constants.js`, currently `false`): Google Sign-In is fully retained in the codebase but hidden from the login screen, restorable by flipping one flag.
- **`identityLabel()`/`phoneFromSyntheticEmail()`** (`auth.js`): show a phone-account user's actual phone number rather than its internal synthetic email address on the "Approval Needed" screen and the Approve Requests list.
- **`<meta name="color-scheme" content="light">`** in `index.html`: the app has no separate dark theme, so this tells browsers not to auto-invert/force-dark the page — fixes the header logo (an opaque PNG with a baked-in white background) showing as a mismatched white box when the device is in dark mode.

### Fixed
- **Offline reads no longer feel stuck.** Plain `getDoc`/`getDocs` calls always attempt a live server round-trip first regardless of actual connectivity, only falling back to the local cache after a real multi-second timeout — this made screens feel broken offline even when the needed data was already cached, especially with several such reads on one page. Every read that can run offline is now guarded with `navigator.onLine ? liveRead() : cacheRead()`: `db.js` (`getFarmerByFrn`, `findFarmerByPhone`, `findFarmerByName`, `searchFarmers`, `getUnverifiedPurchases`, `getPurchaseHistory`), `referenceData.js` (`getOptionList`), `auth.js` (`refreshAuthorization`), `home.js` and `adminApprovals.js` (pending-request counts/lists).
- **Screen centering reverted on list/lookup screens.** Existing Farmer search, Buy Produce's standalone FRN-search entry screen, Farmer Profile, History, and Farmer Card were vertically centered in 0.2.5 based on feedback at the time; further feedback clarified these should start at the top like the registration/purchase forms — reverted to top-anchored. Reconcile and Approve Requests' populated-list views were reverted the same way for consistency; their "nothing pending" empty states (one-time acknowledgments, like the success screens) remain centered.
- Buy Produce's empty-search message already correctly said "continue with the FRN above" (fixed in 0.2.5) — reconfirmed while touching this screen.
- Signing out now reliably returns to a phone+password Login screen with no auto-re-authentication as the previous user — this was a real risk with the (now-hidden) Google flow, where a browser remembering the last Google account could silently re-sign-in the same person without a picker; phone+password sign-in always requires re-typing the password, so a different staff member can sign in on the same shared device.

## [0.4.0] - 2026-07-09

In-app admin approval flow, replacing the Firebase Console-only staff approval step for day-to-day use.

### Added
- **`allowedStaff.role`**: a staff account can now be marked `'admin'` (Console-only, can never be granted from within the app).
- **`signupRequests/{email}`**: automatically created when a signed-in-but-unapproved user is turned away, so an admin can see who's waiting.
- **Approve Requests** button on Home (admin accounts only, with a pending-count badge) → new `/admin/approvals` screen listing pending sign-in requests with **Approve**/**Reject** actions. Approve creates the `allowedStaff` entry; reject leaves the person blocked but not permanently — signing in again later generates a fresh pending request.
- Firestore rules: new `isAdmin()` helper; `allowedStaff` now allows `create` (not `update`/`delete`) for admins; new `signupRequests` collection rules (self-serve `create`/own `get`, admin-only `list`/`update`).

### Fixed
- QA-Testing.md referenced a header sign-out icon that no longer exists since sign-out moved to a Home-screen button in 0.2.5 — corrected the stale checklist wording.

## [0.3.0] - 2026-07-07

Products, grades, payment methods, farm sizes, districts, and the New Farmer form's own field set are now admin-editable Firestore collections instead of hardcoded lists, ahead of the future admin app owning this UI.

### Added
- **`public/js/lib/referenceData.js`**: fetches `products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, and `newFarmerFields` from Firestore, with a hardcoded fallback (today's exact defaults) for a fresh install with zero network activity.
- **Dynamic New Farmer form**: every field except Full Name and Phone (dateOfBirth, gender, email, village, district, farmSize, hives, otherCropsOrLivestock, avgHarvestKgPerYear, usesChemicals, wantsTraining) is now driven by the `newFarmerFields` Firestore schema — an admin can add new fields, deactivate old ones (without touching existing farmers' data), reorder, and toggle required, all via Firebase Console today. Any field an admin adds beyond the built-in set is saved into a new `farmers/{frn}.customFields` map.
- **Country seam**: `public/js/lib/country.js` `getCountryCode()` filters the district list by a per-device country code (defaults to `'UG'`) — the single place automatic (IP-based) or admin-configured detection can be added later.
- Buy Produce's Product/Grade/Payment choices now read from the same Firestore collections instead of static arrays in `constants.js`.
- An option literally valued `"Other"` on any select/choice field (not just District) now generically reveals a free-text fallback input.

### Fixed
- The Product choice-chip row could stretch a lone trailing item (e.g. "Bee Venom") to the full row width when the count didn't divide evenly — capped chip width so wrapping looks consistent regardless of item count.

## [0.2.5] - 2026-07-07

UI polish pass based on real-device feedback.

### Changed
- Sign-out moved from a header icon (shown on every sub-screen) to a single "Sign Out" button at the bottom of the Home screen — the header no longer has a logout control anywhere.
- Header logo restored to a larger, more visually prominent size (had shrunk during the Phase 4 header restructure).
- Tutorial now renders as a full-screen modal overlay (dimmed backdrop, no header/back/home/sync-badge visible underneath) instead of a regular screen, and supports swiping left/right between slides in addition to the Next/Skip buttons and now-tappable dots.
- Every screen except the New Farmer registration form and the Buy Produce purchase form (both long, top-anchored data-entry forms) is now vertically centered instead of pinned to the top of the screen.

### Fixed
- Buy Produce's "no match" message referenced "the FRN below" when the FRN field is actually above that message; corrected to "above."

### Fixed
- Google Sign-In still looped back to the login screen after 0.2.3's popup-vs-redirect change, on both the popup and redirect paths. The actual root cause: `authDomain` in `firebase.config.js` was set to `malaikahoney-78577.firebaseapp.com`, but the app is served from `malaikahoney-78577.web.app` — a different origin from the browser's perspective. That mismatch is what made the auth round trip cross-origin and vulnerable to Safari's cross-site tracking prevention, regardless of popup vs. redirect. Fixed by setting `authDomain` to `malaikahoney-78577.web.app` to match the app's actual hosting domain (see [[Config-Management]] "Firebase Web App configuration" and [[Risk-Register]] R18).

## [0.2.3] - 2026-07-07

### Fixed
- Google Sign-In silently failed and bounced back to the login screen on iOS Safari, with no visible error. Root cause: `signInWithRedirect`'s round trip through Firebase's separate `authDomain` (`malaikahoney-78577.firebaseapp.com`, a different origin than the app itself) doesn't reliably persist the session on return under Safari's cross-site tracking prevention. Switched to `signInWithPopup` for normal browser-tab use (the common case), keeping `signInWithRedirect` only as a fallback once the app is installed to the home screen as a standalone PWA (where a popup has no separate window to open into).
- Also fixed: the login and "Approval Needed" screens rendered pinned to the top of the page instead of vertically centered.

## [0.2.2] - 2026-07-06

Replaces username/password login with Google Sign-In + an admin-approved allowlist.

### Added
- **Google Sign-In**: staff sign in with their own Google account (self-service, no admin step just to attempt sign-in) instead of a username/password created in Firebase Console.
- **`allowedStaff` allowlist**: real data access is gated on the signed-in email existing in this Firestore collection, managed manually by an admin. Unapproved sign-ins land on a new "Approval Needed" screen showing their email, with a "Check Again" button.
- Firestore Security Rules now require allowlist membership (not just `request.auth != null`) on every `farmers`/`purchases`/`devices` operation.

### Changed
- `public/js/lib/auth.js` no longer has a synthetic-email/password sign-in path; replaced with `signInWithGoogle()` (redirect-based, since the app is an installable standalone PWA where popups are unreliable) and `refreshAuthorization()`/`isAuthorizedLocally()`.
- Login screen is now a single "Sign in with Google" button.

### Fixed
- The previous username/password login was effectively unusable in production: staff accounts created directly in Firebase Console with real email addresses never matched the app's `username@staff.malaikahoney.local` synthetic-email convention, so nobody could actually sign in.

## [0.2.1] - 2026-07-06

Staff login, fully-offline registration/purchases, sync status indicator, header restructure, and a first-run tutorial.

### Added
- **Staff login** (Firebase Auth): each staff member signs in with their own username/password (mapped to a synthetic `@staff.malaikahoney.local` email so no real email is needed). Sessions persist locally, so signing in once while online is enough to keep working fully offline afterward.
- **First-run tutorial**: a short, skippable 4-slide walkthrough shown once per staff account right after their first sign-in.
- **Fully offline registration and purchase recording**: FRN minting no longer depends on a server-side counter/transaction (which failed outright offline) — FRNs are now minted client-side from a per-device code + local sequence (e.g. `MHA1000042`), guaranteeing uniqueness without any server round-trip. Existing `MH000001`-style FRNs are untouched and keep working.
- **Buy Produce as a standalone, offline-capable entry point**: reachable directly from Home, not just from a confirmed Farmer Profile. Staff can type an FRN and record a purchase even if that farmer isn't recognized on the device yet (offline, first time seen) — the purchase still saves, flagged for reconciliation.
- **Reconciliation screen** (`/reconcile`): lists purchases saved against an unrecognized FRN, lets staff search and link each to the correct farmer, applying the deferred lifetime-stats update. A banner on Home surfaces the count whenever any are unresolved.
- **Sync status badge**: every authenticated screen shows Synced / Not Synced / Offline in the header, backed by `public/js/lib/sync.js`.
- **Header restructure**: Home keeps the full logo + sync badge; every other screen shows back/home/sign-out icon buttons + the sync badge instead of the logo, driven centrally by the router rather than per-screen back links.
- **Custom line-icon set** (`public/js/lib/icons.js`) replacing every emoji icon app-wide, in a consistent style.
- Firestore Security Rules now require `request.auth != null` on every `farmers`/`purchases`/`devices` operation; new `devices/{deviceCode}` collection with create-only rules.

### Changed
- Home's "Find Farmer" renamed to **Existing Farmer** (same behavior).
- `registeredBy` / `recordedBy` now come from the signed-in staff account instead of free text.

## [0.2.0] - 2026-07-04

Deployment fixes, duplicate-registration checks, and a UI/layout overhaul based on real-device testing.

### Added
- Duplicate-registration checks on New Farmer: a phone number already on file **blocks** saving (shows the existing farmer's name and FRN); a name already on file shows a confirm dialog so staff can proceed or go back, since two farmers can share a name but not a phone number.
- Farmer Card is now a **PDF download** (via jsPDF, generated client-side, CR80 ID-card sized) instead of the browser print dialog.
- Consistent bold Title + muted Subtitle pattern on every screen, replacing ad-hoc heading styles.
- Cache-Control `no-cache` headers on JS/CSS/HTML in `firebase.json` so devices always revalidate instead of running stale cached code after an update.

### Fixed
- Blank page on first deploy: `firebase.config.js` was gitignored, so the deployed build had no Firebase config to import. It's committed now (documented as safe to expose — see [[Config-Management]]).
- Home screen buttons were pinned to the top instead of centered; page footer could get pushed off-screen. Root cause was `#app` using `min-height: 100vh` instead of a fixed height, so `.screen` never properly bounded its content.
- Header logo jumped/behaved inconsistently when the on-screen keyboard opened — caused by `position: sticky` on the header; replaced with a plain fixed-size flex layout.
- Form fields had no spacing between them on Buy Produce (looked squashed) because the flex `gap` was only applied to `.screen`'s direct children, not to fields inside the `<form>`.
- Fields could overflow horizontally in the 3-column beehive count row — a flexbox `min-width: auto` default blocking proper shrinking.
- `.hint` text (including the home screen footer) was rendering at full body size instead of small/muted — the CSS rule was accidentally scoped to only apply inside form fields.
- Removed the redundant "Malaika Honey" heading from Home and duplicate search-prompt text from Find Farmer (both already covered by the header logo / input placeholder).

### Changed
- Header logo enlarged twice this release (~57% → ~73% of header width) based on feedback.
- Removed per-screen header titles next to the logo (the `setHeaderTitle` mechanism) in favor of in-screen Title/Subtitle text — since re-added as the Title/Subtitle pattern above.
- Farmer Profile: removed "Edit Details" (farmer record edits will live in the future admin app, not this field app).
- Find Farmer placeholder now says "Farmer Registration Number" instead of "FRN" for clarity to new users.

## [0.1.0] - 2026-07-04

Initial build of the Field App MVP.

### Added
- Project scaffolding: GitHub repository, Firebase project (`malaikahoney-78577`) wiring, Firebase Hosting + Netlify deploy options.
- Full documentation set: [[Backlog]], [[System-Architecture]], [[Database-Schema]], [[Config-Management]], [[QA-Testing]], [[Release-Management]], [[Risk-Register]], [[Admin-User-Manual]], this Changelog.
- Brand assets extracted from source logo files (icon, favicon set, header lockup).
- Mobile-first field app (static HTML/CSS/JS, no build step):
  - Home screen with Find Farmer / New Farmer / Buy Produce.
  - New Farmer registration form with automatic FRN generation (`MH######`).
  - Find Farmer search by name, FRN, or phone.
  - Farmer Profile with lifetime honey total, last delivery date, total paid.
  - Buy Produce form (product, weight, grade, price/kg, payment method, receipt number) with automatic total calculation.
  - Post-save "next logical action" flow (record another purchase / find another farmer / return home) to minimize navigation during busy periods.
  - Per-farmer purchase History screen.
  - Printable farmer ID card.
  - Offline-first behavior via Firestore local persistence, with automatic sync on reconnect.
- Firebase Emulator Suite configuration for local development/testing without touching production data.

### Notes
- No staff login in this release — tracked in [[Backlog]] Milestone 2.
- Firestore Security Rules are intentionally permissive for this MVP — see [[Risk-Register]] R1.
