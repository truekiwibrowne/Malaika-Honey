# Changelog — Malaika Honey FRM

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows semantic versioning (see [[Release-Management]]).

## [Unreleased]

Nothing yet.

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
