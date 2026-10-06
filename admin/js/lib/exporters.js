import { downloadSheets, stamp } from './sheet.js';
import { registeredIso } from './stats.js';
import { cropHeader } from './importer.js';

/**
 * Column layouts for spreadsheet exports (Backlog 3.3). Kept in one place
 * so the Farmers and Purchases screens and the full workbook on the Import
 * & Export screen can never disagree about what a column means.
 *
 * Headers deliberately match the import templates (importer.js) where the
 * field exists in both - an export can be edited and re-imported, and the
 * import will skip every row that's already there.
 */

const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : '');
const gps = (loc, key) => (loc && typeof loc[key] === 'number' ? loc[key] : '');

/**
 * Answers to questions an admin added to the New Farmer form live under
 * farmers/{frn}.customFields - one extra column per question that any of
 * the exported farmers has answered.
 */
function customColumns(farmers) {
  const keys = [...new Set(farmers.flatMap((f) => Object.keys(f.customFields || {})))].sort();
  return keys.map((k) => ({ header: k, value: (f) => {
    const v = (f.customFields || {})[k];
    return typeof v === 'boolean' ? yesNo(v) : v;
  } }));
}

/** One column per crop/livestock item: the amount, or "yes" when no amount was given. */
function cropColumns(items, farmers) {
  const used = new Set(farmers.flatMap((f) => Object.keys(f.cropsLivestock || {})));
  return items
    .filter((c) => c.active !== false || used.has(c.id))
    .map((c) => ({ header: cropHeader(c), type: 'auto', value: (f) => {
      const v = (f.cropsLivestock || {})[c.id];
      return v === true ? 'yes' : v ?? '';
    } }));
}

export function farmerColumns(resolveDistrict, farmers = [], cropsLivestock = []) {
  return [
    { header: 'FRN', value: (f) => f.frn, width: 14 },
    { header: 'Full name', value: (f) => f.fullName, width: 26 },
    { header: 'Phone', value: (f) => f.phone, width: 15 },
    { header: 'Gender', value: (f) => f.gender },
    { header: 'Date of birth', value: (f) => f.dateOfBirth, width: 13 },
    { header: 'Email', value: (f) => f.email, width: 22 },
    { header: 'Village', value: (f) => f.village, width: 18 },
    { header: 'District', value: (f) => f.district, width: 16 },
    { header: 'Region', value: (f) => (resolveDistrict && resolveDistrict(f.district)?.region) || '' },
    { header: 'Farm size', value: (f) => f.farmSize },
    { header: 'Traditional hives', value: (f) => f.hives?.traditional ?? 0, type: 'number' },
    { header: 'KTB hives', value: (f) => f.hives?.ktb ?? 0, type: 'number' },
    { header: 'Modern hives', value: (f) => f.hives?.modern ?? 0, type: 'number' },
    { header: 'Other crops or livestock', value: (f) => f.otherCropsOrLivestock, width: 24 },
    { header: 'Average harvest (kg/yr)', value: (f) => f.avgHarvestKgPerYear, type: 'number' },
    { header: 'Uses chemicals', value: (f) => yesNo(f.usesChemicals) },
    { header: 'Wants training', value: (f) => yesNo(f.wantsTraining) },
    { header: 'Status', value: (f) => f.status || 'active' },
    { header: 'Merged into', value: (f) => f.mergedInto || '' },
    { header: 'Registered', value: (f) => registeredIso(f) || '', width: 12 },
    { header: 'Registered by', value: (f) => f.registeredBy, width: 16 },
    { header: 'Lifetime kg', value: (f) => f.lifetimeStats?.totalKg ?? 0, type: 'number' },
    { header: 'Lifetime paid (UGX)', value: (f) => f.lifetimeStats?.totalPaidUgx ?? 0, type: 'number', width: 18 },
    { header: 'Last delivery', value: (f) => f.lifetimeStats?.lastPurchaseAt || '', width: 12 },
    { header: 'Farm latitude', value: (f) => gps(f.farmLocation, 'lat'), type: 'number' },
    { header: 'Farm longitude', value: (f) => gps(f.farmLocation, 'lng'), type: 'number' },
    { header: 'Registered latitude', value: (f) => gps(f.registeredLocation, 'lat'), type: 'number' },
    { header: 'Registered longitude', value: (f) => gps(f.registeredLocation, 'lng'), type: 'number' },
    { header: 'Import batch', value: (f) => f.importId || '' },
    ...cropColumns(cropsLivestock, farmers),
    ...customColumns(farmers),
  ];
}

export function purchaseColumns(resolveDistrict, farmersByFrn) {
  const farmer = (p) => (farmersByFrn ? farmersByFrn.get(p.frn) : null);
  return [
    { header: 'Date', value: (p) => p.purchaseDate, width: 12 },
    { header: 'FRN', value: (p) => p.frn, width: 14 },
    { header: 'Farmer', value: (p) => p.farmerNameSnapshot || (p.frnUnverified ? '(not matched)' : ''), width: 24 },
    { header: 'District', value: (p) => farmer(p)?.district || '' },
    { header: 'Region', value: (p) => (resolveDistrict && resolveDistrict(farmer(p)?.district)?.region) || '' },
    { header: 'Product', value: (p) => p.product },
    { header: 'Grade', value: (p) => p.grade },
    { header: 'Weight (kg)', value: (p) => p.weightKg, type: 'number' },
    { header: 'Price per kg (UGX)', value: (p) => p.pricePerKgUgx, type: 'number', width: 16 },
    { header: 'Total (UGX)', value: (p) => p.totalUgx, type: 'number', width: 14 },
    { header: 'Payment method', value: (p) => p.paymentMethod },
    { header: 'Receipt no.', value: (p) => p.receiptNo },
    { header: 'Recorded by', value: (p) => p.recordedBy, width: 16 },
    { header: 'Unmatched', value: (p) => (p.frnUnverified ? 'yes' : '') },
    { header: 'Typed FRN', value: (p) => p.originalTypedFrn || '' },
    { header: 'Saved offline', value: (p) => (p.syncedFromOffline ? 'yes' : '') },
    { header: 'Latitude', value: (p) => gps(p.recordedLocation, 'lat'), type: 'number' },
    { header: 'Longitude', value: (p) => gps(p.recordedLocation, 'lng'), type: 'number' },
    { header: 'Import batch', value: (p) => p.importId || '' },
    { header: 'Record id', value: (p) => p.id, width: 22 },
  ];
}

export function exportFarmers(farmers, format, { resolveDistrict, label = 'farmers', cropsLivestock = [] } = {}) {
  return downloadSheets(
    [{ name: 'Farmers', columns: farmerColumns(resolveDistrict, farmers, cropsLivestock), rows: farmers }],
    'malaika-' + label + '-' + stamp(),
    format
  );
}

export function exportPurchases(purchases, format, { resolveDistrict, farmers = [], label = 'purchases' } = {}) {
  const byFrn = new Map(farmers.map((f) => [f.frn, f]));
  return downloadSheets(
    [{ name: 'Purchases', columns: purchaseColumns(resolveDistrict, byFrn), rows: purchases }],
    'malaika-' + label + '-' + stamp(),
    format
  );
}

/** Both tables in one workbook, for M&E analysis and partner reporting. */
export function exportEverything(farmers, purchases, { resolveDistrict, cropsLivestock = [] } = {}) {
  const byFrn = new Map(farmers.map((f) => [f.frn, f]));
  return downloadSheets(
    [
      { name: 'Farmers', columns: farmerColumns(resolveDistrict, farmers, cropsLivestock), rows: farmers },
      { name: 'Purchases', columns: purchaseColumns(resolveDistrict, byFrn), rows: purchases },
    ],
    'malaika-full-export-' + stamp(),
    'xlsx'
  );
}
