import {
  collection,
  getDocs,
  getDocsFromCache,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../lib/firebase.js';
import { el, mount, toast } from '../lib/ui.js';
import { formatDate } from '../lib/constants.js';
import { currentDisplayName, phoneFromSyntheticEmail } from '../lib/auth.js';
import { iconEl } from '../lib/icons.js';

/**
 * Signup requests are created client-side by auth.js's recordSignupRequest
 * whenever a signed-in-but-unapproved user is turned away - see
 * docs/Database-Schema.md "signupRequests/{email}". Fetched whole and
 * filtered/sorted client-side rather than via a Firestore query, same
 * pattern as referenceData.js, since this collection is always small.
 */
async function getPendingRequests() {
  const ref = collection(db, 'signupRequests');
  const snap = await (navigator.onLine ? getDocs(ref) : getDocsFromCache(ref));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (a.requestedAt?.seconds ?? 0) - (b.requestedAt?.seconds ?? 0));
}

/**
 * Firestore rules only allow an admin to `create` an allowedStaff
 * document, never `update` one (revoking access or changing role stays
 * Console-only, by design - see docs/Database-Schema.md "Staff
 * accounts"). If this email already has a document - e.g. an admin
 * bootstrapped directly in Console per docs/Config-Management.md, who
 * still has a stale pending request left over from their very first
 * sign-in attempt - a plain setDoc would be an "update" against an
 * existing document and get rejected. Skip the write entirely in that
 * case; they already have access, so there's nothing to grant.
 */
async function approveRequest(request) {
  const staffRef = doc(db, 'allowedStaff', request.email);
  const existing = await getDoc(staffRef);
  if (!existing.exists()) {
    await setDoc(staffRef, { addedAt: serverTimestamp() });
  }
  await updateDoc(doc(db, 'signupRequests', request.id), {
    status: 'approved',
    resolvedAt: serverTimestamp(),
    resolvedBy: currentDisplayName(),
  });
}

async function rejectRequest(request) {
  await updateDoc(doc(db, 'signupRequests', request.id), {
    status: 'rejected',
    resolvedAt: serverTimestamp(),
    resolvedBy: currentDisplayName(),
  });
}

function renderRequestRow(request, onResolved) {
  const approveBtn = el('button', { type: 'button', class: 'btn btn-green' }, [iconEl('check'), ' Approve']);
  const rejectBtn = el('button', { type: 'button', class: 'btn btn-outline' }, 'Reject');

  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    try {
      await approveRequest(request);
      toast(request.displayName + ' approved.');
      onResolved();
    } catch (err) {
      console.error(err);
      toast('Could not approve this request. ' + (err.message || 'Try again.'));
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
    }
  });

  rejectBtn.addEventListener('click', async () => {
    if (!window.confirm('Reject sign-in access for ' + request.displayName + ' (' + request.email + ')?')) return;
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    try {
      await rejectRequest(request);
      toast('Request rejected.');
      onResolved();
    } catch (err) {
      console.error(err);
      toast('Could not reject this request. ' + (err.message || 'Try again.'));
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
    }
  });

  return el('div', { class: 'card' }, [
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, 'Name'),
      el('span', {}, request.displayName),
    ]),
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, phoneFromSyntheticEmail(request.email) ? 'Phone' : 'Email'),
      el('span', {}, phoneFromSyntheticEmail(request.email) || request.email),
    ]),
    el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
      el('span', { class: 'sub' }, 'Requested'),
      el('span', {}, formatDate(request.requestedAt ? new Date(request.requestedAt.seconds * 1000).toISOString().slice(0, 10) : null)),
    ]),
    el('div', { class: 'btn-row' }, [approveBtn, rejectBtn]),
  ]);
}

export async function renderAdminApprovals(root) {
  mount(root, el('p', { class: 'hint' }, 'Loading sign-in requests…'));

  async function load() {
    let requests;
    try {
      requests = await getPendingRequests();
    } catch (err) {
      console.error(err);
      mount(root, el('div', { class: 'empty-state' }, 'Could not load sign-in requests. Check your connection and try again.'));
      return;
    }

    if (!requests.length) {
      mount(
        root,
        el('div', { class: 'centered-screen' }, [
          el('h1', { style: 'text-align:center' }, 'Approve Requests'),
          el('div', { class: 'confirm-icon' }, [iconEl('check')]),
          el('div', { class: 'empty-state' }, 'No pending sign-in requests.'),
        ])
      );
      return;
    }

    mount(
      root,
      el('h1', {}, 'Approve Requests'),
      el('p', { class: 'welcome' }, requests.length + ' staff sign-in' + (requests.length === 1 ? '' : 's') + ' waiting for approval.'),
      el('hr', { class: 'hr' }),
      ...requests.map((r) => renderRequestRow(r, load))
    );
  }

  await load();
}
