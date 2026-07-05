import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { todayIso } from './constants.js';

const FRN_PREFIX = 'MH';
const FRN_DIGITS = 6;

function formatFrn(sequence) {
  return FRN_PREFIX + String(sequence).padStart(FRN_DIGITS, '0');
}

function looksLikeFrn(value) {
  return /^mh\d+$/i.test(value.trim());
}

/**
 * Fetches the FRN counter once at app start (best-effort, errors ignored)
 * so it's present in the local cache before staff head somewhere offline.
 * getDoc() throws rather than returning "not found" for a document that's
 * never been cached and there's no connection - without this warm-up,
 * offline farmer registration would fail on any device that hadn't already
 * created a farmer online at least once (see createFarmerOffline() below).
 */
export function warmOfflineCache() {
  getDoc(doc(db, 'counters', 'frnCounter')).catch(() => {});
}

function buildFarmerDoc(frn, farmerInput) {
  return {
    schemaVersion: 1,
    frn,
    fullName: farmerInput.fullName,
    fullNameLower: farmerInput.fullName.trim().toLowerCase(),
    dateOfBirth: farmerInput.dateOfBirth || null,
    gender: farmerInput.gender || null,
    phone: farmerInput.phone,
    email: farmerInput.email || null,
    village: farmerInput.village,
    district: farmerInput.district,
    farmSize: farmerInput.farmSize || null,
    hives: {
      traditional: Number(farmerInput.hivesTraditional) || 0,
      ktb: Number(farmerInput.hivesKtb) || 0,
      modern: Number(farmerInput.hivesModern) || 0,
    },
    otherCropsOrLivestock: farmerInput.otherCropsOrLivestock || '',
    avgHarvestKgPerYear: Number(farmerInput.avgHarvestKgPerYear) || 0,
    usesChemicals: !!farmerInput.usesChemicals,
    wantsTraining: !!farmerInput.wantsTraining,
    signatureDate: farmerInput.signatureDate || todayIso(),
    photoUrl: null,
    status: 'active',
    registeredBy: farmerInput.registeredBy || 'Field App',
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lifetimeStats: {
      totalKg: 0,
      totalPaidUgx: 0,
      lastPurchaseAt: null,
    },
  };
}

/**
 * Online path: mints the FRN and creates the farmer inside a Firestore
 * transaction so two staff registering at the same moment can never
 * collide (see docs/Database-Schema.md "counters/frnCounter"). Transactions
 * require a live round trip to the backend and reject if the device has no
 * connection, so createFarmer() below falls back to createFarmerOffline()
 * whenever this fails.
 */
async function createFarmerOnline(farmerInput) {
  const counterRef = doc(db, 'counters', 'frnCounter');

  const frn = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextValue = (counterSnap.exists() ? counterSnap.data().lastValue : 0) + 1;
    const newFrn = formatFrn(nextValue);
    const farmerRef = doc(db, 'farmers', newFrn);

    tx.set(counterRef, { lastValue: nextValue });
    tx.set(farmerRef, buildFarmerDoc(newFrn, farmerInput));

    return newFrn;
  });

  // Transactions commit straight to the backend and do not update the local
  // persistent cache the way a plain read/write does. Re-reading the
  // counter here (while still online) is what makes createFarmerOffline()
  // able to mint the next FRN from cache later in this same session.
  getDoc(counterRef).catch(() => {});

  return frn;
}

/**
 * Offline path: Firestore transactions can't complete without a live
 * connection, so this mints the next FRN from the locally cached counter
 * (including this device's own not-yet-synced writes, which Firestore
 * applies to the local cache immediately) and queues a plain batched
 * write instead. The commit is intentionally *not* awaited to completion:
 * Firestore only resolves a write's promise once the server acknowledges
 * it, so awaiting it here would hang the UI until connectivity returns.
 * The local queue persists the write durably and syncs it automatically
 * (see docs/System-Architecture.md "Offline behavior in detail"). This
 * accepts a known, low-probability edge case: two devices registering
 * offline at the same moment could mint the same FRN (see
 * docs/Risk-Register.md R3).
 */
function createFarmerOffline(farmerInput) {
  const counterRef = doc(db, 'counters', 'frnCounter');

  return getDoc(counterRef).catch(() => {
    // getDoc() throws (rather than resolving "not found") when this exact
    // document has never been fetched into the local cache and the device
    // has no connection right now - there's no locally known FRN sequence
    // to work from in that case.
    throw new Error(
      'Cannot register a new farmer while offline on a device that has never connected to the internet in this app. Connect to the internet briefly, then try again.'
    );
  }).then((counterSnap) => {
    const nextValue = (counterSnap.exists() ? counterSnap.data().lastValue : 0) + 1;
    const frn = formatFrn(nextValue);
    const farmerRef = doc(db, 'farmers', frn);

    const batch = writeBatch(db);
    batch.set(counterRef, { lastValue: nextValue });
    batch.set(farmerRef, buildFarmerDoc(frn, farmerInput));
    batch
      .commit()
      .catch((err) => console.error('[Malaika Honey] Farmer ' + frn + ' failed to sync', err));

    return frn;
  });
}

export async function createFarmer(farmerInput) {
  if (navigator.onLine) {
    try {
      return await createFarmerOnline(farmerInput);
    } catch (err) {
      console.warn('[Malaika Honey] Online registration failed, queuing offline instead', err);
    }
  }
  return createFarmerOffline(farmerInput);
}

export async function getFarmerByFrn(frn) {
  const ref = doc(db, 'farmers', frn.trim().toUpperCase());
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Exact-match phone lookup, used to block registering the same phone
 * number twice (see docs/Admin-User-Manual.md and Backlog 2.4).
 */
export async function findFarmerByPhone(phone) {
  const q = query(collection(db, 'farmers'), where('phone', '==', phone.trim()), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}

/**
 * Exact-match name lookup (case-insensitive), used to warn (not block)
 * when registering a farmer whose name already exists - farmers can
 * share a name but not a phone number.
 */
export async function findFarmerByName(fullName) {
  const lower = fullName.trim().toLowerCase();
  const q = query(collection(db, 'farmers'), where('fullNameLower', '==', lower), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}

/**
 * Search by FRN (direct lookup), phone (exact match), or name (prefix
 * match on fullNameLower). Firestore has no full-text search, so name
 * search is a startsWith-style range query - good enough for staff typing
 * the start of a farmer's name.
 */
export async function searchFarmers(rawQuery) {
  const q = rawQuery.trim();
  if (!q) return [];

  if (looksLikeFrn(q)) {
    const farmer = await getFarmerByFrn(q);
    return farmer ? [farmer] : [];
  }

  const results = new Map();

  const phoneQuery = query(collection(db, 'farmers'), where('phone', '==', q), limit(10));
  const phoneSnap = await getDocs(phoneQuery);
  phoneSnap.forEach((d) => results.set(d.id, d.data()));

  const lower = q.toLowerCase();
  const nameQuery = query(
    collection(db, 'farmers'),
    orderBy('fullNameLower'),
    where('fullNameLower', '>=', lower),
    where('fullNameLower', '<=', lower + ''),
    limit(15)
  );
  const nameSnap = await getDocs(nameQuery);
  nameSnap.forEach((d) => results.set(d.id, d.data()));

  return Array.from(results.values());
}

function buildPurchaseDoc(purchaseInput, farmer) {
  return {
    schemaVersion: 1,
    frn: purchaseInput.frn,
    farmerNameSnapshot: farmer.fullName,
    product: purchaseInput.product,
    weightKg: Number(purchaseInput.weightKg),
    grade: purchaseInput.grade,
    pricePerKgUgx: Number(purchaseInput.pricePerKgUgx),
    totalUgx: Number(purchaseInput.totalUgx),
    paymentMethod: purchaseInput.paymentMethod,
    receiptNo: purchaseInput.receiptNo || '',
    purchaseDate: purchaseInput.purchaseDate || todayIso(),
    centre: null,
    recordedBy: purchaseInput.recordedBy || 'Field App',
    createdAt: serverTimestamp(),
    syncedFromOffline: !navigator.onLine,
  };
}

function nextLifetimeStats(farmer, purchaseInput) {
  const stats = farmer.lifetimeStats || { totalKg: 0, totalPaidUgx: 0, lastPurchaseAt: null };
  return {
    totalKg: (stats.totalKg || 0) + Number(purchaseInput.weightKg),
    totalPaidUgx: (stats.totalPaidUgx || 0) + Number(purchaseInput.totalUgx),
    lastPurchaseAt: purchaseInput.purchaseDate || todayIso(),
  };
}

/**
 * Online path: records a purchase and updates the farmer's denormalized
 * lifetime stats in one Firestore transaction (see docs/Database-Schema.md
 * "Why denormalize"). Requires a live connection - savePurchase() below
 * falls back to savePurchaseOffline() whenever this fails.
 */
async function savePurchaseOnline(purchaseInput) {
  const farmerRef = doc(db, 'farmers', purchaseInput.frn);
  const purchaseRef = doc(collection(db, 'purchases'));

  await runTransaction(db, async (tx) => {
    const farmerSnap = await tx.get(farmerRef);
    if (!farmerSnap.exists()) {
      throw new Error('Farmer not found for FRN ' + purchaseInput.frn);
    }
    const farmer = farmerSnap.data();

    tx.set(purchaseRef, buildPurchaseDoc(purchaseInput, farmer));
    tx.update(farmerRef, {
      lifetimeStats: nextLifetimeStats(farmer, purchaseInput),
      updatedAt: serverTimestamp(),
    });
  });

  // As in createFarmerOnline() above: transaction commits don't refresh the
  // local cache, so re-read the farmer here (while still online) or a later
  // offline purchase in this session would compute lifetimeStats from
  // stale, pre-purchase totals.
  getDoc(farmerRef).catch(() => {});

  return purchaseRef.id;
}

/**
 * Offline path: same as savePurchaseOnline but via a plain batched write
 * read from the local cache, with the commit fired-and-forgotten rather
 * than awaited (see createFarmerOffline() above for why). The farmer doc
 * is normally already cached by this point since Buy Produce loads it via
 * getFarmerByFrn() before the form is shown.
 */
function savePurchaseOffline(purchaseInput) {
  const farmerRef = doc(db, 'farmers', purchaseInput.frn);
  const purchaseRef = doc(collection(db, 'purchases'));

  return getDoc(farmerRef).then((farmerSnap) => {
    if (!farmerSnap.exists()) {
      throw new Error('Farmer not found for FRN ' + purchaseInput.frn);
    }
    const farmer = farmerSnap.data();

    const batch = writeBatch(db);
    batch.set(purchaseRef, buildPurchaseDoc(purchaseInput, farmer));
    batch.update(farmerRef, {
      lifetimeStats: nextLifetimeStats(farmer, purchaseInput),
      updatedAt: serverTimestamp(),
    });
    batch
      .commit()
      .catch((err) => console.error('[Malaika Honey] Purchase ' + purchaseRef.id + ' failed to sync', err));

    return purchaseRef.id;
  });
}

/**
 * Records a purchase and updates the farmer's denormalized lifetime stats.
 * Tries the transactional online path first (safest under concurrency);
 * falls back to the offline-safe queued path when there's no connection or
 * the online attempt fails for any reason (including a genuinely missing
 * farmer, which the offline path also checks and reports the same way).
 */
export async function savePurchase(purchaseInput) {
  if (navigator.onLine) {
    try {
      return await savePurchaseOnline(purchaseInput);
    } catch (err) {
      console.warn('[Malaika Honey] Online purchase failed, queuing offline instead', err);
    }
  }
  return savePurchaseOffline(purchaseInput);
}

export async function getPurchaseHistory(frn) {
  const q = query(
    collection(db, 'purchases'),
    where('frn', '==', frn),
    orderBy('purchaseDate', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
