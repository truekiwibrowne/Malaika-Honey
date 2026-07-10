import {
  collection,
  getDocs,
  getDocsFromCache,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../lib/firebase.js';
import { el, mount, toast } from '../lib/ui.js';
import { formatDate } from '../lib/constants.js';
import { currentDisplayName, syntheticEmailKind, stripSyntheticDomain } from '../lib/auth.js';
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
 * sign-in attempt - a plain setDoc is an "update" against an existing
 * document and gets rejected. There's no way to check existence first
 * either: allowedStaff's `get` rule only allows reading your OWN
 * document, not another account's, even as an admin. So just attempt the
 * write and treat a permission-denied specifically here as "already
 * exists, nothing to grant" rather than a real failure - isAdmin() is
 * already required to reach this function at all, so a create-rule
 * rejection can only mean the document was already there.
 */
async function approveRequest(request) {
  try {
    await setDoc(doc(db, 'allowedStaff', request.email), { addedAt: serverTimestamp() });
  } catch (err) {
    if (err.code !== 'permission-denied') throw err;
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

  const kind = syntheticEmailKind(request.email);
  const identityLabelText = kind === 'office' ? 'Office' : kind === 'phone' ? 'Phone' : 'Email';
  const identityValue = kind ? stripSyntheticDomain(request.email) : request.email;

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
      el('span', { class: 'sub' }, identityLabelText),
      el('span', {}, identityValue),
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
