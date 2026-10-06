/**
 * Pure farmer field-mapping and diffing logic - deliberately free of any
 * Firebase import so BOTH apps can use it:
 *
 *   - the field app (public/js/lib/db.js)
 *   - the admin app (admin/, which gets a copy at deploy time - see
 *     netlify.toml's copy step and docs/System-Architecture.md)
 *
 * This lives on its own precisely so the two apps can never disagree about
 * how a form value maps onto the stored shape, or about what counts as a
 * change. Both write `farmerEdits` audit records built from diffFarmerFields
 * below, and drift here would silently corrupt that audit trail.
 */


// Field ids from the newFarmerFields schema (see referenceData.js) that map
// onto an existing top-level farmers/{frn} field, exactly as before this
// form became schema-driven - so Farmer Profile/Card/History (which read
// these same top-level fields) need no changes. Anything else - a
// genuinely new field an admin adds later - is preserved under
// `customFields` instead of being silently dropped, though it isn't yet
// surfaced anywhere in the UI (see docs/Backlog.md).
const KNOWN_FIELD_IDS = [
  'dateOfBirth', 'gender', 'email', 'village', 'district', 'farmSize',
  'hivesTraditional', 'hivesKtb', 'hivesModern', 'otherCropsOrLivestock',
  'avgHarvestKgPerYear', 'usesChemicals', 'wantsTraining',
  'farmLocation', 'cropsLivestock',
];

/**
 * Farm GPS as stored: { lat, lng } rounded to ~10 cm, or null. Accepts the
 * picker's object or anything with numeric lat/lng; rejects junk rather
 * than storing half a coordinate.
 */
function normaliseLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/**
 * Crops & livestock as stored: { itemId: quantity } where quantity is a
 * positive number, or true for "has it, amount not given". Unticked items
 * are simply absent, so the map only lists what the farmer has.
 */
function normaliseCrops(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [id, v] of Object.entries(value)) {
    if (v === true || v === 'true') out[id] = true;
    else if (Number(v) > 0) out[id] = Number(v);
  }
  return out;
}

/**
 * Human-readable names for the editable farmer fields, used only to make
 * `farmerEdits` audit records readable on their own (see updateFarmer) -
 * the future desktop app shouldn't have to join against the
 * `newFarmerFields` schema just to render an edit history. Anything not
 * listed (an admin-added custom field) falls back to its raw key.
 */
export const FIELD_LABELS = {
  fullName: 'Full Name',
  phone: 'Phone Number',
  dateOfBirth: 'Date of Birth',
  gender: 'Gender',
  email: 'Email Address',
  village: 'Village',
  district: 'District',
  farmSize: 'Farm Size',
  'hives.traditional': 'Traditional Hives',
  'hives.ktb': 'KTB Hives',
  'hives.modern': 'Modern Hives',
  otherCropsOrLivestock: 'Other Crops or Livestock',
  avgHarvestKgPerYear: 'Average Honey Harvest',
  usesChemicals: 'Uses chemicals/pesticides?',
  wantsTraining: 'Interested in training?',
  'farmLocation.lat': 'Farm latitude',
  'farmLocation.lng': 'Farm longitude',
};

/**
 * The subset of a farmer document that staff can actually edit, built from
 * a flat `{ fieldId: rawValue }` map straight off the form (see
 * farmerForm.js). Shared by createFarmer and updateFarmer so the two can
 * never disagree about how a form value maps onto the stored shape -
 * fields the form never touches (frn, registeredBy/At, lifetimeStats,
 * status, ...) are deliberately NOT in here, so an edit can't clobber them.
 */
export function buildEditableFarmerFields({ fullName, phone, fieldValues = {} }) {
  const customFields = {};
  for (const [fieldId, value] of Object.entries(fieldValues)) {
    if (!KNOWN_FIELD_IDS.includes(fieldId)) customFields[fieldId] = value;
  }

  return {
    fullName,
    fullNameLower: fullName.trim().toLowerCase(),
    phone,
    dateOfBirth: fieldValues.dateOfBirth || null,
    gender: fieldValues.gender || null,
    email: fieldValues.email || null,
    village: fieldValues.village || '',
    district: fieldValues.district || '',
    farmSize: fieldValues.farmSize || null,
    hives: {
      traditional: Number(fieldValues.hivesTraditional) || 0,
      ktb: Number(fieldValues.hivesKtb) || 0,
      modern: Number(fieldValues.hivesModern) || 0,
    },
    otherCropsOrLivestock: fieldValues.otherCropsOrLivestock || '',
    avgHarvestKgPerYear: Number(fieldValues.avgHarvestKgPerYear) || 0,
    usesChemicals: fieldValues.usesChemicals === 'yes',
    wantsTraining: fieldValues.wantsTraining === 'yes',
    farmLocation: normaliseLocation(fieldValues.farmLocation),
    cropsLivestock: normaliseCrops(fieldValues.cropsLivestock),
    customFields,
  };
}

/**
 * Inverse of buildEditableFarmerFields: turns a stored farmer document
 * back into the flat `{ fieldId: value }` shape the form works in, so Edit
 * Farmer can prefill every control. Booleans become the 'yes'/'no' ids the
 * toggle chips use; missing values become '' rather than undefined so the
 * inputs render empty instead of "undefined".
 */
export function farmerToFieldValues(farmer) {
  const hives = farmer.hives || {};
  return {
    dateOfBirth: farmer.dateOfBirth || '',
    gender: farmer.gender || '',
    email: farmer.email || '',
    village: farmer.village || '',
    district: farmer.district || '',
    farmSize: farmer.farmSize || '',
    hivesTraditional: hives.traditional ?? '',
    hivesKtb: hives.ktb ?? '',
    hivesModern: hives.modern ?? '',
    otherCropsOrLivestock: farmer.otherCropsOrLivestock || '',
    avgHarvestKgPerYear: farmer.avgHarvestKgPerYear ?? '',
    usesChemicals: farmer.usesChemicals ? 'yes' : 'no',
    wantsTraining: farmer.wantsTraining ? 'yes' : 'no',
    farmLocation: farmer.farmLocation || null,
    cropsLivestock: farmer.cropsLivestock || {},
    ...(farmer.customFields || {}),
  };
}

/** Flattens the editable field set to `{ 'dotted.key': value }` for diffing. */
function flattenForDiff(fields) {
  const flat = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'fullNameLower') continue; // derived from fullName, not its own edit
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        flat[key + '.' + subKey] = subValue;
      }
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

/** Field-by-field diff of two editable field sets, as audit-log entries. */
export function diffFarmerFields(before, after) {
  const flatBefore = flattenForDiff(before);
  const flatAfter = flattenForDiff(after);
  const keys = new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]);
  const changes = [];

  for (const key of keys) {
    const from = flatBefore[key] ?? null;
    const to = flatAfter[key] ?? null;
    // Compared as strings so 0 vs '0' or null vs '' don't register as
    // edits - staff retyping the same value must not create audit noise.
    if (String(from ?? '') === String(to ?? '')) continue;
    const label = FIELD_LABELS[key] || (key.startsWith('cropsLivestock.') ? 'Crops & livestock: ' + key.slice(15) : key);
    changes.push({ field: key, label, from, to });
  }

  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

