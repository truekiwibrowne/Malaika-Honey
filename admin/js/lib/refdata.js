import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName } from './auth.js';
import { auditInBatch } from './audit.js';
import {
  PRODUCTS_FALLBACK,
  GRADES_FALLBACK,
  FIELD_OFFICES_FALLBACK,
  PAYMENT_METHODS_FALLBACK,
  FARM_SIZES_FALLBACK,
  DISTRICTS_FALLBACK,
  NEW_FARMER_FIELDS_FALLBACK,
} from '../shared/referenceDefaults.js';

/**
 * The admin-editable reference collections behind Settings (Backlog 2.16).
 * The field app reads these (public/js/lib/referenceData.js) to build its
 * dropdowns and the New Farmer form.
 *
 * THE trap this module exists to avoid: the field app's fallback list is
 * all-or-nothing per collection. While a collection is empty the field app
 * uses the built-in defaults; the moment one document exists, it uses ONLY
 * the documents. So adding "Royal Jelly" to an empty `products` collection
 * would silently remove Honey, Bee Wax and the rest from every phone.
 * Therefore the first save to an empty collection always writes the full
 * default list along with the change (see saveEntries) - the editor shows
 * the defaults as if they were already saved, and they become real on the
 * first save.
 *
 * Entries are never deleted, only deactivated: old farmers and purchases
 * still carry their ids.
 */

export const COLLECTIONS = {
  products: {
    title: 'Products',
    help: 'What buying centres can purchase. Shown on the field app’s Buy Produce screen.',
    defaults: PRODUCTS_FALLBACK,
  },
  grades: {
    title: 'Grades',
    help: 'Quality grades staff choose from when recording a purchase.',
    defaults: GRADES_FALLBACK,
  },
  paymentMethods: {
    title: 'Payment methods',
    help: 'How farmers can be paid.',
    defaults: PAYMENT_METHODS_FALLBACK,
  },
  farmSizes: {
    title: 'Farm sizes',
    help: 'Farm size options on the New Farmer form.',
    defaults: FARM_SIZES_FALLBACK,
  },
  districts: {
    title: 'Districts',
    help: 'District list on the New Farmer form. Region and map position are optional - districts in the 2020 UBOS list are placed automatically; set them for any district the map shows as unrecognised.',
    defaults: DISTRICTS_FALLBACK,
    // A district's id IS its name (as in the defaults): the New Farmer form
    // stores the option id on the farmer, and reports group by that text.
    idFromLabel: (label) => label.trim(),
    extra: ['region', 'lat', 'lng', 'country'],
  },
  fieldOffices: {
    title: 'Field offices',
    help: 'Offices on the field app’s sign-in screen. Rename, reorder or hide an office here. A new office also needs its sign-in code, so it is added from the field app (Home -> Add Office).',
    defaults: FIELD_OFFICES_FALLBACK,
    noCreate: true,
  },
  newFarmerFields: {
    title: 'New Farmer form',
    help: 'The questions on the field app’s New Farmer form, in order. Full name and phone are always asked and aren’t listed here.',
    defaults: NEW_FARMER_FIELDS_FALLBACK,
    extra: ['section', 'type', 'required', 'placeholder', 'options', 'optionsSource'],
  },
};

/** camelCase slug from a label: "Royal Jelly" -> "royalJelly". */
export function slugFromLabel(label) {
  const words = label.trim().replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
}

/**
 * Loads a collection for editing. `seeded` is false while the collection is
 * still empty in Firestore, in which case `entries` are the defaults the
 * field app is currently showing.
 */
export async function loadCollection(name) {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const seeded = docs.length > 0;
  const entries = (seeded ? docs : COLLECTIONS[name].defaults.map((d) => ({ active: true, ...d })))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { seeded, entries };
}

/**
 * Saves `changed` entries ({ id, ...fields }). When the collection isn't
 * seeded yet, every default not being changed is written too, in the same
 * batch, for the reason at the top of this file.
 */
export async function saveEntries(name, { seeded, entries }, changed, summary) {
  const toWrite = new Map();
  if (!seeded) for (const e of entries) toWrite.set(e.id, e);
  for (const e of changed) toWrite.set(e.id, { ...(toWrite.get(e.id) || {}), ...e });

  const batch = writeBatch(db);
  for (const [id, e] of toWrite) {
    const { id: _ignored, ...fields } = e;
    for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
    batch.set(doc(db, name, id), { ...fields, updatedAt: serverTimestamp(), updatedBy: currentAdminName() }, { merge: true });
  }
  auditInBatch(batch, {
    action: 'settings.update',
    target: name,
    summary: COLLECTIONS[name].title + ': ' + summary + (seeded ? '' : ' (default list saved for the first time)'),
    details: { ids: changed.map((e) => e.id), seededDefaults: !seeded },
  });
  await batch.commit();
}
