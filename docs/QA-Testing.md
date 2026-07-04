# QA & Testing — Malaika Honey FRM

There is no automated test suite for v1 (a deliberate scope decision — see [[Backlog]]; revisit if the app grows past 3 screens). Quality is maintained through manual testing against the checklist below, run locally against the Firebase Emulator Suite before every release (see [[Release-Management]]).

## Test environment setup

```bash
firebase emulators:start --only firestore
# in a second terminal, serve the app
npx serve public -l 5000
```
Open `http://localhost:5000`. The app auto-detects `localhost` and connects to the Firestore emulator instead of production (see `public/js/lib/firebase.js` and [[Config-Management]]) — so testing never touches real farmer data.

## Golden-path checklist (run before every release)

### 1. New Farmer registration
- [ ] From Home, tap **New Farmer**.
- [ ] Leave a required field blank (e.g. Full Name) and confirm Save is blocked with a clear message.
- [ ] Fill in all fields with valid sample data and tap **Save Farmer**.
- [ ] Confirm the success screen shows a newly generated FRN in the `MH######` format, and that it is one greater than the previous FRN issued in this test run.
- [ ] From the success screen, confirm all three shortcut actions are present and work: **Buy Produce**, **Print Farmer Card**, **Done**.
- [ ] Reopen the app (or Find Farmer) and confirm the new farmer is retrievable by name, FRN, and phone number.

### 2. Find Farmer
- [ ] From Home, tap **Find Farmer**.
- [ ] Search a partial name (e.g. "John") and confirm multiple matching results appear.
- [ ] Search an exact FRN and confirm exactly one result appears.
- [ ] Search a phone number and confirm the matching farmer appears.
- [ ] Search something with no matches and confirm a clear "no results" state (not a blank screen or spinner forever).
- [ ] Tap a result and confirm the Farmer Profile loads with correct name, FRN, village, phone, lifetime honey total, last delivery date, and total paid.

### 3. Buy Produce
- [ ] From a Farmer Profile, tap **Buy Produce**.
- [ ] Confirm the farmer's name is shown on the purchase screen.
- [ ] Select each product option (Honey, Bee Wax, Pollen, Propolis, Bee Venom) and confirm the form accepts the selection.
- [ ] Enter weight and price/kg and confirm the total updates automatically and correctly (`weight × price`).
- [ ] Select each grade (A/B/C) and each payment method (Cash/Mobile Money/Bank) and confirm all combinations save without error.
- [ ] Leave receipt number blank and confirm expected behavior (allowed or blocked — confirm current intended rule in the code/comments before assuming a bug).
- [ ] Tap **Save** and confirm the "Purchase Saved" confirmation appears with the three next-action shortcuts: **Record another purchase**, **Find another farmer**, **Return Home**.
- [ ] Confirm the purchase now appears at the top of that farmer's **History** screen with correct date, product, weight, and total.
- [ ] Confirm the Farmer Profile's lifetime totals (honey kg, total paid, last delivery) updated correctly after the purchase.

### 4. Printable ID card
- [ ] From a Farmer Profile, open the printable card view.
- [ ] Confirm FRN, name, village/district, and phone are legible and correctly populated.
- [ ] Confirm the card renders sensibly when sent to Print (browser print preview) — no cut-off content.

### 5. Offline behavior (critical — test on every release that touches data writes)
- [ ] Load the app once while online (so the shell is cached).
- [ ] Enable airplane mode / disconnect network.
- [ ] Register a new farmer while offline — confirm it still shows a success screen with an FRN (issued from local cache).
- [ ] Record a purchase for that offline-created farmer while still offline — confirm it saves locally.
- [ ] Re-enable network connectivity.
- [ ] Confirm both the farmer and the purchase appear in the Firestore emulator/console shortly after reconnecting, with no duplicate FRNs and no errors in the browser console.

### 6. Device/browser checks
- [ ] Test on an actual Android phone (or Chrome DevTools device emulation at minimum) at a small screen size (~360×640) — confirm each screen fits without scrolling per the design rules in [[System-Architecture]].
- [ ] Confirm buttons are large enough to tap accurately one-handed.
- [ ] Confirm text is legible at default phone zoom without squinting.

## Regression watch-list

Keep an eye on these known-tricky areas whenever touching related code:
- FRN counter transaction (concurrency/offline correctness) — see [[Database-Schema]] and Risk R3 in [[Risk-Register]].
- Lifetime stats denormalization on the farmer document staying in sync with the `purchases` collection.
- Currency/number formatting (`UGX`, no decimals) staying consistent across Buy Produce, Profile, and History screens.

## Bug reporting

Log bugs found during testing directly as new rows in [[Backlog]] under the relevant milestone, or as GitHub Issues in the repository, whichever the team is actively using — pick one and be consistent so nothing is tracked in two places.
