import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  increment,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName, currentAdminEmail } from './auth.js';
import { buildEditableFarmerFields, diffFarmerFields, farmerToFieldValues } from '../shared/farmerFields.js';

/**
 * All Firestore access for the admin app. Reads are plain server reads (no
 * offline cache - see firebase.js for why management must not be shown
 * stale numbers unknowingly).
 */

export async function fetchAllFarmers() {
  const snap = await getDocs(query(collection(db, 'farmers'), orderBy('fullNameLower')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAllPurchases() {
  const snap = await getDocs(query(collection(db, 'purchases'), orderBy('purchaseDate', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchFarmer(frn) {
  const snap = await getDoc(doc(db, 'farmers', frn));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchPurchase(purchaseId) {
  const snap = await getDoc(doc(db, 'purchases', purchaseId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Purchases for one farmer, newest first (uses the existing composite index). */
export async function fetchPurchasesForFarmer(frn) {
  const snap = await getDocs(
    query(collection(db, 'purchases'), where('frn', '==', frn), orderBy('purchaseDate', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * The edit history for one farmer. This is the first place anywhere that
 * reads `farmerEdits` back - the field app only ever writes it (see
 * docs/Database-Schema.md and Backlog 3.4).
 *
 * Ordered client-side by editedAtLocal rather than in the query: an edit
 * made offline has a null `editedAt` server timestamp until it syncs, so
 * ordering on that field server-side would misplace exactly the records
 * most worth seeing. editedAtLocal is always present.
 */
export async function fetchFarmerEdits(frn) {
  const snap = await getDocs(query(collection(db, 'farmerEdits'), where('frn', '==', frn), limit(500)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.editedAtLocal || '').localeCompare(String(a.editedAtLocal || '')));
}

/**
 * Admin-side farmer edit. Mirrors the field app's updateFarmer
 * (public/js/lib/db.js) exactly: same shared field mapping, same diff, and
 * the same single writeBatch so the farmer change and its audit record
 * commit together or not at all.
 *
 * Unlike the field app this DOES await the commit - a desk tool is online
 * by definition, and management should see a hard failure immediately
 * rather than a fire-and-forget write.
 */
export async function updateFarmerAsAdmin({ frn, fullName, phone, fieldValues, existing }) {
  const farmerId = frn.trim().toUpperCase();
  const nextFields = buildEditableFarmerFields({ fullName, phone, fieldValues });
  const previousFields = buildEditableFarmerFields({
    fullName: existing.fullName || '',
    phone: existing.phone || '',
    fieldValues: farmerToFieldValues(existing),
  });

  const changes = diffFarmerFields(previousFields, nextFields);
  if (!changes.length) return { changed: false, changes: [] };

  const batch = writeBatch(db);
  batch.update(doc(db, 'farmers', farmerId), { ...nextFields, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'farmerEdits')), {
    schemaVersion: 1,
    frn: farmerId,
    changes,
    editedBy: currentAdminName(),
    editedByEmail: currentAdminEmail(),
    // Distinguishes a management correction from a field edit when the
    // history is read back - there is no device code here.
    editedVia: 'admin',
    deviceCode: null,
    editedAt: serverTimestamp(),
    editedAtLocal: new Date().toISOString(),
    syncedFromOffline: false,
  });

  await batch.commit();
  return { changed: true, changes };
}

/** Duplicate-phone guard, matching the field app's one-registration-per-phone rule. */
export async function findFarmerByPhone(phone) {
  const snap = await getDocs(query(collection(db, 'farmers'), where('phone', '==', phone.trim()), limit(1)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ---------------------------------------------------------------- metrics

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Dashboard figures, computed from already-fetched arrays so the numbers on
 * screen provably come from the same data the lists show.
 *
 * `purchaseDate` is a plain 'YYYY-MM-DD' string (see docs/Database-Schema.md),
 * so date windows are string comparisons - no timezone conversion, and it
 * matches how the field app writes them.
 */
export function computeMetrics(farmers, purchases) {
  const today = isoDay(startOfToday());
  const weekAgo = isoDay(new Date(Date.now() - 6 * 864e5));
  const monthStart = today.slice(0, 8) + '01';

  const sum = (list, field) => list.reduce((total, p) => total + (Number(p[field]) || 0), 0);
  const inRange = (from) => purchases.filter((p) => String(p.purchaseDate || '') >= from);

  const todays = inRange(today);
  const week = inRange(weekAgo);
  const month = inRange(monthStart);

  const byProduct = {};
  purchases.forEach((p) => {
    const key = p.product || 'unknown';
    if (!byProduct[key]) byProduct[key] = { product: key, kg: 0, ugx: 0, count: 0 };
    byProduct[key].kg += Number(p.weightKg) || 0;
    byProduct[key].ugx += Number(p.totalUgx) || 0;
    byProduct[key].count += 1;
  });

  // Top suppliers is a ranking of FARMERS, so purchases still awaiting a
  // farmer match are excluded - their FRN was typed but never confirmed, so
  // attributing weight to it would both invent a supplier and render a link
  // to a farmer record that doesn't exist. They stay counted in the totals
  // above and are surfaced separately by unverifiedCount.
  const byFarmer = {};
  purchases.forEach((p) => {
    if (!p.frn || p.frnUnverified) return;
    if (!byFarmer[p.frn]) byFarmer[p.frn] = { frn: p.frn, name: p.farmerNameSnapshot || p.frn, kg: 0, ugx: 0 };
    byFarmer[p.frn].kg += Number(p.weightKg) || 0;
    byFarmer[p.frn].ugx += Number(p.totalUgx) || 0;
  });

  return {
    farmersTotal: farmers.length,
    farmersThisMonth: farmers.filter((f) => {
      const registered = f.registeredAt && f.registeredAt.toDate ? f.registeredAt.toDate() : null;
      return registered ? isoDay(registered) >= monthStart : false;
    }).length,
    purchasesTotal: purchases.length,
    kgTotal: sum(purchases, 'weightKg'),
    paidTotal: sum(purchases, 'totalUgx'),
    today: { count: todays.length, kg: sum(todays, 'weightKg'), ugx: sum(todays, 'totalUgx') },
    week: { count: week.length, kg: sum(week, 'weightKg'), ugx: sum(week, 'totalUgx') },
    month: { count: month.length, kg: sum(month, 'weightKg'), ugx: sum(month, 'totalUgx') },
    byProduct: Object.values(byProduct).sort((a, b) => b.kg - a.kg),
    topFarmers: Object.values(byFarmer).sort((a, b) => b.kg - a.kg).slice(0, 10),
    unverifiedCount: purchases.filter((p) => p.frnUnverified).length,
    noLocationCount: purchases.filter((p) => !p.recordedLocation).length,
  };
}

// ------------------------------------------------------- purchase editing

const PURCHASE_EDITABLE = [
  'purchaseDate', 'product', 'grade', 'weightKg', 'pricePerKgUgx', 'paymentMethod', 'receiptNo',
];

const PURCHASE_LABELS = {
  purchaseDate: 'Date',
  product: 'Product',
  grade: 'Grade',
  weightKg: 'Weight (kg)',
  pricePerKgUgx: 'Price per kg',
  totalUgx: 'Total',
  paymentMethod: 'Payment method',
  receiptNo: 'Receipt No.',
};

/**
 * Edits a purchase, with three things that must happen together or not at
 * all — hence one writeBatch, the same reasoning as updateFarmer:
 *
 *  1. the purchase document itself,
 *  2. an append-only `purchaseEdits` audit record,
 *  3. a correcting adjustment to the farmer's lifetimeStats.
 *
 * (3) is the subtle one. lifetimeStats is maintained by `increment()`
 * deltas from the field app (never recomputed - see docs/Database-Schema.md
 * on why transactions are avoided), so changing a saved weight or price
 * would silently desynchronise a farmer's lifetime totals unless the
 * DIFFERENCE is applied here. Only done when the purchase is actually
 * matched to a farmer, mirroring savePurchase's own rule for frnUnverified.
 */
export async function updatePurchaseAsAdmin({ purchaseId, updates, existing }) {
  const next = {};
  PURCHASE_EDITABLE.forEach((key) => {
    if (key === 'weightKg' || key === 'pricePerKgUgx') next[key] = Number(updates[key]) || 0;
    else next[key] = updates[key] ?? '';
  });
  next.totalUgx = next.weightKg * next.pricePerKgUgx;

  const changes = [];
  [...PURCHASE_EDITABLE, 'totalUgx'].forEach((key) => {
    const from = existing[key] ?? null;
    const to = next[key] ?? null;
    if (String(from ?? '') === String(to ?? '')) return;
    changes.push({ field: key, label: PURCHASE_LABELS[key] || key, from, to });
  });

  if (!changes.length) return { changed: false, changes: [] };

  const batch = writeBatch(db);
  batch.update(doc(db, 'purchases', purchaseId), { ...next, updatedAt: serverTimestamp() });

  batch.set(doc(collection(db, 'purchaseEdits')), {
    schemaVersion: 1,
    purchaseId,
    frn: existing.frn || null,
    changes,
    editedBy: currentAdminName(),
    editedByEmail: currentAdminEmail(),
    editedVia: 'admin',
    editedAt: serverTimestamp(),
    editedAtLocal: new Date().toISOString(),
  });

  const kgDelta = next.weightKg - (Number(existing.weightKg) || 0);
  const ugxDelta = next.totalUgx - (Number(existing.totalUgx) || 0);
  const affectsStats = existing.frn && !existing.frnUnverified && (kgDelta !== 0 || ugxDelta !== 0);
  if (affectsStats) {
    batch.update(doc(db, 'farmers', existing.frn), {
      'lifetimeStats.totalKg': increment(kgDelta),
      'lifetimeStats.totalPaidUgx': increment(ugxDelta),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // `lastPurchaseAt` is a max(), not a sum, so it can't be corrected with a
  // delta. Recomputed separately, after the batch, because it's a derived
  // convenience value - if this follow-up fails the ledger above is still
  // correct, which is the right way round for the two to fail.
  if (existing.frn && !existing.frnUnverified && next.purchaseDate !== existing.purchaseDate) {
    try {
      const all = await fetchPurchasesForFarmer(existing.frn);
      const latest = all.map((p) => p.purchaseDate).filter(Boolean).sort().pop() || null;
      await updateDoc(doc(db, 'farmers', existing.frn), { 'lifetimeStats.lastPurchaseAt': latest });
    } catch (err) {
      console.warn('[Malaika Admin] Could not recompute lastPurchaseAt:', err);
    }
  }

  return { changed: true, changes, statsAdjusted: affectsStats };
}

/** Edit history for one purchase (see purchaseEdits in docs/Database-Schema.md). */
export async function fetchPurchaseEdits(purchaseId) {
  const snap = await getDocs(query(collection(db, 'purchaseEdits'), where('purchaseId', '==', purchaseId), limit(200)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.editedAtLocal || '').localeCompare(String(a.editedAtLocal || '')));
}
