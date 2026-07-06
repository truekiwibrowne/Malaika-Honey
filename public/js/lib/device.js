import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';

const CODE_KEY = 'malaika_device_code';
const SEQ_KEY = 'malaika_device_frn_seq';
const REGISTERED_KEY = 'malaika_device_registered';
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 3;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Every phone gets a short random code, generated once and kept forever in
 * localStorage. It's embedded in every FRN this device mints (see
 * db.js createFarmer), which is what lets FRN minting happen instantly and
 * fully offline - two phones can never generate the same FRN without
 * needing to ask a server first, because their codes differ.
 */
export function getDeviceCode() {
  let code = localStorage.getItem(CODE_KEY);
  if (!code) {
    code = generateCode();
    localStorage.setItem(CODE_KEY, code);
  }
  if (!localStorage.getItem(REGISTERED_KEY)) {
    registerDeviceCodeBestEffort(code);
  }
  return code;
}

/**
 * Next FRN sequence number for this device, incremented synchronously and
 * durably in localStorage - no network round-trip, so it works offline.
 */
export function nextLocalSequence() {
  const current = Number(localStorage.getItem(SEQ_KEY)) || 0;
  const next = current + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

/**
 * Best-effort: record this device's code in Firestore so it's visible for
 * reference (see docs/Database-Schema.md "devices/{deviceCode}"). This is
 * NOT required for FRN minting to work and is never awaited by callers.
 * Retried on every app load until it succeeds once (tracked via
 * REGISTERED_KEY) - covers the case where the first attempt happened
 * while offline. If it ultimately fails because another device already
 * claimed the same random code (security rules only allow create, not
 * update), that collision is not auto-recovered - see Risk-Register.
 */
function registerDeviceCodeBestEffort(code) {
  setDoc(doc(db, 'devices', code), {
    deviceCode: code,
    firstSeenAt: serverTimestamp(),
    userAgent: navigator.userAgent,
  })
    .then(() => localStorage.setItem(REGISTERED_KEY, 'true'))
    .catch((err) => {
      console.warn('[Malaika Honey] Could not register device code (will retry next load):', err.message);
    });
}
