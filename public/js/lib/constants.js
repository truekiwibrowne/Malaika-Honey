export const APP_VERSION = '0.6.4';

// One shared code per field office is the primary sign-in method now
// (simpler for staff who don't read/speak English well - see
// docs/Database-Schema.md "Staff accounts"). Phone+password and Google
// Sign-In are both kept fully working in the codebase (not deleted) but
// hidden from the login screen - flip either flag back to true to
// restore it, with no rewrite needed.
export const PHONE_SIGNIN_ENABLED = false;
export const GOOGLE_SIGNIN_ENABLED = false;

export const PRODUCTS = [
  { id: 'honey', label: 'Honey' },
  { id: 'beeWax', label: 'Bee Wax' },
  { id: 'pollen', label: 'Pollen' },
  { id: 'propolis', label: 'Propolis' },
  { id: 'beeVenom', label: 'Bee Venom' },
];

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'mobileMoney', label: 'Mobile Money' },
  { id: 'bank', label: 'Bank' },
];

export function formatUgx(amount) {
  const value = Math.round(Number(amount) || 0);
  return 'UGX ' + value.toLocaleString('en-UG');
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function productLabel(productId) {
  return PRODUCTS.find((p) => p.id === productId)?.label || productId;
}

export function paymentLabel(methodId) {
  return PAYMENT_METHODS.find((p) => p.id === methodId)?.label || methodId;
}
