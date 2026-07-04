# Backlog — Malaika Honey FRM

Status legend: ✅ Done · 🔨 In progress · 📋 Planned (not started)

This backlog is a living document — update it as priorities shift. See [[Changelog]] for what's actually shipped and when.

## Milestone 1 — Field App MVP (current)

| # | Item | Status |
|---|---|---|
| 1.1 | Project scaffolding, GitHub repo, Firebase project wiring | ✅ |
| 1.2 | Brand assets (logo, favicon, colours) extracted into app | ✅ |
| 1.3 | Home screen: Find Farmer / New Farmer / Buy Produce | ✅ |
| 1.4 | New Farmer registration form + FRN generation | ✅ |
| 1.5 | Find Farmer (search by name / FRN / phone) + Farmer Profile | ✅ |
| 1.6 | Buy Produce form with grading, weight, price, payment, receipt no. | ✅ |
| 1.7 | Purchase history per farmer | ✅ |
| 1.8 | Printable farmer ID card (FRN + details) | ✅ |
| 1.9 | Offline-first behaviour (Firestore persistence) | ✅ |
| 1.10 | Local testing via Firebase emulator | ✅ |
| 1.11 | Deploy field app to Firebase Hosting / Netlify | 📋 |

## Milestone 2 — Hardening for real field use

| # | Item | Notes |
|---|---|---|
| 2.1 | Staff login (Firebase Auth, phone or PIN-based — no passwords to type on cheap phones) | Needed before multiple staff/centres share one deployment with accountability |
| 2.2 | Firestore Security Rules locked down to authenticated staff only | Currently open rules for MVP speed — see [[Risk-Register]] |
| 2.3 | Multi-centre support (`centre` field already reserved in schema) | So HQ can see which buying centre recorded what |
| 2.4 | Duplicate-farmer detection (same phone/name registered twice) | Common with paper-to-digital transitions |
| 2.5 | Farmer photo capture on registration (device camera → Firebase Storage) | `photoUrl` field already reserved |
| 2.6 | Edit/void a purchase (with audit trail, not silent overwrite) | Needed for correcting mis-entered weights |
| 2.7 | App Check to stop unauthorized use of the Firebase project | See [[Risk-Register]] |
| 2.8 | Installable PWA polish (manifest, offline app shell caching, "Add to Home Screen" prompt) | |

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
