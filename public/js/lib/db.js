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
 * Creates a new farmer document and mints its FRN in a single transaction,
 * so two staff registering at the same moment can never collide
 * (see docs/Database-Schema.md "counters/frnCounter").
 */
export async function createFarmer(farmerInput) {
  const counterRef = doc(db, 'counters', 'frnCounter');

  const frn = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextValue = (counterSnap.exists() ? counterSnap.data().lastValue : 0) + 1;
    const newFrn = formatFrn(nextValue);
    const farmerRef = doc(db, 'farmers', newFrn);

    tx.set(counterRef, { lastValue: nextValue });
    tx.set(farmerRef, {
      schemaVersion: 1,
      frn: newFrn,
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
    });

    return newFrn;
  });

  return frn;
}

export async function getFarmerByFrn(frn) {
  const ref = doc(db, 'farmers', frn.trim().toUpperCase());
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
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
    where('fullNameLower', '<=', lower + ''),
    limit(15)
  );
  const nameSnap = await getDocs(nameQuery);
  nameSnap.forEach((d) => results.set(d.id, d.data()));

  return Array.from(results.values());
}

/**
 * Records a purchase and updates the farmer's denormalized lifetime stats
 * in one transaction (see docs/Database-Schema.md "Why denormalize").
 */
export async function savePurchase(purchaseInput) {
  const farmerRef = doc(db, 'farmers', purchaseInput.frn);
  const purchaseRef = doc(collection(db, 'purchases'));

  await runTransaction(db, async (tx) => {
    const farmerSnap = await tx.get(farmerRef);
    if (!farmerSnap.exists()) {
      throw new Error('Farmer not found for FRN ' + purchaseInput.frn);
    }
    const farmer = farmerSnap.data();
    const stats = farmer.lifetimeStats || { totalKg: 0, totalPaidUgx: 0, lastPurchaseAt: null };

    tx.set(purchaseRef, {
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
    });

    tx.update(farmerRef, {
      lifetimeStats: {
        totalKg: (stats.totalKg || 0) + Number(purchaseInput.weightKg),
        totalPaidUgx: (stats.totalPaidUgx || 0) + Number(purchaseInput.totalUgx),
        lastPurchaseAt: purchaseInput.purchaseDate || todayIso(),
      },
      updatedAt: serverTimestamp(),
    });
  });

  return purchaseRef.id;
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
