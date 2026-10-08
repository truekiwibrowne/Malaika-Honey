import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName } from './auth.js';
import { auditInBatch, notifyDataChanged } from './audit.js';
import { fetchAllFarmers, fetchAllPurchases, loadDistrictResolver, computeStatsDrift, findLikelyDuplicates, fetchCollection } from './data.js';
import { officeIdToEmail } from '../shared/officeAccounts.js';
import { loadCollection } from './refdata.js';
import { normalisePhone } from './importer.js';
import { loadUgandaGeo, makeDistrictResolver } from './geo.js';

/**
 * Everything Data checks reports, computed in one place so the sidebar
 * badge and the Data checks screen can never disagree about the count.
 *
 * An "open issue" is something an admin must act on: fix the data, or -
 * for a possible duplicate only - look at it and close it as "not a
 * duplicate". Purchases without a receipt number are reported for
 * information but don't count: there's often nothing to fix.
 */

export async function fetchDismissals() {
  try {
    const snap = await getDocs(collection(db, 'dataCheckDismissals'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return []; // rules not deployed yet - behave as if nothing was dismissed
  }
}

export const duplicateKey = (group) => 'dup-' + group.farmers.map((f) => f.frn).sort().join('-');

export function computeIssues({ farmers, purchases, districtEntries, resolveDistrict, autoResolve, dismissals, offices = [], staff = null }) {
  const live = farmers.filter((f) => f.status !== 'merged');
  const dismissed = new Map(dismissals.map((d) => [d.id, d]));

  const drift = computeStatsDrift(farmers, purchases);

  const allDupes = findLikelyDuplicates(farmers, normalisePhone);
  const duplicates = allDupes.filter((g) => !dismissed.has(duplicateKey(g)));
  const closedDuplicates = allDupes.filter((g) => dismissed.has(duplicateKey(g))).map((g) => ({ group: g, dismissal: dismissed.get(duplicateKey(g)) }));

  const unmatched = purchases.filter((p) => p.frnUnverified);

  // Farmers whose district text can't be placed - grouped by that text.
  const unplacedMap = new Map();
  const noDistrict = [];
  for (const f of live) {
    if (!f.district) noDistrict.push(f);
    else if (!resolveDistrict(f.district)?.region) unplacedMap.set(f.district, [...(unplacedMap.get(f.district) || []), f]);
  }
  const unplaced = [...unplacedMap.entries()].map(([district, list]) => ({ district, farmers: list }));

  // Districts on the New Farmer list left on "auto" region where auto
  // can't find them: every farmer registered there would land outside
  // every region. ("Other" is the free-text escape hatch, not a district.)
  const unresolvedDistricts = districtEntries.filter((d) => {
    if (d.active === false || d.id === 'Other') return false;
    const auto = autoResolve(d.label || d.id);
    const region = d.region || auto?.region;
    const hasPos = (typeof d.lat === 'number' && typeof d.lng === 'number') || (auto && auto.lat != null);
    return !region || !hasPos;
  });

  const noReceipt = purchases.filter((p) => !String(p.receiptNo || '').trim());

  // Offices staff can pick on the phone's sign-in screen but that have no
  // access - everyone there is stuck on "Approval Needed". (Skipped if the
  // staff list couldn't be read, rather than flagging every office.)
  const allowed = staff ? new Set(staff.map((s) => s.id.trim().toLowerCase())) : null;
  const lockedOffices = allowed
    ? offices.filter((o) => o.active !== false && !allowed.has(officeIdToEmail(o.id).toLowerCase()))
    : [];

  const openCount = drift.length + duplicates.length + unmatched.length + unplaced.length + noDistrict.length + unresolvedDistricts.length + lockedOffices.length;
  return { live, drift, duplicates, closedDuplicates, unmatched, unplaced, noDistrict, unresolvedDistricts, noReceipt, lockedOffices, openCount };
}

/** Fetches everything and computes the issues. */
export async function loadIssues() {
  const [farmers, purchases, geoCtx, districts, dismissals, offices, staff, requests] = await Promise.all([
    fetchAllFarmers(),
    fetchAllPurchases(),
    loadDistrictResolver(),
    loadCollection('districts'),
    fetchDismissals(),
    fetchCollection('fieldOffices').catch(() => []),
    fetchCollection('allowedStaff').catch(() => null),
    fetchCollection('signupRequests').catch(() => []),
  ]);
  const autoResolve = makeDistrictResolver(await loadUgandaGeo(), []);
  return {
    farmers,
    purchases,
    pendingRequests: requests.filter((r) => r.status === 'pending'),
    ...computeIssues({ farmers, purchases, districtEntries: districts.entries, resolveDistrict: geoCtx.resolveDistrict, autoResolve, dismissals, offices, staff }),
  };
}

// --------------------------------------------------------------- badge

let badgeCount = null;
const listeners = new Set();
let approvalsCount = null;
const approvalListeners = new Set();

export function onChecksCount(fn) {
  listeners.add(fn);
  if (badgeCount !== null) fn(badgeCount);
  return () => listeners.delete(fn);
}

export function setChecksCount(n) {
  badgeCount = n;
  listeners.forEach((fn) => fn(n));
}

/** Sign-in requests waiting for an admin - the badge on Settings. */
export function onApprovalsCount(fn) {
  approvalListeners.add(fn);
  if (approvalsCount !== null) fn(approvalsCount);
  return () => approvalListeners.delete(fn);
}

export function setApprovalsCount(n) {
  approvalsCount = n;
  approvalListeners.forEach((fn) => fn(n));
}

let refreshing = null;
/**
 * Recounts open issues for the sidebar badge. Called after sign-in and
 * after anything that can change the count (merge, import, settings,
 * corrections). Never throws - a badge isn't worth an error message.
 */
export function refreshChecksBadge() {
  if (!refreshing) {
    refreshing = loadIssues()
      .then((r) => {
        setChecksCount(r.openCount);
        setApprovalsCount(r.pendingRequests.length);
      })
      .catch((err) => console.warn('[Malaika Admin] Could not count data checks:', err))
      .finally(() => (refreshing = null));
  }
  return refreshing;
}

// ---------------------------------------------------------- dismissals

export async function closeDuplicate(group, note) {
  const id = duplicateKey(group);
  const frns = group.farmers.map((f) => f.frn).sort();
  const batch = writeBatch(db);
  batch.set(doc(db, 'dataCheckDismissals', id), {
    kind: 'duplicate',
    frns,
    reason: group.reason,
    note: note || null,
    by: currentAdminName(),
    at: serverTimestamp(),
    atLocal: new Date().toISOString(),
  });
  auditInBatch(batch, { action: 'checks.close', target: frns.join(', '), summary: 'Closed possible duplicate ' + frns.join(' / ') + ' as not the same person' + (note ? ': ' + note : ''), details: { frns } });
  await batch.commit();
  notifyDataChanged();
}

export async function reopenCheck(dismissal) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'dataCheckDismissals', dismissal.id));
  auditInBatch(batch, { action: 'checks.reopen', target: (dismissal.frns || []).join(', '), summary: 'Re-opened possible duplicate ' + (dismissal.frns || []).join(' / ') });
  await batch.commit();
  notifyDataChanged();
}
