# QA & Testing — Malaika Honey FRM

There is no automated test suite for v1 (a deliberate scope decision — see [[Backlog]]; revisit if the app grows past 3 screens). Quality is maintained through manual testing against the checklist below, run locally against the Firebase Emulator Suite before every release (see [[Release-Management]]).

## Test environment setup

```bash
./.tools/run-emulators.sh
# in a second terminal, serve the app (or use the Firebase Hosting emulator's own port)
npx serve public -l 5000
```
Open `http://localhost:5000`. The app auto-detects `localhost` and connects to the Firestore **and Auth** emulators instead of production (see `public/js/lib/firebase.js` and [[Config-Management]]) — so testing never touches real farmer data or real staff accounts. Tapping **Sign in with Google** against the Auth emulator shows a fake account-picker form (no real Google account needed) — after signing in, add that email to the Firestore emulator's `allowedStaff` collection to grant test access (Emulator UI's Firestore tab, or the Admin SDK) — see [[Config-Management]] "Staff account provisioning."

## Golden-path checklist (run before every release)

### 0. Login, authorization, and first-run tutorial
- [ ] Sign in with a Google account **not** on the `allowedStaff` allowlist and confirm it lands on "Approval Needed" (showing that account's email), not Home or any farmer data screen.
- [ ] From "Approval Needed", try navigating directly to `#/home` (or any other route) via the address bar/hash and confirm it bounces back to `#/not-authorized` rather than granting access.
- [ ] Add that email to `allowedStaff` (Firestore Console or emulator), tap **Check Again**, and confirm it now lands on Home (or the tutorial, if this account hasn't seen it — see below).
- [ ] Sign in with a Google account already on the allowlist and confirm it lands on Home (or Tutorial) directly, with no approval-needed detour.
- [ ] For an account that hasn't seen the tutorial yet, confirm sign-in routes to the 4-slide tutorial instead of straight to Home, and that **Skip** and **Get Started** (final slide) both land on Home and mark the tutorial seen (won't show again for that account on that device).
- [ ] Confirm reloading the app while already signed in and approved goes straight to Home (no login flash, no repeated tutorial, no repeated approval check hitting the network).
- [ ] Confirm reloading the app **offline** while already signed in and previously approved still reaches Home (authorization must be cached locally, not re-checked live every load).
- [ ] Sign out (**Sign Out** button at the bottom of Home) and confirm it returns to Login and blocks access to other routes until signed back in.

### 0b. Admin approvals
- [ ] Sign in with a non-admin `allowedStaff` account and confirm **no** "Approve Requests" button appears on Home.
- [ ] Add `role: 'admin'` to that account's `allowedStaff` document (Console or emulator), reload, and confirm the button now appears — with a `(N)` count matching the number of `pending` `signupRequests`.
- [ ] Sign in with a brand-new Google account (not on the allowlist) to generate a `signupRequests` entry, then as the admin, open **Approve Requests** and confirm that request appears with the correct name/email/date.
- [ ] Tap **Approve** and confirm: the request disappears from the list, an `allowedStaff` document now exists for that email, and the `signupRequests` document is updated to `status: 'approved'` with `resolvedAt`/`resolvedBy` set.
- [ ] Confirm the newly-approved account can now sign in and reach Home directly (no more "Approval Needed").
- [ ] Generate a second `signupRequests` entry and tap **Reject** — confirm it disappears from the list, **no** `allowedStaff` document is created, and the request is updated to `status: 'rejected'`.
- [ ] Confirm that rejected account signing in again generates a **fresh pending request** (rejection isn't permanent) rather than being silently blocked with no path forward.
- [ ] As a non-admin approved account, confirm direct navigation to `#/admin/approvals` does not expose other staff's pending requests (Firestore rules should deny the `list` read — the screen should show an error/empty state, not real data).

### 1. New Farmer registration
- [ ] From Home, tap **New Farmer**.
- [ ] Leave a required field blank (e.g. Full Name) and confirm Save is blocked with a clear message.
- [ ] Fill in all fields with valid sample data and tap **Save Farmer**.
- [ ] Confirm the success screen shows a newly generated FRN (device-coded format, e.g. `MHA1000042`), and that its sequence portion is one greater than the previous FRN issued from this device in this test run.
- [ ] From the success screen, confirm all three shortcut actions are present and work: **Buy Produce**, **Farmer Card**, **Done**.
- [ ] Reopen the app (or **Existing Farmer**) and confirm the new farmer is retrievable by name, FRN, and phone number.
- [ ] Select "Other" on District, leave the free-text field blank, and confirm Save is still blocked (the generic "Other" handling must resolve before required-validation, not after).
- [ ] Select "Other" on District, fill in the free-text field, and confirm the typed value (not the literal word "Other") is what's saved on the farmer record.

### 1b. Admin-editable reference data (products, grades, payment methods, farm sizes, districts, New Farmer fields)
- [ ] Against the **local emulator only**, add a 4th `grades` document (e.g. `D`) alongside existing seeded `A`/`B`/`C` — reload Buy Produce and confirm all four appear.
- [ ] Add a `newFarmerFields` document deactivating an existing field (`active: false`) and confirm it disappears from New Farmer without affecting any already-registered farmer's data.
- [ ] Add a brand-new `newFarmerFields` document (a field id with no existing top-level farmer slot) and confirm it renders on the form, saves under `customFields` on the new farmer record, and doesn't break farmers registered before that field existed.
- [ ] Confirm New Farmer and Buy Produce still render with today's exact defaults when a reference collection is completely empty (the fallback path) — this is the state a fresh production deploy starts in.
- [ ] Confirm the New Farmer form still works fully offline (`disableNetwork`) once its reference collections have been fetched at least once (served from Firestore's local cache, no fallback needed).

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
- [ ] Confirm Home shows the full logo + sync badge, with no back/home icons and no header sign-out icon (Sign Out lives only as a button at the bottom of Home).
- [ ] Confirm every other authenticated screen shows back/home icons + the sync badge, with **no** logo and no sign-out control at all.
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
- Any edit to a reference-data collection (`products`, `grades`, `paymentMethods`, `farmSizes`, `districts`, `newFarmerFields`) — test against the emulator first; these collections are all-or-nothing per collection once non-empty (see [[Risk-Register]] R20), and a bad `newFarmerFields` edit can break the whole New Farmer form (R19).

## Bug reporting

Log bugs found during testing directly as new rows in [[Backlog]] under the relevant milestone, or as GitHub Issues in the repository, whichever the team is actively using — pick one and be consistent so nothing is tracked in two places.
