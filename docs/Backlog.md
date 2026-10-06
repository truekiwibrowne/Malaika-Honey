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
| 2.1 | ~~Staff login (one login per field office)~~ | ✅ Done — one shared code per field office, admin-provisioned (not self-service), is the primary sign-in method as of v0.6.3, chosen for simplicity given staff literacy constraints (see [[Database-Schema]] "Staff accounts" and [[Config-Management]] "Field office provisioning"). An admin-approved `allowedStaff` allowlist still gates real access. Phone+password and Google Sign-In (the two prior methods) are both still fully implemented but hidden behind `PHONE_SIGNIN_ENABLED`/`GOOGLE_SIGNIN_ENABLED` (`public/js/lib/constants.js`), restorable without a rewrite |
| 2.2 | ~~Firestore Security Rules locked down to authenticated staff only~~ | ✅ Done — every `farmers`/`purchases`/`devices` rule requires `request.auth != null` (see [[Risk-Register]] R1) |
| 2.3 | Multi-centre support (`centre` field already reserved in schema) | So HQ can see which buying centre recorded what |
| 2.4 | ~~Duplicate-farmer detection (same phone/name registered twice)~~ | ✅ Done in 0.2.0 — phone blocks, name warns via confirm dialog (application-level check, not a DB constraint — see [[Database-Schema]] and Risk R13) |
| 2.5 | Farmer photo capture on registration (device camera → Firebase Storage) | `photoUrl` field already reserved |
| 2.6 | Edit/void a purchase (with audit trail, not silent overwrite) | Needed for correcting mis-entered weights |
| 2.7 | App Check to stop unauthorized use of the Firebase project | See [[Risk-Register]] |
| 2.8 | ~~Installable PWA polish (manifest, offline app shell caching, iOS fullscreen)~~ | ✅ Mostly done — `public/sw.js` precaches the app shell for offline use (v0.5.2), and iOS's `apple-mobile-web-app-*` meta tags + safe-area CSS fix the status-bar seam on a Home Screen install (v0.5.4, refined in v0.6.3). Still open: an explicit "Add to Home Screen" install prompt |
| 2.9 | ~~Fully offline registration + purchase recording, including for FRNs not yet cached on the device~~ | ✅ Done — device-coded FRN minting removes the server-side counter/transaction dependency; unmatched purchases save with `frnUnverified` and are fixed via the `/reconcile` screen (see [[System-Architecture]] and [[Database-Schema]]) |
| 2.10 | ~~Visible sync status indicator~~ | ✅ Done — header badge shows Synced / Not Synced / Offline on every authenticated screen (`public/js/lib/sync.js`, `header.js`) |
| 2.11 | ~~First-run in-app tutorial~~ | ✅ Done — shown once per staff account after first sign-in (`public/js/screens/tutorial.js`), skippable |
| 2.12 | Role distinction between field staff and admin (all signed-in accounts currently have identical Firestore access) | Needed before the admin app (Milestone 3) shares the same accounts, and before any account should be restricted from e.g. deleting data |
| 2.13 | ~~In-app UI for managing the `allowedStaff` allowlist~~ | ✅ Done — an admin account (`allowedStaff.role == 'admin'`) sees an **Approve Requests** button on Home, listing pending `signupRequests` from staff who've signed in but aren't approved yet, with Approve/Reject actions (see [[Database-Schema]] "signupRequests/{email}" and [[Config-Management]] "Staff account provisioning"). Granting the *admin* role itself still requires a one-time Console edit, by design — it can never be done from within the app |
| 2.14 | ~~Products, grades, payment methods, farm sizes, districts, and the New Farmer form's field set become admin-editable~~ | ✅ Done — all six now read from Firestore collections (`products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, `newFarmerFields`) with offline-safe hardcoded fallbacks, editable today via Firebase Console (see [[Database-Schema]] "Admin-editable reference data" and [[Config-Management]] "Editing reference data") ahead of the admin app owning this UI |
| 2.15 | Surface `farmers/{frn}.customFields` (✅ in the management app since v0.11.0; field-app Profile/Card still to do) (values for admin-added New Farmer fields) on Farmer Profile, Card, and History | Currently saved but not displayed anywhere — needed once an admin actually adds a field beyond the built-in set |
| 2.16 | ~~In-app UI for managing reference data collections (2.14) and the New Farmer form schema~~ | ✅ Done in v0.10.0 — management app **Settings** edits every collection, field offices (rename/reorder/hide) and the form's questions. Original notes: | `fieldOffices` now has one — admins can **Add Office** from within the app (v0.6.5, see [[Config-Management]] "Field office provisioning") — but adding/editing `products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, `newFarmerFields`, and editing/deactivating existing offices, are all still manual Firestore Console steps; natural fit for the admin app (Milestone 3) |
| 2.17 | Automatic country detection (IP/ISP-based) for `districts` filtering, if Malaika expands beyond Uganda | `public/js/lib/country.js` `getCountryCode()` is the single seam for this — currently a per-device hardcoded default (`'UG'`); can only ever be a best-effort *online* refinement given the offline-first requirement |
| 2.18 | ~~In-app UI for revoking a staff member's access or changing their role~~ | ✅ Done in v0.10.0 — Settings → Staff access (never on your own account). Original notes: | Currently Console-only, by design (see [[Database-Schema]] "Staff accounts") — worth reconsidering once there's a real need for an admin to act quickly without Console access |
| 2.19 | In-app "forgot password" flow for phone+password accounts | Currently Console-only (an admin resets it directly in Firebase Console's Authentication tab) — see [[Admin-User-Manual]] FAQ |

## Milestone 3 — Admin / Management App

| # | Item | Notes |
|---|---|---|
| 3.1 | ~~Desktop-focused admin web app (separate deploy, same Firestore)~~ | ✅ Done in v0.9.0 — `admin/`, hosted on Netlify, individual email+password admin accounts (see [[System-Architecture]] "Two applications, one database") |
| 3.2 | ~~Reports dashboard: today's purchases, farmers registered, product totals, top suppliers~~ | ✅ Done in v0.9.0 — plus 7-day/month windows and an unmatched-purchase prompt |
| 3.3 | ~~Export to Excel/CSV~~ | ✅ Done in v0.10.0 — plus bulk **import** that never overwrites. Original notes: The four printable documents shipped in v0.9.0 cover *printing*; a spreadsheet export for M&E analysis is a different need |
| 3.4 | ~~Farmer record merge/deactivate~~ | ✅ Done in v0.10.0 (Farmer → Merge… / Deactivate; duplicate finder on Data checks). Original notes: | **Edit** itself shipped in the field app in v0.8.0 (Farmer Profile → **Edit Details**), writing an append-only `farmerEdits` audit trail. Reading the edit history back also shipped in v0.9.0 (Farmer detail → Edit history, in the management app). Still missing: **merging** duplicate farmer records and **deactivating** a record |
| 3.5 | Bonus/incentive payments tied to FRN quality & quantity history | `incentives` collection (see [[Database-Schema]]) |
| 3.6 | **Photos** — purchase evidence (produce, weight reading, receipt) and farmer/farm/hive photos | **Blocked on upgrading Firebase to the Blaze plan**: Cloud Storage isn't available on Spark. Needs `storage.rules`, a bucket layout, and client-side image compression before upload — field phones on poor connections must not upload 5 MB originals. Requested by the owner alongside v0.9.0 |
| 3.7 | ~~Farm GPS~~ ✅ v0.11.0 (farm location question + map picker in both apps); **hive** GPS still open - — an explicit "pin this location" step, separate from the automatic staff-location capture shipped in v0.9.0 | Builds on `public/js/lib/location.js`; relates to 4.3's `hiveVisits` collection |
| 3.8 | ~~Periodic reconciliation report recomputing `lifetimeStats` from `purchases` to detect drift~~ | ✅ Done in v0.10.0 — Data checks, with one-click correction. Original notes: | Would make [[Risk-Register]] R38 detectable rather than silent; cheap to add once exports (3.3) exist |
| 3.9 | Choropleth/region reports filtered by product, and printable map | Natural follow-up to the v0.10.0 Regions screen if partners ask for it |

## Milestone 4 — M&E (Monitoring & Evaluation)

| # | Item | Notes |
|---|---|---|
| 4.1 | Income-improvement reporting per farmer/region over time | 🔨 v0.10.0 adds per-region and per-district totals for any period (Regions & map) and trend charts; a per-farmer year-on-year income view is still to do |
| 4.2 | Honey yield & quality trend reporting | 🔨 v0.10.0 dashboard charts weight by product, price per kg and grade mix over time; yield per hive (needs hive counts over time, 4.3) still to do |
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
