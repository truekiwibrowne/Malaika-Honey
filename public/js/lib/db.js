import {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDocsFromCache,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { todayIso } from './constants.js';
import { currentDisplayName, currentUserEmail } from './auth.js';
import { getDeviceCode, nextLocalSequence } from './device.js';
import { trackWrite } from './sync.js';
import { getCapturedLocation } from './location.js';
// Farmer field mapping + diffing live in farmerFields.js (no Firebase
// imports) so the admin app can share them verbatim - see that file.
import {
  buildEditableFarmerFields,
  diffFarmerFields,
  farmerToFieldValues,
} from './farmerFields.js';

// Re-exported so existing importers (editFarmer.js) keep working unchanged.
export { farmerToFieldValues };

const FRN_PREFIX = 'MH';

function formatFrn() {
  const seq = nextLocalSequence();
  return FRN_PREFIX + getDeviceCode() + String(seq).padStart(6, '0');
}

// Matches both the old shared-counter format (MH000001) and the current
// device-coded format (MHA7K000001) - both are permanent, opaque unique
// strings and neither is ever migrated to the other (see
// docs/Database-Schema.md "devices/{deviceCode}").
export function looksLikeFrn(value) {
  return /^mh[a-z0-9]+$/i.test(value.trim());
}

/**
 * A plain getDocs(query) still tries the server first even when offline,
 * only falling back to cache after a real connectivity timeout (several
 * seconds) - on a cold app start with no signal, that makes duplicate-
 * phone/name checks and history/reconcile lookups feel like the app is
 * stuck instead of just using what's already cached. Every query-based
 * read in this file goes through this helper instead of calling getDocs
 * directly, so it resolves quickly offline regardless of whether this
 * exact query has run before (an empty/never-cached result is the same
 * "nothing found here yet" outcome a query that genuinely has no matches
 * would give).
 */
async function getDocsOfflineSafe(q) {
  return navigator.onLine ? getDocs(q) : getDocsFromCache(q);
}

// IMPORTANT: setDoc/updateDoc promises only resolve once the write is
// ACKNOWLEDGED BY THE SERVER - while offline that never happens until a
// connection returns, so awaiting them directly would hang the UI
// indefinitely. The local cache (and therefore every read in this file)
// updates synchronously regardless of connectivity, which is what makes
// offline use possible at all - callers must not await the write itself,
// only fire it and let it resolve/reject in the background (see
// trackWrite in sync.js, which also drives the header's sync badge).

/**
 * Creates a new farmer document. The FRN is minted entirely client-side
 * (device code + a locally-incremented sequence, see device.js) so this
 * never needs a server round-trip - unlike a transaction (which fails
 * outright when offline instead of queuing), this plain setDoc queues
 * correctly and syncs automatically once a connection is available. The
 * write is intentionally not awaited (see trackWrite above) so this
 * resolves instantly, online or off.
 *
 * `fieldValues` is a flat { fieldId: rawValue } map straight from the
 * dynamic New Farmer form (see newFarmer.js and referenceData.js
 * getNewFarmerFields) - Full Name and Phone are passed separately since
 * they're fixed, always-required inputs outside that schema.
 */
export async function createFarmer({ fullName, phone, fieldValues = {}, registeredBy }) {
  const frn = formatFrn();
  const farmerRef = doc(db, 'farmers', frn);

  trackWrite(setDoc(farmerRef, {
    schemaVersion: 1,
    frn,
    ...buildEditableFarmerFields({ fullName, phone, fieldValues }),
    signatureDate: todayIso(),
    photoUrl: null,
    status: 'active',
    registeredBy: registeredBy || currentDisplayName(),
    // Where the staff member was when they registered this farmer, or null
    // if no fix was available - see location.js. Never blocks the save.
    registeredLocation: getCapturedLocation(),
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lifetimeStats: {
      totalKg: 0,
      totalPaidUgx: 0,
      lastPurchaseAt: null,
    },
  }), 'farmer ' + frn);

  return frn;
}

/**
 * Applies staff edits to an existing farmer and records what changed in
 * the append-only `farmerEdits` collection (see docs/Database-Schema.md).
 *
 * The audit record is the point of this function - the farmer document
 * itself only ever carries current values, so without it there'd be no way
 * to answer "who changed this phone number, and what was it before?".
 * Nothing in this app reads `farmerEdits` back; it exists for the future
 * desktop/admin app, which is why there's no in-app history screen.
 *
 * `existing` is the farmer document as it was when the form was opened -
 * passed in rather than re-read here so the diff is against exactly what
 * the staff member saw, and so this stays a pure write (no round-trip)
 * offline. Returns `{ changed: false }` when nothing actually differs, so
 * a no-op save doesn't write an empty audit entry.
 *
 * The farmer update and its audit record go in ONE `writeBatch` so they
 * commit together or not at all. They were originally two independent
 * writes, which meant a rejected audit write still left the farmer
 * changed - a silent edit with no trail, exactly the thing this audit
 * record exists to prevent. Note a batch is not a transaction: it needs no
 * server read, so unlike `runTransaction` it queues correctly offline (see
 * the note on transactions in savePurchase / docs/System-Architecture.md).
 *
 * The commit is not awaited (see the trackWrite note above) so this
 * resolves instantly online or off, but it IS returned as `committed` so
 * the caller can surface a genuine server rejection to the user - offline
 * that promise simply stays pending rather than rejecting.
 */
export async function updateFarmer({ frn, fullName, phone, fieldValues = {}, existing }) {
  const farmerId = frn.trim().toUpperCase();
  const nextFields = buildEditableFarmerFields({ fullName, phone, fieldValues });
  const previousFields = buildEditableFarmerFields({
    fullName: existing.fullName || '',
    phone: existing.phone || '',
    fieldValues: farmerToFieldValues(existing),
  });

  const changes = diffFarmerFields(previousFields, nextFields);
  if (!changes.length) return { changed: false, changes: [] };

  const editRef = doc(collection(db, 'farmerEdits'));
  const batch = writeBatch(db);

  batch.update(doc(db, 'farmers', farmerId), { ...nextFields, updatedAt: serverTimestamp() });
  batch.set(editRef, {
    schemaVersion: 1,
    frn: farmerId,
    changes,
    // currentDisplayName() resolves to the office id for an office
    // account (the primary sign-in method), which is the accountability
    // unit this app actually has - see docs/Risk-Register.md R24.
    editedBy: currentDisplayName(),
    editedByEmail: currentUserEmail(),
    deviceCode: getDeviceCode(),
    // serverTimestamp() stays null in the local cache until this syncs,
    // so an offline edit would otherwise have no usable date at all -
    // editedAtLocal is always present and is what the desktop app should
    // fall back to (and what reveals a long offline gap).
    editedAt: serverTimestamp(),
    editedAtLocal: new Date().toISOString(),
    syncedFromOffline: !navigator.onLine,
  });

  const committed = trackWrite(batch.commit(), 'farmer edit ' + farmerId);

  return { changed: true, changes, committed };
}

/**
 * Prefers a live read (freshest data) when online, but reads from cache
 * only when offline - a plain getDoc still tries the server first even
 * offline and can take several seconds to time out and fall back, which
 * makes Farmer Profile/History feel stuck even for a farmer that's
 * already cached from a previous visit. See getFarmerByFrnFromCache for
 * a lookup that's cache-only unconditionally (used where a live attempt
 * must never be made at all, e.g. Buy Produce).
 */
export async function getFarmerByFrn(frn) {
  const ref = doc(db, 'farmers', frn.trim().toUpperCase());
  if (!navigator.onLine) return getFarmerFromCache(frn);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Cache-only farmer lookup - never attempts a server round-trip, so it
 * resolves quickly regardless of connectivity instead of hanging (unlike
 * getDoc, which can wait indefinitely for a document that isn't cached
 * while offline - see docs/System-Architecture.md). Used anywhere that
 * must not block on a network round-trip, e.g. Buy Produce.
 */
export async function getFarmerByFrnFromCache(frn) {
  return getFarmerFromCache(frn);
}

/**
 * Cache-only farmer lookup - never attempts a server round-trip, so it
 * resolves instantly offline instead of hanging/failing. Returns null if
 * the farmer isn't known on this device (never registered here, and never
 * looked up here while online before).
 */
async function getFarmerFromCache(frn) {
  const ref = doc(db, 'farmers', frn.trim().toUpperCase());
  try {
    const snap = await getDocFromCache(ref);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * Exact-match phone lookup, used to block registering the same phone
 * number twice (see docs/Admin-User-Manual.md and Backlog 2.4).
 */
export async function findFarmerByPhone(phone) {
  const q = query(collection(db, 'farmers'), where('phone', '==', phone.trim()), limit(1));
  const snap = await getDocsOfflineSafe(q);
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
  const snap = await getDocsOfflineSafe(q);
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
    // Cache-only: search must never hang waiting for a network round-trip
    // (see getFarmerByFrnFromCache) - if a farmer genuinely isn't cached
    // on this device yet, that's the same "not found here" outcome a
    // staff member would get from any other offline search.
    const farmer = await getFarmerFromCache(q);
    return farmer ? [farmer] : [];
  }

  const results = new Map();

  const phoneQuery = query(collection(db, 'farmers'), where('phone', '==', q), limit(10));
  const phoneSnap = await getDocsOfflineSafe(phoneQuery);
  phoneSnap.forEach((d) => results.set(d.id, d.data()));

  const lower = q.toLowerCase();
  // '' is a very high Unicode code point (Private Use Area), higher
  // than any normal character - appending it to the upper bound is the
  // standard Firestore trick for a "starts with" prefix range query.
  const nameQuery = query(
    collection(db, 'farmers'),
    orderBy('fullNameLower'),
    where('fullNameLower', '>=', lower),
    where('fullNameLower', '<=', lower + String.fromCharCode(0xf8ff)),
    limit(15)
  );
  const nameSnap = await getDocsOfflineSafe(nameQuery);
  nameSnap.forEach((d) => results.set(d.id, d.data()));

  return Array.from(results.values());
}

/**
 * Records a purchase. Always saves, online or offline: the purchase doc
 * itself is written unconditionally via setDoc (queues fine offline). The
 * farmer's denormalized lifetimeStats are updated via increment() - safe
 * to apply without reading the current value first, so (unlike the old
 * transactional read-modify-write) it also queues and applies correctly
 * offline. If the farmer isn't known on this device at all, the purchase
 * is still saved, flagged frnUnverified, with the stats update deferred
 * until reconciliation (see resolveUnverifiedPurchase) confirms the FRN.
 */
export async function savePurchase(purchaseInput) {
  let frn = purchaseInput.frn.trim().toUpperCase();
  let farmer = await getFarmerFromCache(frn);

  // A duplicate merged away in the management app keeps its document (and
  // its printed card), but its purchases now belong to the surviving FRN.
  // Crediting the old one would split the farmer's totals again. If the
  // surviving record isn't on this device yet, the purchase goes down the
  // ordinary unverified path below, with the FRN staff typed preserved.
  if (farmer && farmer.status === 'merged' && farmer.mergedInto) {
    frn = farmer.mergedInto;
    farmer = await getFarmerFromCache(frn);
  }

  const farmerRef = doc(db, 'farmers', frn);
  const purchaseRef = doc(collection(db, 'purchases'));

  trackWrite(
    setDoc(purchaseRef, {
      schemaVersion: 1,
      frn,
      farmerNameSnapshot: farmer ? farmer.fullName : null,
      product: purchaseInput.product,
      weightKg: Number(purchaseInput.weightKg),
      grade: purchaseInput.grade,
      pricePerKgUgx: Number(purchaseInput.pricePerKgUgx),
      totalUgx: Number(purchaseInput.totalUgx),
      paymentMethod: purchaseInput.paymentMethod,
      receiptNo: purchaseInput.receiptNo || '',
      purchaseDate: purchaseInput.purchaseDate || todayIso(),
      centre: null,
      recordedBy: purchaseInput.recordedBy || currentDisplayName(),
      // Where the staff member was when they recorded this purchase, or
      // null if no fix was available - see location.js. Never blocks it.
      recordedLocation: getCapturedLocation(),
      createdAt: serverTimestamp(),
      syncedFromOffline: !navigator.onLine,
      frnUnverified: !farmer,
      originalTypedFrn: farmer ? null : purchaseInput.frn.trim().toUpperCase(),
    }),
    'purchase ' + purchaseRef.id
  );

  if (farmer) {
    trackWrite(
      updateDoc(farmerRef, {
        'lifetimeStats.totalKg': increment(Number(purchaseInput.weightKg)),
        'lifetimeStats.totalPaidUgx': increment(Number(purchaseInput.totalUgx)),
        'lifetimeStats.lastPurchaseAt': purchaseInput.purchaseDate || todayIso(),
        updatedAt: serverTimestamp(),
      }),
      'lifetimeStats for ' + frn
    );
  }

  return { purchaseId: purchaseRef.id, verified: !!farmer, frn };
}

/**
 * Confirms the correct farmer for a purchase that was saved with
 * frnUnverified (see savePurchase), then applies the stats update that
 * was deferred at save time. Used by the reconciliation screen.
 */
export async function resolveUnverifiedPurchase(purchaseId, confirmedFrn) {
  const frn = confirmedFrn.trim().toUpperCase();
  const farmer = await getFarmerByFrn(frn);
  if (!farmer) {
    throw new Error('Farmer ' + frn + ' not found.');
  }

  const purchaseRef = doc(db, 'purchases', purchaseId);
  const purchaseSnap = await getDoc(purchaseRef);
  if (!purchaseSnap.exists()) {
    throw new Error('Purchase record not found.');
  }
  const purchase = purchaseSnap.data();

  await updateDoc(purchaseRef, {
    frn,
    farmerNameSnapshot: farmer.fullName,
    frnUnverified: false,
  });

  await updateDoc(doc(db, 'farmers', frn), {
    'lifetimeStats.totalKg': increment(purchase.weightKg),
    'lifetimeStats.totalPaidUgx': increment(purchase.totalUgx),
    'lifetimeStats.lastPurchaseAt': purchase.purchaseDate,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Purchases still awaiting reconciliation (see resolveUnverifiedPurchase),
 * for the /reconcile screen.
 */
export async function getUnverifiedPurchases() {
  const q = query(
    collection(db, 'purchases'),
    where('frnUnverified', '==', true),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocsOfflineSafe(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPurchaseHistory(frn) {
  const q = query(
    collection(db, 'purchases'),
    where('frn', '==', frn),
    orderBy('purchaseDate', 'desc'),
    limit(50)
  );
  const snap = await getDocsOfflineSafe(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
