import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName, currentAdminEmail } from './auth.js';

/**
 * `adminAudit` - the append-only record of management actions that aren't a
 * single farmer or purchase edit (those keep their own farmerEdits /
 * purchaseEdits trails). Imports, merges, deactivations, settings and staff
 * changes all land here, so "who changed the price list?" or "which import
 * added these farmers?" always has an answer. Rules forbid update/delete.
 *
 * `action` is a short dotted verb ('import.farmers', 'farmer.merge',
 * 'settings.update', 'staff.revoke', ...); `target` names what it acted on;
 * `summary` is the one human-readable line shown in Settings -> Activity.
 */
function entry({ action, target = null, summary = '', details = {} }) {
  return {
    schemaVersion: 1,
    action,
    target,
    summary,
    details,
    by: currentAdminName(),
    byEmail: currentAdminEmail(),
    at: serverTimestamp(),
    atLocal: new Date().toISOString(),
  };
}

/** Adds an audit entry to an existing writeBatch/transaction so it commits atomically with the change. */
export function auditInBatch(batch, fields) {
  const ref = doc(collection(db, 'adminAudit'));
  batch.set(ref, entry(fields));
  return ref.id;
}

/** Standalone audit write, for actions that aren't a single batch (e.g. a multi-chunk import). */
export async function writeAudit(fields) {
  const ref = doc(collection(db, 'adminAudit'));
  await setDoc(ref, entry(fields));
  return ref.id;
}

export async function fetchAudit(max = 200) {
  const snap = await getDocs(query(collection(db, 'adminAudit'), orderBy('atLocal', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Tells the app that farmer/purchase/settings data changed, so anything
 * derived from it - the Data checks badge in the sidebar - recounts.
 */
export function notifyDataChanged() {
  window.dispatchEvent(new Event('mh:data-changed'));
}
