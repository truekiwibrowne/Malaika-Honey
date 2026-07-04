# Changelog — Malaika Honey FRM

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows semantic versioning (see [[Release-Management]]).

## [Unreleased]

Nothing yet.

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
