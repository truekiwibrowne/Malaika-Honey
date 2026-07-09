# User Manual — Malaika Honey Farmer App

This guide is for buying-centre staff using the Malaika Honey app on a phone. It should take under 15 minutes to learn.

## Getting started

1. Open the app link in your phone's browser (Chrome recommended).
2. **Create an account with your phone number and a password** (see "Logging in" below). The first time you sign in, you'll see a short tutorial — you can skip it any time.
3. On the Home screen you'll see three big buttons: **Existing Farmer**, **New Farmer**, **Buy Produce**.
4. The app works even with a weak or no signal. If you have no signal, keep using the app normally — it will send your work to the office database automatically once your phone reconnects to the internet. Try to reconnect to the internet (Wi-Fi or data) at least once before the end of your day so your work reaches the office. Watch the badge at the top of the screen (see "What the sync badge means" below) to know whether your work has actually reached the office yet.

## Logging in

The app requires you to sign in with your own phone number and a password before you can use it, so the office can tell who registered which farmer or recorded which purchase.

1. **The very first time**, tap **Create Account**, enter your full name, your phone number, and a password you choose — then remember that password, since you'll need it every time you sign in again on a new phone.
2. **After that**, tap **Sign In** and enter the same phone number and password.
3. **The first time you sign in**, you'll land on an "Approval Needed" screen showing your phone number — this is expected. Tell your admin that phone number so they can approve it (see [[Config-Management]] "Staff account provisioning"). Once approved, tap **Check Again** on that screen (or just reopen the app).
4. **You must sign in at least once while you have internet.** After that first successful sign-in, you can keep using the app fully offline — you won't be asked to sign in again on that phone unless you deliberately sign out.
5. To sign out, go to Home and tap **Sign Out** at the bottom. If you have unsynced work, the app will warn you before signing out, since a queued purchase or registration may not reach the office if you sign out before it finishes syncing — wait for the badge to show **Synced** first if you can. Signing out fully ends your session, so a different staff member can then sign in with their own phone number and password on the same shared device.

## Approving new staff (admins only)

If your account has been made an admin, you'll see an **Approve Requests** button on Home — a number in brackets shows how many staff sign-ins are waiting for a decision.

1. Tap **Approve Requests**.
2. Each pending request shows the person's name, phone number, and when they first tried to sign in.
3. Tap **Approve** to let them into the app, or **Reject** to turn them away (they can still try signing in again later — rejecting isn't permanent).
4. Once you act, tell them to reopen the app (or tap **Check Again** if they still have it open on their "Approval Needed" screen).

Only an existing admin can make someone else an admin, and that step still has to be done directly in Firebase Console (see [[Config-Management]] "Staff account provisioning") — this is deliberate, so admin access can never be granted from inside the app itself.

## What the sync badge means

Every screen except the login screen shows a small badge in the top-right corner:

- **● Synced** (green) — everything you've entered has reached the office database. Safe to sign out or move on.
- **● Not Synced** (yellow) — you're online, but something you just entered is still uploading. Give it a moment.
- **● Offline** (grey) — your phone has no internet connection right now. Keep working normally; everything you enter is saved on your phone and will upload automatically the moment you reconnect.

## Registering a new farmer

Use this the first time a farmer brings honey or wants to join Malaika Honey.

1. From Home, tap **New Farmer**.
2. Fill in the farmer's details:
   - Full Name, Date of Birth, Gender, Phone Number
   - Village and District
   - Farm size, number of hives (Traditional / KTB / Modern)
   - Average honey harvest per year, whether they use chemicals, whether they want training
3. Tap **Save Farmer**.
   - If the phone number is already registered to someone else, the app will **refuse to save** and show you who it belongs to (name and FRN) — each phone number can only be registered once. Use **Existing Farmer** instead if this is the same person.
   - If the name is already registered (but the phone number is new), the app will ask you to confirm before continuing — this is expected when two different farmers share a name, so you can choose to proceed or go back and double-check.
4. The app will show a new **FRN (Farmer Reference Number)** — something like `MH004826` or `MHA1000042` (newer registrations use a slightly longer code; both kinds work exactly the same). This number belongs to this farmer forever. Write it on their paper file if you keep one, and let them know their number.
5. From this confirmation screen you can immediately:
   - Tap **Buy Produce** if they've brought honey today, or
   - Tap **Done** to return home.
6. Download or write the FRN on a card for the farmer to bring next time — see "Farmer ID cards" below.

**This works fully offline too** — with no signal at all, you can still register a new farmer. It saves on your phone immediately and uploads automatically once you're back online.

**Tip:** if a farmer already has an FRN from a previous visit, don't register them again — use **Existing Farmer** instead. The app blocks re-registering the same phone number for exactly this reason.

## Existing Farmer

Use this every time a returning farmer arrives, before recording a purchase.

1. From Home, tap **Existing Farmer**.
2. Type part of their name, their FRN, or their phone number.
3. Tap their name in the results list.
4. Their profile opens, showing their village, phone, lifetime honey delivered, date of their last delivery, and total paid to date.
5. From here, tap **Buy Produce** to record today's delivery, or **History** to see their past deliveries. Correcting a farmer's details isn't available in this app yet — that's handled by admin staff in the management app (see [[Backlog]]).

**If a farmer presents their card:** check the name and details on it match what comes up when you search their FRN, before processing their purchase.

**This needs internet.** Searching for a farmer only works while online — it looks up records that may not be saved on your phone yet. If you're offline and need to record a purchase for a farmer who isn't already on your phone from a previous visit, use **Buy Produce** directly from Home instead (see below).

## Recording a purchase (Buy Produce)

**Buy Produce** works two ways: from a farmer's profile (once you've confirmed who they are via Existing Farmer), or directly from the Home screen — which is the one that works without internet.

### From a farmer's profile

This should take no more than a few taps once you've found the farmer.

1. From the farmer's profile, tap **Buy Produce** (or tap it directly from the New Farmer success screen for a first-time delivery).
2. Choose the **Product**: Honey, Bee Wax, Pollen, Propolis, or Bee Venom.
3. Enter the **Weight** (kg).
4. Choose the **Grade** based on your quality check: A, B, or C.
5. Enter the **Price per kg** for that grade (check today's rate sheet if unsure).
6. The **Total** calculates automatically — double check it looks right before saving.
7. Choose the **Payment method**: Cash, Mobile Money, or Bank.
8. Enter the **Receipt number** from your paper receipt book (so the paper and digital records match).
9. Tap **Save**.
10. You'll see **"Purchase Saved"** with three quick options:
    - **Record another purchase** — if this farmer brought more than one product
    - **Find another farmer** — move straight to the next farmer in line
    - **Return Home**

This flow is designed so you never have to go back to the Home screen between farmers during a busy day.

### Directly from Home (works offline)

Tap **Buy Produce** on the Home screen when you don't need — or can't get — a confirmed farmer profile first:

1. Type the farmer's FRN, name, or phone. **While online**, this searches and shows a picker just like Existing Farmer.
2. **While offline**, no search results will appear (there's no signal to search with) — just type the FRN exactly and tap **Continue with this FRN**. If you got the FRN wrong or the farmer genuinely isn't recognized on your phone yet, don't worry: the app still lets you record the purchase, with a clear note that it "wasn't found on this device — will be checked once online." It saves normally and is fixed up automatically once the office reviews it (see "Fixing an unrecognized purchase" below) — you don't need to do anything extra at the time.
3. Fill in the purchase details and **Save** exactly as above.

## Fixing an unrecognized purchase

If you (or a colleague) recorded a purchase against an FRN the phone didn't recognize at the time — usually because it was typed while offline for a farmer never seen on that phone before — it doesn't get lost or blocked. Once the phone is back online:

1. A banner appears on the Home screen: **"N purchases need a farmer match — tap to fix."**
2. Tap it to open the fix-up screen. Each unmatched purchase shows what was typed and the purchase details (product, weight, total, date).
3. Search for the correct farmer by name or FRN and tap them in the results — this links the purchase to that farmer and updates their lifetime totals.
4. If no match comes up, the farmer probably isn't registered yet — register them first (**New Farmer**), then come back to this screen and search again.

This screen only ever shows purchases that still need attention — once every purchase is matched, it says there's nothing to fix.

## Farmer ID cards

From a farmer's profile, open **Farmer Card**. It shows their FRN, name, village/district, and phone. Tap **Download PDF** to save a small card-sized PDF — print it at the centre (or write the details by hand if no printer is available) and give it to the farmer to bring on future visits. It speeds up finding them next time.

## Common questions

**What if I make a mistake entering a purchase?**
There is currently no in-app edit for a saved purchase. Note the correction on your paper receipt book and flag it to the office/admin — an edit feature is planned (see [[Backlog]]).

**What if two staff at different centres register the same farmer by accident?**
Each farmer only needs one FRN. If you suspect a duplicate, flag it to the office rather than registering again.

**Do I need to log in?**
Yes — every staff member signs in with their own phone number and password (see "Logging in" above), and an admin must approve your phone number before you get real access. You only need internet the first time; after that, you can keep working offline on that phone.

**I signed in but I'm stuck on "Approval Needed" — what do I do?**
That's expected the first time. Tell your admin the phone number shown on that screen so they can approve it, then tap **Check Again**.

**I forgot my password — what do I do?**
There is currently no in-app "forgot password" flow (and no SMS/email verification to send a reset link to, since sign-in uses a phone number rather than a real inbox). Tell your admin, who can reset your password directly for you in Firebase Console's Authentication tab; a proper in-app reset flow is planned (see [[Backlog]]).

**What happens to the data I enter?**
It's saved to Malaika Honey's central database (Firebase) and is used to pay farmers correctly, track supply, and — over time — to report on farmer income and honey quality improvements to Malaika's partners.

## Getting help

If the app isn't working as expected, note what you were doing when it happened (which screen, which farmer/FRN) and report it to your supervisor or the app administrator so it can be logged and fixed.
