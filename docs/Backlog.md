# Backlog — Malaika Honey FRM

Status legend: ✅ Done · 🔨 In progress · 📋 Planned (not started)

This backlog is a living document — update it as priorities shift. See [[Changelog]] for what's actually shipped and when.

## Milestone 1 — Field App MVP (current)

| # | Item | Status |
|---|---|---|
| 1.1 | Project scaffolding, GitHub repo, Firebase project wiring | ✅ |
| 1.2 | Brand assets (logo, favicon, colours) extracted into app | ✅ |
| 1.3 | Home screen: Existing Farmer / New Farmer / Buy Produce | ✅ |
| 1.4 | New Farmer registration form + FRN generation (works fully offline) | ✅ |
| 1.5 | Existing Farmer (search by name / FRN / phone) + Farmer Profile | ✅ |
| 1.6 | Buy Produce form with grading, weight, price, payment, receipt no. — standalone entry point, works fully offline including for FRNs not yet seen on the device | ✅ |
| 1.7 | Purchase history per farmer | ✅ |
| 1.8 | Printable farmer ID card (FRN + details) | ✅ |
| 1.9 | Offline-first behaviour (Firestore persistence) | ✅ |
| 1.10 | Local testing via Firebase emulator | ✅ |
| 1.11 | Deploy field app to Firebase Hosting | 📋 |

## Milestone 2 — Hardening for real field use

| # | Item | Notes |
|---|---|---|
| 2.1 | ~~Staff login (per staff member)~~ | ✅ Done — phone number + self-chosen password is the primary sign-in method (since not everyone has a Google account), with an admin-approved `allowedStaff` allowlist gating real access (see [[Database-Schema]] "Staff accounts" and [[Config-Management]] "Staff account provisioning"). Google Sign-In is still fully implemented but hidden behind `GOOGLE_SIGNIN_ENABLED` (`public/js/lib/constants.js`), restorable without a rewrite. Replaced an earlier username/password design that turned out to be fragile — accounts created in Firebase Console with real emails didn't match the app's synthetic-email login convention; the current design avoids that by making account creation self-service from within the app |
| 2.2 | ~~Firestore Security Rules locked down to authenticated staff only~~ | ✅ Done — every `farmers`/`purchases`/`devices` rule requires `request.auth != null` (see [[Risk-Register]] R1) |
| 2.3 | Multi-centre support (`centre` field already reserved in schema) | So HQ can see which buying centre recorded what |
| 2.4 | ~~Duplicate-farmer detection (same phone/name registered twice)~~ | ✅ Done in 0.2.0 — phone blocks, name warns via confirm dialog (application-level check, not a DB constraint — see [[Database-Schema]] and Risk R13) |
| 2.5 | Farmer photo capture on registration (device camera → Firebase Storage) | `photoUrl` field already reserved |
| 2.6 | Edit/void a purchase (with audit trail, not silent overwrite) | Needed for correcting mis-entered weights |
| 2.7 | App Check to stop unauthorized use of the Firebase project | See [[Risk-Register]] |
| 2.8 | Installable PWA polish (manifest, offline app shell caching, "Add to Home Screen" prompt) | |
| 2.9 | ~~Fully offline registration + purchase recording, including for FRNs not yet cached on the device~~ | ✅ Done — device-coded FRN minting removes the server-side counter/transaction dependency; unmatched purchases save with `frnUnverified` and are fixed via the `/reconcile` screen (see [[System-Architecture]] and [[Database-Schema]]) |
| 2.10 | ~~Visible sync status indicator~~ | ✅ Done — header badge shows Synced / Not Synced / Offline on every authenticated screen (`public/js/lib/sync.js`, `header.js`) |
| 2.11 | ~~First-run in-app tutorial~~ | ✅ Done — shown once per staff account after first sign-in (`public/js/screens/tutorial.js`), skippable |
| 2.12 | Role distinction between field staff and admin (all signed-in accounts currently have identical Firestore access) | Needed before the admin app (Milestone 3) shares the same accounts, and before any account should be restricted from e.g. deleting data |
| 2.13 | ~~In-app UI for managing the `allowedStaff` allowlist~~ | ✅ Done — an admin account (`allowedStaff.role == 'admin'`) sees an **Approve Requests** button on Home, listing pending `signupRequests` from staff who've signed in but aren't approved yet, with Approve/Reject actions (see [[Database-Schema]] "signupRequests/{email}" and [[Config-Management]] "Staff account provisioning"). Granting the *admin* role itself still requires a one-time Console edit, by design — it can never be done from within the app |
| 2.14 | ~~Products, grades, payment methods, farm sizes, districts, and the New Farmer form's field set become admin-editable~~ | ✅ Done — all six now read from Firestore collections (`products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, `newFarmerFields`) with offline-safe hardcoded fallbacks, editable today via Firebase Console (see [[Database-Schema]] "Admin-editable reference data" and [[Config-Management]] "Editing reference data") ahead of the admin app owning this UI |
| 2.15 | Surface `farmers/{frn}.customFields` (values for admin-added New Farmer fields) on Farmer Profile, Card, and History | Currently saved but not displayed anywhere — needed once an admin actually adds a field beyond the built-in set |
| 2.16 | In-app UI for managing reference data collections (2.14) and the New Farmer form schema | Currently a manual Firestore Console step (see [[Config-Management]]); natural fit for the admin app (Milestone 3) |
| 2.17 | Automatic country detection (IP/ISP-based) for `districts` filtering, if Malaika expands beyond Uganda | `public/js/lib/country.js` `getCountryCode()` is the single seam for this — currently a per-device hardcoded default (`'UG'`); can only ever be a best-effort *online* refinement given the offline-first requirement |
| 2.18 | In-app UI for revoking a staff member's access or changing their role | Currently Console-only, by design (see [[Database-Schema]] "Staff accounts") — worth reconsidering once there's a real need for an admin to act quickly without Console access |
| 2.19 | In-app "forgot password" flow for phone+password accounts | Currently Console-only (an admin resets it directly in Firebase Console's Authentication tab) — see [[Admin-User-Manual]] FAQ |

## Milestone 3 — Admin / Management App

| # | Item | Notes |
|---|---|---|
| 3.1 | Desktop-focused admin web app (separate deploy, same Firestore) | See [[System-Architecture]] |
| 3.2 | Reports dashboard: today's purchases, farmers registered, product totals, top suppliers | Mirrors the "Management Database" mock-up |
| 3.3 | Export to Excel/CSV | |
| 3.4 | Farmer record edit/merge/deactivate | |
| 3.5 | Bonus/incentive payments tied to FRN quality & quantity history | `incentives` collection (see [[Database-Schema]]) |

## Milestone 4 — M&E (Monitoring & Evaluation)

| # | Item | Notes |
|---|---|---|
| 4.1 | Income-improvement reporting per farmer/region over time | Derivable today from `purchases`, needs report UI |
| 4.2 | Honey yield & quality trend reporting | Derivable today from `purchases`, needs report UI |
| 4.3 | Hive location & health tracking over time | New `hiveVisits` collection with GPS capture |
| 4.4 | Training attendance & impact tracking | New `trainings` / `farmerTrainings` collections |
| 4.5 | NGO/development-partner report exports (PDF/Excel, anonymizable) | May need data-sharing/consent language added to the registration agreement |

## Explicitly out of scope for now

- Native iOS/Android apps (PWA is the deliberate choice — see [[System-Architecture]]).
- Payments/loans/equipment sales features shown as "future, hidden" in the UI reference doc — buttons should be easy to slot in later but are not being built now.
- SMS messaging integration.
- Coffee purchases (mentioned in the UI reference as a possible future product line outside honey/bee products).

## How to propose a new backlog item

Add a row under the relevant milestone with a one-line rationale. If it changes the data model, cross-reference [[Database-Schema]]. If it changes a workflow already documented, cross-reference [[Admin-User-Manual]].
