import { collection, getDocs, getDocsFromCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { getCountryCode } from './country.js';
import {
  PRODUCTS_FALLBACK,
  GRADES_FALLBACK,
  FIELD_OFFICES_FALLBACK,
  PAYMENT_METHODS_FALLBACK,
  FARM_SIZES_FALLBACK,
  DISTRICTS_FALLBACK,
  NEW_FARMER_FIELDS_FALLBACK,
  CROPS_LIVESTOCK_FALLBACK,
  VILLAGES_FALLBACK,
} from './referenceDefaults.js';

/**
 * Generic loader for small admin-editable reference collections
 * (products, grades, paymentMethods, farmSizes, districts, newFarmerFields).
 * Collections are fetched whole (a few dozen docs at most) and filtered/
 * sorted client-side, rather than via a Firestore query with `where`/
 * `orderBy` - this avoids needing new composite indexes for six
 * collections that rarely change.
 *
 * Falls back to a hardcoded array (today's exact values) whenever the
 * live fetch is empty or fails - covers both a fresh install with zero
 * network activity (nothing cached yet) and a collection an admin simply
 * hasn't populated yet, since these collections ship empty until someone
 * edits them via Firebase Console (see docs/Config-Management.md).
 *
 * When offline, reads from cache only (getDocsFromCache) rather than a
 * plain getDocs, which still tries the server first and can take several
 * seconds to time out and fall back on a cold start with no signal -
 * making the New Farmer/Buy Produce forms feel stuck instead of just
 * using what's already cached.
 */
async function getOptionList(collectionName, fallback) {
  try {
    const ref = collection(db, collectionName);
    const snap = navigator.onLine ? await getDocs(ref) : await getDocsFromCache(ref);
    const docs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => d.active !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return docs.length ? docs : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Unlike every other reference collection, this one must work with NO
 * sign-in at all (see firestore.rules) - it's read from the Login
 * screen before anyone is authenticated, to populate the office picker.
 */
export const getFieldOffices = () => getOptionList('fieldOffices', FIELD_OFFICES_FALLBACK);

export const getProducts = () => getOptionList('products', PRODUCTS_FALLBACK);
export const getGrades = () => getOptionList('grades', GRADES_FALLBACK);
export const getPaymentMethods = () => getOptionList('paymentMethods', PAYMENT_METHODS_FALLBACK);
export const getFarmSizes = () => getOptionList('farmSizes', FARM_SIZES_FALLBACK);
export const getNewFarmerFields = () => getOptionList('newFarmerFields', NEW_FARMER_FIELDS_FALLBACK);
export const getCropsLivestock = () => getOptionList('cropsLivestock', CROPS_LIVESTOCK_FALLBACK);
export const getVillages = () => getOptionList('villages', VILLAGES_FALLBACK);

export async function getDistricts() {
  const countryCode = getCountryCode();
  const all = await getOptionList('districts', DISTRICTS_FALLBACK);
  const filtered = all.filter((d) => !d.country || d.country === countryCode);
  return filtered.length ? filtered : all;
}
