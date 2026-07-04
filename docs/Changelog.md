# Changelog — Malaika Honey FRM

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows semantic versioning (see [[Release-Management]]).

## [Unreleased]

Nothing yet.

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
