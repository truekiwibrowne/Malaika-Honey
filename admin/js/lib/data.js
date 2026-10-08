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
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName, currentAdminEmail, createAuthAccount } from './auth.js';
import { officeSlug, officeIdToEmail, officeCodeToPassword } from '../shared/officeAccounts.js';
import { auditInBatch, writeAudit, notifyDataChanged } from './audit.js';
import { loadUgandaGeo, makeDistrictResolver } from './geo.js';
import { localIso } from './stats.js';
import { buildEditableFarmerFields, diffFarmerFields, farmerToFieldValues, FIELD_LABELS } from '../shared/farmerFields.js';

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
  notifyDataChanged();
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

// Local calendar day, not toISOString() (UTC) - in Uganda that reported
// the previous day for anything between midnight and 3am.
function isoDay(d) {
  return localIso(d);
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

  notifyDataChanged();
  return { changed: true, changes, statsAdjusted: affectsStats };
}

/** Edit history for one purchase (see purchaseEdits in docs/Database-Schema.md). */
export async function fetchPurchaseEdits(purchaseId) {
  const snap = await getDocs(query(collection(db, 'purchaseEdits'), where('purchaseId', '==', purchaseId), limit(200)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.editedAtLocal || '').localeCompare(String(a.editedAtLocal || '')));
}

// ------------------------------------------------------ reference lookups

/** A whole small collection (reference data, staff, requests). */
export async function fetchCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * District text -> { name, region, lat, lng } resolver: the built-in UBOS
 * district data, overridden by anything set in Settings -> Districts. If
 * the districts collection can't be read the built-in data still works.
 */
export async function loadDistrictResolver() {
  const [geo, overrides] = await Promise.all([
    loadUgandaGeo(),
    fetchCollection('districts').catch(() => []),
  ]);
  return { geo, resolveDistrict: makeDistrictResolver(geo, overrides), overrides };
}

// ------------------------------------------------- deactivate / reactivate

function farmerEdit({ frn, changes }) {
  return {
    schemaVersion: 1,
    frn,
    changes,
    editedBy: currentAdminName(),
    editedByEmail: currentAdminEmail(),
    editedVia: 'admin',
    deviceCode: null,
    editedAt: serverTimestamp(),
    editedAtLocal: new Date().toISOString(),
    syncedFromOffline: false,
  };
}

/**
 * Marks a farmer inactive (or active again). Nothing is deleted - the
 * farmer, their purchases and lifetime totals all stay - this only flags
 * the record (Database-Schema `status`). Written with its farmerEdits and
 * adminAudit entries in one batch, so the change can't exist without its
 * trail.
 */
export async function setFarmerStatus(farmer, status, reason = '') {
  const from = farmer.status || 'active';
  if (from === status) return { changed: false };
  if (from === 'merged') throw new Error('A merged record cannot be reactivated - use the farmer it was merged into.');

  const batch = writeBatch(db);
  batch.update(doc(db, 'farmers', farmer.frn), {
    status,
    statusReason: reason || null,
    statusChangedAt: serverTimestamp(),
    statusChangedBy: currentAdminName(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, 'farmerEdits')), farmerEdit({
    frn: farmer.frn,
    changes: [{ field: 'status', label: 'Status', from, to: status }, ...(reason ? [{ field: 'statusReason', label: 'Reason', from: null, to: reason }] : [])],
  }));
  auditInBatch(batch, {
    action: status === 'inactive' ? 'farmer.deactivate' : 'farmer.reactivate',
    target: farmer.frn,
    summary: (status === 'inactive' ? 'Deactivated ' : 'Reactivated ') + farmer.fullName + ' (' + farmer.frn + ')' + (reason ? ': ' + reason : ''),
    details: { reason: reason || null },
  });
  await batch.commit();
  notifyDataChanged();
  return { changed: true };
}

// ------------------------------------------------------------------ merge

// One merge is one atomic batch (Firestore caps a batch at 500 writes):
// one update per moved purchase plus a handful of fixed writes.
export const MERGE_MAX_PURCHASES = 480;

const asIso = (v) => (v && typeof v.toDate === 'function' ? localIso(v.toDate()) : v ? String(v).slice(0, 10) : null);

/**
 * The editable fields where `keep` is blank and `dup` has a value - offered
 * as "fill in from the duplicate" so a merge never loses information. Uses
 * the shared farmerFields mapping, so it means exactly what an edit means.
 */
export function mergeFillCandidates(keep, dup) {
  const keepFields = buildEditableFarmerFields({ fullName: keep.fullName || '', phone: keep.phone || '', fieldValues: farmerToFieldValues(keep) });
  const dupFields = buildEditableFarmerFields({ fullName: dup.fullName || '', phone: dup.phone || '', fieldValues: farmerToFieldValues(dup) });
  const fills = [];
  const blank = (v) => v === null || v === undefined || v === '' || v === 0;
  for (const key of ['dateOfBirth', 'gender', 'email', 'village', 'district', 'farmSize', 'otherCropsOrLivestock', 'avgHarvestKgPerYear']) {
    if (blank(keepFields[key]) && !blank(dupFields[key])) fills.push({ field: key, label: FIELD_LABELS[key] || key, value: dupFields[key] });
  }
  for (const key of ['traditional', 'ktb', 'modern']) {
    if (blank(keepFields.hives[key]) && !blank(dupFields.hives[key])) fills.push({ field: 'hives.' + key, label: FIELD_LABELS['hives.' + key], value: dupFields.hives[key] });
  }
  return fills;
}

/**
 * Merges duplicate record `dup` into `keep` (Backlog 3.4).
 *
 *  - every purchase recorded against dup moves to keep (frn and name
 *    snapshot rewritten, `mergedFromFrn` kept on the purchase as provenance);
 *  - keep's lifetimeStats gain exactly what those purchases contribute, and
 *    dup's are zeroed - the same increment() contract as everywhere else;
 *  - dup is NOT deleted: it becomes status 'merged' with mergedInto, so its
 *    printed card still works (the field app redirects to keep) and its
 *    history stays readable;
 *  - optionally, blank fields on keep are filled from dup;
 *  - farmerEdits entries on both farmers and one adminAudit entry.
 *
 * All in ONE writeBatch: a half-merged pair (purchases moved, totals not)
 * would be worse than either state, so it commits whole or not at all.
 */
export async function mergeFarmers({ keep, dup, dupPurchases, fill = [] }) {
  if (keep.frn === dup.frn) throw new Error('Choose two different farmers.');
  if (dup.status === 'merged') throw new Error(dup.frn + ' has already been merged into ' + dup.mergedInto + '.');
  if (keep.status === 'merged') throw new Error(keep.frn + ' is itself a merged record - merge into ' + keep.mergedInto + ' instead.');
  if (dupPurchases.length > MERGE_MAX_PURCHASES) {
    throw new Error('This record has ' + dupPurchases.length + ' purchases, more than one merge can move at once (' + MERGE_MAX_PURCHASES + '). Contact support.');
  }

  const batch = writeBatch(db);
  let kg = 0;
  let ugx = 0;
  let last = asIso(keep.lifetimeStats?.lastPurchaseAt);
  for (const p of dupPurchases) {
    batch.update(doc(db, 'purchases', p.id), {
      frn: keep.frn,
      farmerNameSnapshot: keep.fullName,
      mergedFromFrn: dup.frn,
      updatedAt: serverTimestamp(),
    });
    // An unmatched purchase never counted towards dup's totals, so it must
    // not count towards keep's either - it moves, still unmatched, and the
    // field app's reconcile screen applies its stats when it's confirmed.
    if (p.frnUnverified) continue;
    kg += Number(p.weightKg) || 0;
    ugx += Number(p.totalUgx) || 0;
    if (p.purchaseDate && (!last || p.purchaseDate > last)) last = p.purchaseDate;
  }

  const keepUpdate = {
    'lifetimeStats.totalKg': increment(kg),
    'lifetimeStats.totalPaidUgx': increment(ugx),
    'lifetimeStats.lastPurchaseAt': last || null,
    mergedFrns: [...(keep.mergedFrns || []), dup.frn],
    updatedAt: serverTimestamp(),
  };
  const keepChanges = [{ field: 'mergedFrns', label: 'Merged in duplicate', from: null, to: dup.frn + ' (' + dupPurchases.length + ' purchases)' }];
  for (const f of fill) {
    keepUpdate[f.field] = f.value;
    keepChanges.push({ field: f.field, label: f.label, from: null, to: f.value });
  }
  batch.update(doc(db, 'farmers', keep.frn), keepUpdate);

  batch.update(doc(db, 'farmers', dup.frn), {
    status: 'merged',
    mergedInto: keep.frn,
    mergedAt: serverTimestamp(),
    mergedBy: currentAdminName(),
    'lifetimeStats.totalKg': 0,
    'lifetimeStats.totalPaidUgx': 0,
    'lifetimeStats.lastPurchaseAt': null,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(collection(db, 'farmerEdits')), farmerEdit({ frn: keep.frn, changes: keepChanges }));
  batch.set(doc(collection(db, 'farmerEdits')), farmerEdit({
    frn: dup.frn,
    changes: [{ field: 'status', label: 'Status', from: dup.status || 'active', to: 'merged into ' + keep.frn }],
  }));
  auditInBatch(batch, {
    action: 'farmer.merge',
    target: keep.frn,
    summary: 'Merged ' + dup.fullName + ' (' + dup.frn + ') into ' + keep.fullName + ' (' + keep.frn + '), moving ' + dupPurchases.length + ' purchase' + (dupPurchases.length === 1 ? '' : 's'),
    details: { keep: keep.frn, dup: dup.frn, purchaseIds: dupPurchases.map((p) => p.id), kgMoved: kg, ugxMoved: ugx, filled: fill.map((f) => f.field) },
  });

  await batch.commit();
  notifyDataChanged();
  return { moved: dupPurchases.length, kg, ugx };
}

/**
 * Likely duplicate pairs for the Data checks screen: the same name in the
 * same district, or the same phone number in a different spelling
 * (0772.. vs +256772..). Merged records are excluded.
 */
export function findLikelyDuplicates(farmers, normalisePhone) {
  const live = farmers.filter((f) => f.status !== 'merged');
  const groups = new Map();
  const add = (key, reason, f) => {
    if (!groups.has(key)) groups.set(key, { reason, farmers: [] });
    groups.get(key).farmers.push(f);
  };
  for (const f of live) {
    if (f.fullNameLower) add('n|' + f.fullNameLower.replace(/\s+/g, ' ').trim() + '|' + String(f.district || '').toLowerCase(), 'Same name and district', f);
    if (f.phone) add('p|' + normalisePhone(f.phone), 'Same phone number', f);
  }
  const seen = new Set();
  return [...groups.values()]
    .filter((g) => g.farmers.length > 1)
    .filter((g) => {
      const sig = g.farmers.map((f) => f.frn).sort().join(',');
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
}

// ------------------------------------------- lifetime totals reconciliation

/**
 * Recomputes every farmer's lifetimeStats from their actual purchases and
 * returns the farmers whose stored totals disagree (Backlog 3.8, Risk
 * Register R38). lifetimeStats is maintained by increment() deltas from
 * several writers and never recomputed, so drift is otherwise invisible.
 *
 * Only matched purchases count, mirroring how the field app applies stats
 * (an frnUnverified purchase contributes nothing until reconciled).
 */
export function computeStatsDrift(farmers, purchases) {
  const sums = new Map();
  for (const p of purchases) {
    if (!p.frn || p.frnUnverified) continue;
    const s = sums.get(p.frn) || { kg: 0, ugx: 0, last: null, count: 0 };
    s.kg += Number(p.weightKg) || 0;
    s.ugx += Number(p.totalUgx) || 0;
    s.count += 1;
    if (p.purchaseDate && (!s.last || p.purchaseDate > s.last)) s.last = p.purchaseDate;
    sums.set(p.frn, s);
  }
  const close = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
  const drift = [];
  for (const f of farmers) {
    const actual = sums.get(f.frn) || { kg: 0, ugx: 0, last: null, count: 0 };
    const stored = f.lifetimeStats || {};
    const storedLast = asIso(stored.lastPurchaseAt);
    if (close(stored.totalKg, actual.kg) && close(stored.totalPaidUgx, actual.ugx) && (storedLast || null) === (actual.last || null)) continue;
    drift.push({ farmer: f, stored: { kg: Number(stored.totalKg) || 0, ugx: Number(stored.totalPaidUgx) || 0, last: storedLast }, actual });
  }
  return drift;
}

/**
 * Corrects drifted totals by applying the DIFFERENCE with increment(), not
 * by overwriting - so an offline purchase whose stats update lands between
 * this check and the write is still counted, rather than erased.
 */
export async function fixStatsDrift(rows) {
  const PER_BATCH = 200; // 2 writes per farmer + 1 audit
  for (let i = 0; i < rows.length; i += PER_BATCH) {
    const batch = writeBatch(db);
    const slice = rows.slice(i, i + PER_BATCH);
    for (const { farmer, stored, actual } of slice) {
      batch.update(doc(db, 'farmers', farmer.frn), {
        'lifetimeStats.totalKg': increment(actual.kg - stored.kg),
        'lifetimeStats.totalPaidUgx': increment(actual.ugx - stored.ugx),
        'lifetimeStats.lastPurchaseAt': actual.last,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, 'farmerEdits')), farmerEdit({
        frn: farmer.frn,
        changes: [
          { field: 'lifetimeStats.totalKg', label: 'Lifetime kg (recalculated)', from: stored.kg, to: actual.kg },
          { field: 'lifetimeStats.totalPaidUgx', label: 'Lifetime paid (recalculated)', from: stored.ugx, to: actual.ugx },
          { field: 'lifetimeStats.lastPurchaseAt', label: 'Last delivery (recalculated)', from: stored.last, to: actual.last },
        ],
      }));
    }
    auditInBatch(batch, {
      action: 'farmer.recalculate',
      target: null,
      summary: 'Recalculated lifetime totals for ' + slice.length + ' farmer' + (slice.length === 1 ? '' : 's') + ' from their purchases',
      details: { frns: slice.map((r) => r.farmer.frn) },
    });
    await batch.commit();
  }
  notifyDataChanged();
}

// ----------------------------------------------------------- staff access

export const fetchStaff = () => fetchCollection('allowedStaff');
export const fetchSignupRequests = () => fetchCollection('signupRequests');

export async function setStaffRole(email, role) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'allowedStaff', email), {
    role: role || null,
    roleUpdatedAt: serverTimestamp(),
    roleUpdatedBy: currentAdminName(),
  });
  auditInBatch(batch, { action: 'staff.role', target: email, summary: (role === 'admin' ? 'Made ' : 'Removed admin role from ') + email + (role === 'admin' ? ' an admin' : ''), details: { role: role || null } });
  await batch.commit();
}

/**
 * Removes an account from the allowlist. Their Firebase Auth account still
 * exists but can no longer read or write any data. A field device that is
 * offline keeps working from its cached approval until it next connects
 * (see docs/Risk-Register.md) - say so wherever this is offered.
 */
export async function revokeStaff(email, role = null) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'allowedStaff', email));
  // The role is kept in the audit entry so "Restore access" can put back
  // exactly what was removed.
  auditInBatch(batch, { action: 'staff.revoke', target: email, summary: 'Revoked access for ' + email, details: { role: role || null } });
  await batch.commit();
  notifyDataChanged();
}

/**
 * Gives a revoked (or never-approved) account its access back: recreates
 * its allowedStaff entry and, if the person has a sign-in request waiting,
 * marks it approved. The phone picks it up on "Check Again" or its next
 * online start. Audited as staff.restore.
 */
export async function restoreStaffAccess(email, { role = null, reason = '' } = {}) {
  const clean = String(email).trim();
  const batch = writeBatch(db);
  batch.set(doc(db, 'allowedStaff', clean), {
    addedAt: serverTimestamp(),
    addedBy: currentAdminName(),
    restored: true,
    ...(role === 'admin' ? { role: 'admin' } : {}),
  });
  auditInBatch(batch, { action: 'staff.restore', target: clean, summary: 'Restored access for ' + clean + (role === 'admin' ? ' (admin)' : '') + (reason ? ' - ' + reason : ''), details: { role } });
  try {
    await batch.commit();
  } catch (err) {
    if (err.code === 'permission-denied') throw new Error(clean + ' already has access.');
    throw err;
  }
  // Close any waiting request so it doesn't linger in "Waiting for approval".
  try {
    const req = await getDoc(doc(db, 'signupRequests', clean));
    if (req.exists() && req.data().status === 'pending') {
      await updateDoc(doc(db, 'signupRequests', clean), { status: 'approved', resolvedAt: serverTimestamp(), resolvedBy: currentAdminName() });
    }
  } catch (err) {
    console.warn('[Malaika Admin] Restored access, but could not close the sign-in request:', err);
  }
  notifyDataChanged();
}

/** Mirrors the field app's adminApprovals.js approveRequest/rejectRequest. */
export async function resolveSignupRequest(request, approve) {
  if (approve) {
    try {
      await setDoc(doc(db, 'allowedStaff', request.email), { addedAt: serverTimestamp() });
    } catch (err) {
      if (err.code !== 'permission-denied') throw err; // already on the allowlist
    }
  }
  await updateDoc(doc(db, 'signupRequests', request.id), {
    status: approve ? 'approved' : 'rejected',
    resolvedAt: serverTimestamp(),
    resolvedBy: currentAdminName(),
  });
  await writeAudit({ action: approve ? 'staff.approve' : 'staff.reject', target: request.email, summary: (approve ? 'Approved ' : 'Rejected ') + 'sign-in request from ' + request.email });
  notifyDataChanged();
}

/**
 * Sets up a new field office end to end - the same three pieces the field
 * app's Add Office creates (public/js/screens/addOffice.js), using the same
 * shared identity rules (officeAccounts.js) so the office can sign in on a
 * phone straight away: the Auth account (code as password, padded), the
 * fieldOffices entry that puts it in the sign-in picker, and the
 * allowedStaff entry that grants access.
 */
export async function createFieldOffice({ name, code }) {
  const officeId = officeSlug(name);
  if (!officeId) throw new Error('Enter an office name using letters or numbers.');
  if (!String(code).trim()) throw new Error('Enter a sign-in code.');
  const offices = await fetchCollection('fieldOffices');
  if (offices.some((o) => o.id === officeId)) throw new Error('There is already an office called “' + name + '” (' + officeId + ').');

  const email = officeIdToEmail(officeId);
  const account = await createAuthAccount(email, officeCodeToPassword(String(code).trim()));
  if (account.exists) throw new Error('A sign-in account for “' + officeId + '” already exists. Choose another name, or reset that office in the Firebase Console.');

  const nextOrder = offices.reduce((m, o) => Math.max(m, Number(o.order) || 0), 0) + 1;
  const batch = writeBatch(db);
  batch.set(doc(db, 'fieldOffices', officeId), { label: name.trim(), order: nextOrder, active: true, createdBy: currentAdminName(), createdAt: serverTimestamp() });
  batch.set(doc(db, 'allowedStaff', email), { addedAt: serverTimestamp(), addedBy: currentAdminName(), displayName: name.trim() });
  auditInBatch(batch, { action: 'staff.addOffice', target: email, summary: 'Added field office ' + name.trim() + ' (' + officeId + ')' });
  await batch.commit();
  return { officeId };
}

/**
 * Gives a person a management (or plain staff) account: an individual
 * email + temporary password, plus their allowedStaff entry. If the email
 * already has an Auth account, access is granted without touching its
 * password. They should change the temporary password after first sign-in
 * (Firebase Console -> Authentication, or the "forgot password" email).
 */
export async function createPersonAccount({ email, password, displayName, admin }) {
  const clean = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('Enter a valid email address.');
  const account = await createAuthAccount(clean, password);
  const batch = writeBatch(db);
  batch.set(doc(db, 'allowedStaff', clean), {
    addedAt: serverTimestamp(),
    addedBy: currentAdminName(),
    ...(displayName ? { displayName: displayName.trim() } : {}),
    ...(admin ? { role: 'admin' } : {}),
  });
  auditInBatch(batch, { action: 'staff.addPerson', target: clean, summary: 'Gave ' + clean + (admin ? ' admin' : ' staff') + ' access' + (account.exists ? ' (existing account)' : ' with a new account') });
  try {
    await batch.commit();
  } catch (err) {
    // allowedStaff is create-only for another account's existing doc
    if (err.code === 'permission-denied') throw new Error(clean + ' already has access. Use Make admin / Remove admin on their row instead.');
    throw err;
  }
  return { existed: !!account.exists };
}
