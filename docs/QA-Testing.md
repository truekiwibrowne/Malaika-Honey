# QA & Testing — Malaika Honey FRM

There is no automated test suite for v1 (a deliberate scope decision — see [[Backlog]]; revisit if the app grows past 3 screens). Quality is maintained through manual testing against the checklist below, run locally against the Firebase Emulator Suite before every release (see [[Release-Management]]).

## Test environment setup

```bash
./.tools/run-emulators.sh
# in a second terminal, serve the app (or use the Firebase Hosting emulator's own port)
npx serve public -l 5000
```
Open `http://localhost:5000`. The app auto-detects `localhost` and connects to the Firestore **and Auth** emulators instead of production (see `public/js/lib/firebase.js` and [[Config-Management]]) — so testing never touches real farmer data or real staff accounts. Create a throwaway test account first via the Auth emulator UI (`http://localhost:4000/auth`) or `accounts:signUp` — see [[Config-Management]] "Staff account provisioning."

## Golden-path checklist (run before every release)

### 0. Login and first-run tutorial
- [ ] Sign in with a valid test username/password and confirm it lands on Home.
- [ ] Sign in with a wrong password and confirm a clear "Incorrect username or password" message (not a raw error).
- [ ] For an account that hasn't seen the tutorial yet, confirm sign-in routes to the 4-slide tutorial instead of straight to Home, and that **Skip** and **Get Started** (final slide) both land on Home and mark the tutorial seen (won't show again for that account on that device).
- [ ] Confirm reloading the app while already signed in goes straight to Home (no login flash, no repeated tutorial).
- [ ] Sign out (icon in the header on any non-Home screen) and confirm it returns to Login and blocks access to other routes until signed back in.

### 1. New Farmer registration
- [ ] From Home, tap **New Farmer**.
- [ ] Leave a required field blank (e.g. Full Name) and confirm Save is blocked with a clear message.
- [ ] Fill in all fields with valid sample data and tap **Save Farmer**.
- [ ] Confirm the success screen shows a newly generated FRN (device-coded format, e.g. `MHA1000042`), and that its sequence portion is one greater than the previous FRN issued from this device in this test run.
- [ ] From the success screen, confirm all three shortcut actions are present and work: **Buy Produce**, **Farmer Card**, **Done**.
- [ ] Reopen the app (or **Existing Farmer**) and confirm the new farmer is retrievable by name, FRN, and phone number.

### 2. Existing Farmer
- [ ] From Home, tap **Existing Farmer**.
- [ ] Search a partial name (e.g. "John") and confirm multiple matching results appear.
- [ ] Search an exact FRN (test both an old `MH######` one and a new device-coded one) and confirm exactly one result appears for each.
- [ ] Search a phone number and confirm the matching farmer appears.
- [ ] Search something with no matches and confirm a clear "no results" state (not a blank screen or spinner forever).
- [ ] Tap a result and confirm the Farmer Profile loads with correct name, FRN, village, phone, lifetime honey total, last delivery date, and total paid.

### 3. Buy Produce — from a Farmer Profile
- [ ] From a Farmer Profile, tap **Buy Produce**.
- [ ] Confirm the farmer's name is shown on the purchase screen.
- [ ] Select each product option (Honey, Bee Wax, Pollen, Propolis, Bee Venom) and confirm the form accepts the selection.
- [ ] Enter weight and price/kg and confirm the total updates automatically and correctly (`weight × price`).
- [ ] Select each grade (A/B/C) and each payment method (Cash/Mobile Money/Bank) and confirm all combinations save without error.
- [ ] Leave receipt number blank and confirm expected behavior (allowed or blocked — confirm current intended rule in the code/comments before assuming a bug).
- [ ] Tap **Save** and confirm the "Purchase Saved" confirmation appears with the three next-action shortcuts: **Record another purchase**, **Find another farmer**, **Return Home**.
- [ ] Confirm the purchase now appears at the top of that farmer's **History** screen with correct date, product, weight, and total.
- [ ] Confirm the Farmer Profile's lifetime totals (honey kg, total paid, last delivery) updated correctly after the purchase.

### 4. Buy Produce — standalone entry from Home
- [ ] From Home, tap **Buy Produce** directly (no farmer selected first).
- [ ] While online, type a known farmer's name/FRN/phone, confirm the live search picker appears, and confirm selecting a result opens the purchase form with their name shown.
- [ ] Type an FRN that exists but isn't cached on this device/browser session yet, tap **Continue with this FRN**, and confirm the purchase form still opens with an "not found on this device — will be checked once online" notice rather than a hard error.
- [ ] Complete and save that purchase, then confirm it shows up in **Fix Unverified Purchases** (see below) rather than being silently lost.

### 5. Farmer ID card (PDF)
- [ ] From a Farmer Profile, open the Farmer Card view.
- [ ] Confirm the on-screen preview shows FRN, name, village/district, and phone correctly.
- [ ] Tap **Download PDF** and confirm a `<FRN>-malaika-honey-card.pdf` file downloads (CR80 card-sized, landscape) with the same details legible on a maroon background.
- [ ] Confirm it works without a printer connected (this is a client-side PDF generation, not a print-dialog flow).

### 6. Offline behavior (critical — test on every release that touches data writes)
- [ ] Sign in once while online, then load the app once more while online (so the shell is cached).
- [ ] Enable airplane mode / disconnect network and confirm the header badge shows **Offline**.
- [ ] Confirm the app does **not** bounce to the login screen while offline (session persists locally).
- [ ] Register a new farmer while offline — confirm it still shows a success screen with an FRN (device-coded, minted with no server round-trip).
- [ ] Record a purchase for that offline-created farmer while still offline — confirm it saves locally and the header badge reflects pending work correctly once back online.
- [ ] From Home while still offline, use **Buy Produce** to record a purchase against an FRN never seen on this device — confirm it saves with the "not found on this device" notice instead of blocking.
- [ ] Re-enable network connectivity and confirm the badge moves from Not Synced to **Synced**.
- [ ] Confirm the farmer, the matched purchase, and the unverified purchase all appear in the Firestore emulator/console shortly after reconnecting, with no duplicate FRNs and no errors in the browser console.

### 7. Reconciling unverified purchases
- [ ] From Home, after at least one unverified purchase exists (see above), confirm the "N purchases need a farmer match" banner appears with the correct count.
- [ ] Tap it to open **Fix Unverified Purchases** and confirm each entry shows the typed FRN, product/weight, and date/total correctly.
- [ ] Search for and select the correct farmer for one entry — confirm it disappears from the list and that farmer's lifetime stats update to include it.
- [ ] Confirm the Home banner's count decreases (or the banner disappears entirely once none remain).

### 8. Header and sync badge, every screen
- [ ] Confirm Home shows the full logo + sync badge, with no back/home/sign-out icons.
- [ ] Confirm every other authenticated screen shows back/home/sign-out icons + the sync badge, with **no** logo.
- [ ] Confirm the back icon returns to a sensible previous screen (not always Home) — e.g. from Farmer Card it should return to that farmer's Profile, from History likewise.
- [ ] Confirm Login shows only the bare logo (no sync badge, no icons).

### 9. Device/browser checks
- [ ] Test on an actual Android phone (or Chrome DevTools device emulation at minimum) at a small screen size (~360×640) — confirm each screen fits without scrolling per the design rules in [[System-Architecture]].
- [ ] Confirm buttons are large enough to tap accurately one-handed.
- [ ] Confirm text is legible at default phone zoom without squinting.

## Regression watch-list

Keep an eye on these known-tricky areas whenever touching related code:
- Device-coded FRN minting staying collision-free across devices, and old/new FRN formats both continuing to resolve correctly — see [[Database-Schema]] and Risk R3 in [[Risk-Register]].
- Lifetime stats denormalization on the farmer document staying in sync with the `purchases` collection, including the **deferred** update path for reconciled purchases.
- Any code that awaits a Firestore write directly instead of firing it via `trackWrite()` — this will hang indefinitely offline (see [[System-Architecture]] "Offline behavior in detail").
- Any code that uses `getDoc` where an offline-safe `getDocFromCache` lookup is required (Buy Produce farmer lookups in particular).
- Currency/number formatting (`UGX`, no decimals) staying consistent across Buy Produce, Profile, and History screens.

## Bug reporting

Log bugs found during testing directly as new rows in [[Backlog]] under the relevant milestone, or as GitHub Issues in the repository, whichever the team is actively using — pick one and be consistent so nothing is tracked in two places.
