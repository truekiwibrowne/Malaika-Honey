import {
  doc,
  setDoc,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentAdminName } from './auth.js';
import { writeAudit } from './audit.js';
import { downloadSheets } from './sheet.js';
import { localIso } from './stats.js';
import { buildEditableFarmerFields } from '../shared/farmerFields.js';

/**
 * Bulk import of farmer registrations and purchases from Excel/CSV.
 *
 * The one hard promise: an import NEVER overwrites or changes an existing
 * record. Three layers make that true:
 *
 *  1. Preview: every row is classified against what's already in Firestore
 *     (same FRN, same phone number, same purchase) before anything is
 *     written, and the admin sees exactly what will be added and skipped.
 *  2. Commit: rows are written inside transactions that re-read each target
 *     document and only create it if it still doesn't exist - so a record
 *     added by the field app between preview and commit is skipped, not
 *     clobbered.
 *  3. Purchases get a deterministic document id derived from their content
 *     (FRN + date + receipt, or FRN + date + product + weight). Importing the
 *     same file twice therefore adds nothing the second time.
 *
 * Imported records carry `importId` so a whole batch can be found again,
 * and each import writes one adminAudit entry.
 *
 * Transactions are used here although the field app avoids them: they fail
 * offline instead of queuing, which is fatal on a phone at a buying centre
 * but exactly right for a desk import - a half-applied import must fail
 * loudly, not sit in a queue.
 */

// ---------------------------------------------------------------- columns

const FARMER_FIELDS = [
  { key: 'frn', header: 'FRN', aliases: ['frn', 'farmer registration number', 'registration number', 'farmer id', 'farmer no'], example: '', note: 'Optional. Leave blank and one is generated. Fill it in only for farmers who already have an FRN on a paper card (e.g. MH000123).' },
  { key: 'fullName', header: 'Full name', required: true, aliases: ['full name', 'name', 'farmer name', 'farmer', 'names'], example: 'Jane Akello' },
  { key: 'phone', header: 'Phone', required: true, aliases: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'contact', 'phone no', 'mobile number'], example: '0772123456', note: 'Required, and must be unique - a phone number already registered to another farmer is skipped.' },
  { key: 'gender', header: 'Gender', aliases: ['gender', 'sex'], example: 'female', note: 'male / female (or M / F).' },
  { key: 'dateOfBirth', header: 'Date of birth', aliases: ['date of birth', 'dob', 'birth date', 'birthdate'], example: '1985-03-14', note: 'YYYY-MM-DD or DD/MM/YYYY.' },
  { key: 'email', header: 'Email', aliases: ['email', 'email address', 'e-mail'], example: '' },
  { key: 'village', header: 'Village', aliases: ['village', 'parish', 'location'], example: 'Awuvu' },
  { key: 'district', header: 'District', aliases: ['district'], example: 'Arua' },
  { key: 'farmSize', header: 'Farm size', aliases: ['farm size', 'farmsize', 'size'], example: 'small', note: 'small / medium / large, or the label shown in the field app.' },
  { key: 'hivesTraditional', header: 'Traditional hives', aliases: ['traditional hives', 'traditional', 'hives traditional'], example: '4', type: 'number' },
  { key: 'hivesKtb', header: 'KTB hives', aliases: ['ktb hives', 'ktb', 'hives ktb', 'kenya top bar'], example: '2', type: 'number' },
  { key: 'hivesModern', header: 'Modern hives', aliases: ['modern hives', 'modern', 'hives modern', 'langstroth'], example: '0', type: 'number' },
  { key: 'otherCropsOrLivestock', header: 'Other crops or livestock', aliases: ['other crops or livestock', 'other crops', 'crops', 'livestock'], example: 'Cassava, goats' },
  { key: 'avgHarvestKgPerYear', header: 'Average harvest (kg/yr)', aliases: ['average harvest (kg/yr)', 'average harvest', 'avg harvest', 'harvest kg per year', 'harvest'], example: '60', type: 'number' },
  { key: 'usesChemicals', header: 'Uses chemicals', aliases: ['uses chemicals', 'chemicals', 'pesticides'], example: 'no', note: 'yes / no.' },
  { key: 'wantsTraining', header: 'Wants training', aliases: ['wants training', 'training', 'interested in training'], example: 'yes', note: 'yes / no.' },
  { key: 'registered', header: 'Registered', aliases: ['registered', 'registration date', 'date registered', 'signature date', 'date'], example: '2025-11-02', note: 'Optional: the date the farmer originally registered. Defaults to today.' },
];

const PURCHASE_FIELDS = [
  { key: 'frn', header: 'FRN', aliases: ['frn', 'farmer registration number', 'farmer id', 'farmer no'], example: 'MH000123', note: 'FRN of the farmer. If blank, the Phone column is used to find the farmer instead.' },
  { key: 'phone', header: 'Phone', aliases: ['phone', 'phone number', 'farmer phone', 'mobile'], example: '', note: 'Only used when FRN is blank.' },
  { key: 'purchaseDate', header: 'Date', required: true, aliases: ['date', 'purchase date', 'delivery date'], example: '2026-09-18', note: 'YYYY-MM-DD or DD/MM/YYYY.' },
  { key: 'product', header: 'Product', required: true, aliases: ['product', 'item', 'produce'], example: 'Honey', note: 'Product id or label as listed in Settings → Products (e.g. Honey, Bee Wax).' },
  { key: 'grade', header: 'Grade', aliases: ['grade', 'quality'], example: 'A' },
  { key: 'weightKg', header: 'Weight (kg)', required: true, aliases: ['weight (kg)', 'weight', 'kg', 'weight kg', 'quantity'], example: '24.5', type: 'number' },
  { key: 'pricePerKgUgx', header: 'Price per kg (UGX)', aliases: ['price per kg (ugx)', 'price per kg', 'price/kg', 'price', 'rate', 'unit price'], example: '7000', type: 'number', note: 'Give either Price per kg or Total; if both are given they must agree.' },
  { key: 'totalUgx', header: 'Total (UGX)', aliases: ['total (ugx)', 'total', 'amount', 'amount paid', 'total ugx', 'value'], example: '171500', type: 'number' },
  { key: 'paymentMethod', header: 'Payment method', aliases: ['payment method', 'payment', 'paid by', 'method'], example: 'Mobile Money' },
  { key: 'receiptNo', header: 'Receipt no.', aliases: ['receipt no.', 'receipt no', 'receipt', 'receipt number'], example: 'R-00451', note: 'Strongly recommended: it is how the same purchase is recognised if a file is imported twice.' },
  { key: 'recordedBy', header: 'Recorded by', aliases: ['recorded by', 'office', 'centre', 'center', 'buying centre'], example: 'arua', note: 'Optional: office or buying centre. Defaults to "import".' },
];

export const IMPORT_TYPES = {
  farmers: { label: 'Farmer registrations', fields: FARMER_FIELDS },
  purchases: { label: 'Purchases', fields: PURCHASE_FIELDS },
};

const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maps each field key to the file header that supplies it (or null). */
export function mapColumns(type, headers) {
  const fields = IMPORT_TYPES[type].fields;
  const byNorm = new Map(headers.filter(Boolean).map((h) => [normHeader(h), h]));
  const mapping = {};
  const used = new Set();
  for (const f of fields) {
    mapping[f.key] = null;
    for (const alias of [f.header, ...f.aliases]) {
      const h = byNorm.get(normHeader(alias));
      if (h && !used.has(h)) {
        mapping[f.key] = h;
        used.add(h);
        break;
      }
    }
  }
  const unmapped = headers.filter((h) => h && !used.has(h));
  return { mapping, unmapped };
}

export function downloadTemplate(type, format) {
  const { label, fields } = IMPORT_TYPES[type];
  const columns = fields.map((f) => ({ header: f.header, value: (row) => row[f.key], width: Math.max(12, f.header.length + 2) }));
  const example = Object.fromEntries(fields.map((f) => [f.key, f.example ?? '']));
  const notes = [
    'Malaika Honey - ' + label + ' import template',
    '',
    'Fill in one row per ' + (type === 'farmers' ? 'farmer' : 'purchase') + ' on the first sheet, then upload the file on the Import & Export screen.',
    'Delete the example row before importing. Column order does not matter; the header names do.',
    'Importing never changes or overwrites a record that already exists - those rows are skipped and listed in the preview.',
    '',
    ...fields.map((f) => f.header + (f.required ? ' (required)' : '') + (f.note ? ' - ' + f.note : '')),
  ];
  return downloadSheets(
    [
      { name: label, columns, rows: [example] },
      { name: 'Instructions', notes },
    ],
    'malaika-' + type + '-import-template',
    format
  );
}

// ---------------------------------------------------------- value parsing

/**
 * Ugandan numbers are normalised to the local 0XXXXXXXXX form staff type in
 * the field app, so +256 772 123456, 256772123456 and 772123456 (Excel ate
 * the leading zero) all match the same registered farmer. Anything that
 * isn't recognisably Ugandan is kept as typed.
 */
export function normalisePhone(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (/^256\d{9}$/.test(digits)) return '0' + digits.slice(3);
  if (/^0\d{9}$/.test(digits)) return digits;
  if (/^[37]\d{8}$/.test(digits)) return '0' + digits;
  return s;
}

/** 'YYYY-MM-DD', 'DD/MM/YYYY', 'D-M-YYYY', 'YYYY/MM/DD' -> 'YYYY-MM-DD', else null. */
export function parseDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let y, m, d;
  let match;
  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, y] = match; // day-first, as written in Uganda
  else return null;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return localIso(date);
}

function parseNumber(raw) {
  const s = String(raw ?? '').replace(/,/g, '').replace(/ugx|kg/gi, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseYesNo(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return 'yes';
  if (['no', 'n', 'false', '0'].includes(s)) return 'no';
  return s ? undefined : 'no';
}

/** Matches a value to a reference option by id or label, case/space-insensitive. */
function matchOption(raw, options) {
  const n = normHeader(raw);
  if (!n) return null;
  return options.find((o) => normHeader(o.id) === n || normHeader(o.label) === n) ||
    options.find((o) => normHeader(o.label).startsWith(n)) || null;
}

const FRN_RE = /^MH[A-Z0-9]+$/;

// --------------------------------------------------------------- preview

/**
 * Classifies every row. Returns rows of
 *   { row, status: 'new' | 'skip' | 'error', reasons: [], warnings: [], record }
 * where `record` is what will be written for a 'new' row.
 *
 * ctx: { farmers, purchases, products, paymentMethods, farmSizes, grades,
 *        resolveDistrict, options: { allowUnmatched } }
 */
export function previewImport(type, rows, mapping, ctx) {
  const get = (row, key) => (mapping[key] ? row[mapping[key]] ?? '' : '');
  return type === 'farmers' ? previewFarmers(rows, get, ctx) : previewPurchases(rows, get, ctx);
}

function previewFarmers(rows, get, ctx) {
  const byFrn = new Map(ctx.farmers.map((f) => [f.frn, f]));
  const byPhone = new Map();
  const byNameDistrict = new Map();
  for (const f of ctx.farmers) {
    if (f.phone) byPhone.set(normalisePhone(f.phone), f);
    byNameDistrict.set((f.fullNameLower || '') + '|' + String(f.district || '').toLowerCase(), f);
  }
  const seenFrn = new Map();
  const seenPhone = new Map();

  return rows.map((row) => {
    const reasons = [];
    const warnings = [];
    const fullName = get(row, 'fullName').replace(/\s+/g, ' ');
    const phoneRaw = get(row, 'phone');
    const phone = normalisePhone(phoneRaw);
    const frn = get(row, 'frn').toUpperCase().replace(/\s+/g, '');

    if (!fullName) reasons.push('Full name is missing.');
    if (!phoneRaw) reasons.push('Phone is missing.');
    if (frn && !FRN_RE.test(frn)) reasons.push('FRN “' + frn + '” is not in the MH… format.');

    const dob = get(row, 'dateOfBirth');
    const dobIso = dob ? parseDate(dob) : null;
    if (dob && !dobIso) reasons.push('Date of birth “' + dob + '” is not a date.');
    const reg = get(row, 'registered');
    const regIso = reg ? parseDate(reg) : null;
    if (reg && !regIso) reasons.push('Registered date “' + reg + '” is not a date.');
    if (regIso && regIso > localIso(new Date())) reasons.push('Registered date is in the future.');

    const genderRaw = get(row, 'gender').toLowerCase();
    const gender = { m: 'male', male: 'male', f: 'female', female: 'female' }[genderRaw] || (genderRaw ? undefined : '');
    if (gender === undefined) reasons.push('Gender “' + genderRaw + '” should be male or female.');

    const numbers = {};
    for (const key of ['hivesTraditional', 'hivesKtb', 'hivesModern', 'avgHarvestKgPerYear']) {
      const n = parseNumber(get(row, key));
      if (Number.isNaN(n) || (n !== null && n < 0)) reasons.push(FARMER_FIELDS.find((f) => f.key === key).header + ' must be a number.');
      numbers[key] = n ?? '';
    }
    const usesChemicals = parseYesNo(get(row, 'usesChemicals'));
    const wantsTraining = parseYesNo(get(row, 'wantsTraining'));
    if (usesChemicals === undefined) reasons.push('Uses chemicals should be yes or no.');
    if (wantsTraining === undefined) reasons.push('Wants training should be yes or no.');

    let farmSize = '';
    const sizeRaw = get(row, 'farmSize');
    if (sizeRaw) {
      const opt = matchOption(sizeRaw, ctx.farmSizes);
      if (opt) farmSize = opt.id;
      else warnings.push('Farm size “' + sizeRaw + '” is not a known option - left blank.');
    }

    const district = get(row, 'district');
    if (!district) warnings.push('No district.');
    else if (!ctx.resolveDistrict(district)) warnings.push('District “' + district + '” is not recognised - it won’t appear on the map until it is added in Settings → Districts.');
    if (!get(row, 'village')) warnings.push('No village.');

    let status = reasons.length ? 'error' : 'new';

    if (status === 'new') {
      if (frn && byFrn.has(frn)) {
        status = 'skip';
        reasons.push('FRN ' + frn + ' already exists (' + (byFrn.get(frn).fullName || '—') + ').');
      } else if (byPhone.has(phone)) {
        const f = byPhone.get(phone);
        status = 'skip';
        reasons.push('Phone already registered to ' + f.fullName + ' (' + f.frn + ').');
      } else if (frn && seenFrn.has(frn)) {
        status = 'skip';
        reasons.push('Same FRN as row ' + seenFrn.get(frn) + ' in this file.');
      } else if (seenPhone.has(phone)) {
        status = 'skip';
        reasons.push('Same phone as row ' + seenPhone.get(phone) + ' in this file.');
      } else {
        const twin = byNameDistrict.get(fullName.toLowerCase() + '|' + district.toLowerCase());
        if (twin) warnings.push('A farmer with the same name is already registered in this district: ' + twin.frn + '. Check this isn’t the same person.');
      }
    }
    if (frn) seenFrn.set(frn, seenFrn.get(frn) || row.__row);
    if (phone) seenPhone.set(phone, seenPhone.get(phone) || row.__row);

    return {
      row,
      status,
      reasons,
      warnings,
      record: status === 'new'
        ? {
            frn: frn || null,
            fullName,
            phone,
            registeredIso: regIso,
            fieldValues: {
              dateOfBirth: dobIso || '',
              gender: gender || '',
              email: get(row, 'email'),
              village: get(row, 'village'),
              district,
              farmSize,
              hivesTraditional: numbers.hivesTraditional,
              hivesKtb: numbers.hivesKtb,
              hivesModern: numbers.hivesModern,
              otherCropsOrLivestock: get(row, 'otherCropsOrLivestock'),
              avgHarvestKgPerYear: numbers.avgHarvestKgPerYear,
              usesChemicals,
              wantsTraining,
            },
          }
        : null,
    };
  });
}

/** Content key that identifies "the same purchase" across files and re-imports. */
function purchaseKey({ frn, purchaseDate, receiptNo, product, weightKg }) {
  const receipt = String(receiptNo || '').trim().toUpperCase().replace(/\s+/g, '');
  return receipt
    ? [frn, purchaseDate, 'R', receipt].join('|')
    : [frn, purchaseDate, 'P', String(product).toLowerCase(), Number(weightKg).toFixed(2)].join('|');
}

function previewPurchases(rows, get, ctx) {
  const farmersByFrn = new Map(ctx.farmers.map((f) => [f.frn, f]));
  const farmersByPhone = new Map(ctx.farmers.filter((f) => f.phone && f.status !== 'merged').map((f) => [normalisePhone(f.phone), f]));
  // Existing purchases, indexed three ways. A row WITH a receipt matches
  // the same receipt, or a receipt-less purchase of the same farmer/day/
  // product/weight (staff skipped the receipt in the app). A row WITHOUT a
  // receipt matches any purchase of the same farmer/day/product/weight.
  // Two purchases with DIFFERENT receipts never match each other, however
  // alike - that's two deliveries.
  const byKey = new Map();
  const byShapeAll = new Map();
  const byShapeNoReceipt = new Map();
  for (const p of ctx.purchases) {
    if (!p.frn) continue;
    const shape = purchaseKey({ ...p, receiptNo: '' });
    byKey.set(purchaseKey(p), p);
    byShapeAll.set(shape, p);
    if (!String(p.receiptNo || '').trim()) byShapeNoReceipt.set(shape, p);
  }
  const seen = new Map();
  const today = localIso(new Date());

  return rows.map((row) => {
    const reasons = [];
    const warnings = [];

    // --- farmer
    let typedFrn = get(row, 'frn').toUpperCase().replace(/\s+/g, '');
    let farmer = null;
    if (typedFrn) farmer = farmersByFrn.get(typedFrn) || null;
    else if (get(row, 'phone')) {
      farmer = farmersByPhone.get(normalisePhone(get(row, 'phone'))) || null;
      if (farmer) typedFrn = farmer.frn;
      else reasons.push('No farmer is registered with phone ' + get(row, 'phone') + '.');
    } else reasons.push('FRN (or phone) is missing.');

    if (farmer && farmer.status === 'merged' && farmer.mergedInto) {
      warnings.push(farmer.frn + ' was merged into ' + farmer.mergedInto + ' - recorded against ' + farmer.mergedInto + '.');
      farmer = farmersByFrn.get(farmer.mergedInto) || null;
    }
    if (farmer && farmer.status === 'inactive') warnings.push('Farmer ' + farmer.frn + ' is marked inactive.');
    let unmatched = false;
    if (typedFrn && !farmer && !reasons.length) {
      if (ctx.options.allowUnmatched && FRN_RE.test(typedFrn)) {
        unmatched = true;
        warnings.push('FRN ' + typedFrn + ' is not registered - will be imported as unmatched.');
      } else reasons.push('FRN ' + typedFrn + ' is not registered.');
    }

    // --- values
    const dateRaw = get(row, 'purchaseDate');
    const purchaseDate = parseDate(dateRaw);
    if (!purchaseDate) reasons.push(dateRaw ? 'Date “' + dateRaw + '” is not a date.' : 'Date is missing.');
    else if (purchaseDate > today) reasons.push('Date is in the future.');

    const productRaw = get(row, 'product');
    let product = '';
    if (!productRaw) reasons.push('Product is missing.');
    else {
      const opt = matchOption(productRaw, ctx.products);
      if (opt) product = opt.id;
      else reasons.push('Product “' + productRaw + '” is not in Settings → Products.');
    }

    const gradeRaw = get(row, 'grade');
    let grade = '';
    if (gradeRaw) {
      const opt = matchOption(gradeRaw, ctx.grades);
      grade = opt ? opt.id : gradeRaw;
      if (!opt) warnings.push('Grade “' + gradeRaw + '” is not a configured grade.');
    }

    const weightKg = parseNumber(get(row, 'weightKg'));
    let price = parseNumber(get(row, 'pricePerKgUgx'));
    let total = parseNumber(get(row, 'totalUgx'));
    if (!(weightKg > 0)) reasons.push('Weight must be a number above zero.');
    if (Number.isNaN(price) || (price !== null && price <= 0)) reasons.push('Price per kg must be a number above zero.');
    if (Number.isNaN(total) || (total !== null && total <= 0)) reasons.push('Total must be a number above zero.');
    if (price === null && total === null) reasons.push('Give a price per kg or a total.');
    if (weightKg > 0 && !reasons.length) {
      if (price === null) price = Math.round(total / weightKg);
      const computed = Math.round(weightKg * price);
      if (total === null) total = computed;
      else if (Math.abs(total - computed) > Math.max(1, computed * 0.005)) {
        reasons.push('Total ' + total.toLocaleString() + ' doesn’t match weight × price (' + computed.toLocaleString() + ').');
      } else total = computed;
    }

    const payRaw = get(row, 'paymentMethod');
    let paymentMethod = '';
    if (payRaw) {
      const opt = matchOption(payRaw, ctx.paymentMethods);
      paymentMethod = opt ? opt.id : payRaw;
      if (!opt) warnings.push('Payment method “' + payRaw + '” is not a configured option.');
    }
    const receiptNo = get(row, 'receiptNo');
    if (!receiptNo) warnings.push('No receipt number.');

    let status = reasons.length ? 'error' : 'new';
    const frn = farmer ? farmer.frn : typedFrn;
    const key = status === 'new' ? purchaseKey({ frn, purchaseDate, receiptNo, product, weightKg }) : null;

    if (status === 'new') {
      const shape = purchaseKey({ frn, purchaseDate, receiptNo: '', product, weightKg });
      const dup = receiptNo ? byKey.get(key) || byShapeNoReceipt.get(shape) : byShapeAll.get(shape);
      if (dup) {
        status = 'skip';
        reasons.push('Already recorded on ' + dup.purchaseDate + (dup.receiptNo ? ' (receipt ' + dup.receiptNo + ')' : '') + '.');
      } else if (seen.has(key)) {
        status = 'skip';
        reasons.push('Same purchase as row ' + seen.get(key) + ' in this file.');
      }
      if (!seen.has(key)) seen.set(key, row.__row);
    }

    return {
      row,
      status,
      reasons,
      warnings,
      record: status === 'new'
        ? {
            key,
            frn,
            farmerNameSnapshot: farmer ? farmer.fullName : null,
            unmatched,
            purchaseDate,
            product,
            grade,
            weightKg,
            pricePerKgUgx: price,
            totalUgx: total,
            paymentMethod,
            receiptNo,
            recordedBy: get(row, 'recordedBy') || 'import',
          }
        : null,
    };
  });
}

// ---------------------------------------------------------------- commit

const CHUNK = 150;

function newImportId() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'IMP-' + localIso(new Date()).replace(/-/g, '') + '-' + rand;
}

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Claims a fresh device code for minting FRNs, exactly as a field device
 * does (see docs/Database-Schema.md "devices/{deviceCode}"): `devices` is
 * create-only in firestore.rules, so a code someone already holds is
 * rejected and another is tried. Each import gets its own code, so FRNs
 * from an import (MH + code + 000001...) can never collide with any device.
 */
async function claimImportCode(importId) {
  for (let attempt = 0; attempt < 12; attempt++) {
    let code = '';
    for (let i = 0; i < 3; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    try {
      await setDoc(doc(db, 'devices', code), { deviceCode: code, registeredAt: serverTimestamp(), kind: 'import', importId, claimedBy: currentAdminName() });
      return code;
    } catch (err) {
      if (err.code !== 'permission-denied') throw err;
    }
  }
  throw new Error('Could not reserve an FRN code for this import. Please try again.');
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/**
 * Writes the 'new' rows. onProgress({ done, total }) after each chunk.
 * Returns { importId, created: [...], raced: [...] } - `raced` are rows
 * that became duplicates between preview and commit and were skipped.
 */
export async function commitImport(type, previewRows, { fileName, onProgress = () => {} }) {
  const todo = previewRows.filter((r) => r.status === 'new');
  const importId = newImportId();
  const result = type === 'farmers'
    ? await commitFarmers(todo, importId, onProgress)
    : await commitPurchases(todo, importId, onProgress);

  const skipped = previewRows.length - result.created.length;
  await writeAudit({
    action: 'import.' + type,
    target: importId,
    summary: 'Imported ' + result.created.length + ' ' + (type === 'farmers' ? 'farmer' : 'purchase') + (result.created.length === 1 ? '' : 's') + ' from ' + fileName + (skipped ? ' (' + skipped + ' skipped)' : ''),
    details: {
      importId,
      fileName,
      rowsInFile: previewRows.length,
      created: result.created.length,
      skipped,
      racedDuplicates: result.raced.length,
      deviceCode: result.deviceCode || null,
      ...(type === 'farmers' && result.created.length
        ? { firstFrn: result.created[0], lastFrn: result.created[result.created.length - 1] }
        : {}),
    },
  });
  return { importId, ...result };
}

async function commitFarmers(rows, importId, onProgress) {
  const created = [];
  const raced = [];
  let deviceCode = null;
  let seq = 0;
  const needCode = rows.some((r) => !r.record.frn);
  if (needCode) deviceCode = await claimImportCode(importId);
  const by = currentAdminName();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => {
      const frn = r.record.frn || 'MH' + deviceCode + String(++seq).padStart(6, '0');
      return { ...r, frn };
    });
    const outcome = await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(chunk.map((r) => tx.get(doc(db, 'farmers', r.frn))));
      const made = [];
      const clash = [];
      chunk.forEach((r, idx) => {
        if (snaps[idx].exists()) { clash.push(r); return; }
        const { fullName, phone, fieldValues, registeredIso } = r.record;
        const registeredAt = registeredIso
          ? Timestamp.fromDate(new Date(registeredIso + 'T12:00:00'))
          : serverTimestamp();
        tx.set(doc(db, 'farmers', r.frn), {
          schemaVersion: 1,
          frn: r.frn,
          ...buildEditableFarmerFields({ fullName, phone, fieldValues }),
          signatureDate: registeredIso || localIso(new Date()),
          photoUrl: null,
          status: 'active',
          registeredBy: 'import',
          registeredLocation: null,
          registeredAt,
          updatedAt: serverTimestamp(),
          lifetimeStats: { totalKg: 0, totalPaidUgx: 0, lastPurchaseAt: null },
          importId,
          importedBy: by,
          importedAt: serverTimestamp(),
          importRow: r.row.__row,
        });
        made.push(r.frn);
      });
      return { made, clash };
    });
    created.push(...outcome.made);
    raced.push(...outcome.clash);
    onProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
  }
  return { created, raced, deviceCode };
}

const isoOf = (v) => (v && typeof v.toDate === 'function' ? localIso(v.toDate()) : v ? String(v).slice(0, 10) : null);

async function commitPurchases(rows, importId, onProgress) {
  const created = [];
  const raced = [];
  const by = currentAdminName();
  const ids = await Promise.all(rows.map((r) => sha(r.record.key)));
  const withIds = rows.map((r, i) => ({ ...r, id: 'imp-' + ids[i] }));

  for (let i = 0; i < withIds.length; i += CHUNK) {
    const chunk = withIds.slice(i, i + CHUNK);
    const frns = [...new Set(chunk.filter((r) => !r.record.unmatched).map((r) => r.record.frn))];
    const outcome = await runTransaction(db, async (tx) => {
      // All reads first (a transaction requirement), then all writes.
      const pSnaps = await Promise.all(chunk.map((r) => tx.get(doc(db, 'purchases', r.id))));
      const fSnaps = await Promise.all(frns.map((frn) => tx.get(doc(db, 'farmers', frn))));
      const farmerSnap = new Map(frns.map((frn, idx) => [frn, fSnaps[idx]]));

      const made = [];
      const clash = [];
      const deltas = new Map();
      chunk.forEach((r, idx) => {
        const rec = r.record;
        if (pSnaps[idx].exists()) { clash.push(r); return; }
        const fSnap = rec.unmatched ? null : farmerSnap.get(rec.frn);
        const matched = !!(fSnap && fSnap.exists());
        tx.set(doc(db, 'purchases', r.id), {
          schemaVersion: 1,
          frn: rec.frn,
          farmerNameSnapshot: matched ? fSnap.data().fullName : null,
          product: rec.product,
          weightKg: rec.weightKg,
          grade: rec.grade,
          pricePerKgUgx: rec.pricePerKgUgx,
          totalUgx: rec.totalUgx,
          paymentMethod: rec.paymentMethod,
          receiptNo: rec.receiptNo || '',
          purchaseDate: rec.purchaseDate,
          centre: null,
          recordedBy: rec.recordedBy,
          recordedLocation: null,
          createdAt: serverTimestamp(),
          syncedFromOffline: false,
          frnUnverified: !matched,
          originalTypedFrn: matched ? null : rec.frn,
          importId,
          importedBy: by,
          importRow: r.row.__row,
        });
        made.push(r.id);
        if (matched) {
          const d = deltas.get(rec.frn) || { kg: 0, ugx: 0, last: null };
          d.kg += rec.weightKg;
          d.ugx += rec.totalUgx;
          if (!d.last || rec.purchaseDate > d.last) d.last = rec.purchaseDate;
          deltas.set(rec.frn, d);
        }
      });

      // Same lifetimeStats contract as the field app's savePurchase: sums
      // move by increment(); lastPurchaseAt only ever moves forward.
      for (const [frn, d] of deltas) {
        const current = isoOf(farmerSnap.get(frn).data().lifetimeStats?.lastPurchaseAt);
        const update = {
          'lifetimeStats.totalKg': increment(d.kg),
          'lifetimeStats.totalPaidUgx': increment(d.ugx),
          updatedAt: serverTimestamp(),
        };
        if (!current || d.last > current) update['lifetimeStats.lastPurchaseAt'] = d.last;
        tx.update(doc(db, 'farmers', frn), update);
      }
      return { made, clash };
    });
    created.push(...outcome.made);
    raced.push(...outcome.clash);
    onProgress({ done: Math.min(i + CHUNK, withIds.length), total: withIds.length });
  }
  return { created, raced };
}

