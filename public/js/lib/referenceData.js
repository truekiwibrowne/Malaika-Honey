import { collection, getDocs, getDocsFromCache } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { getCountryCode } from './country.js';

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

const PRODUCTS_FALLBACK = [
  { id: 'honey', label: 'Honey', order: 1 },
  { id: 'beeWax', label: 'Bee Wax', order: 2 },
  { id: 'pollen', label: 'Pollen', order: 3 },
  { id: 'propolis', label: 'Propolis', order: 4 },
  { id: 'beeVenom', label: 'Bee Venom', order: 5 },
];

const GRADES_FALLBACK = [
  { id: 'A', label: 'A', order: 1 },
  { id: 'B', label: 'B', order: 2 },
  { id: 'C', label: 'C', order: 3 },
];

// Real office names are the client's own data - there's nothing
// meaningful to hardcode beyond a single placeholder, just so the Login
// picker (see public/js/screens/login.js) is never truly empty before
// an admin adds real offices (see docs/Config-Management.md "Field
// office provisioning").
const FIELD_OFFICES_FALLBACK = [{ id: 'main', label: 'Main Office', order: 1 }];

const PAYMENT_METHODS_FALLBACK = [
  { id: 'cash', label: 'Cash', order: 1 },
  { id: 'mobileMoney', label: 'Mobile Money', order: 2 },
  { id: 'bank', label: 'Bank', order: 3 },
];

const FARM_SIZES_FALLBACK = [
  { id: 'small', label: 'Small (1-5 acres)', order: 1 },
  { id: 'medium', label: 'Medium (6-15 acres)', order: 2 },
  { id: 'large', label: 'Large (16+ acres)', order: 3 },
];

// Not exhaustive of every current Uganda district (borders/names change
// over time) - "Other" lets staff enter one not listed rather than
// blocking registration (see newFarmer.js's generic "Other" handling).
const UGANDA_DISTRICTS = [
  'Abim', 'Adjumani', 'Agago', 'Alebtong', 'Amolatar', 'Amudat', 'Amuria', 'Amuru',
  'Apac', 'Arua', 'Budaka', 'Bududa', 'Bugiri', 'Bugweri', 'Buikwe', 'Bukedea',
  'Bukomansimbi', 'Bukwo', 'Bulambuli', 'Buliisa', 'Bundibugyo', 'Bushenyi', 'Busia',
  'Butaleja', 'Butambala', 'Butebo', 'Buvuma', 'Buyende', 'Dokolo', 'Fort Portal',
  'Gomba', 'Gulu', 'Hoima', 'Ibanda', 'Iganga', 'Isingiro', 'Jinja', 'Kaabong',
  'Kabale', 'Kabarole', 'Kaberamaido', 'Kagadi', 'Kakumiro', 'Kalaki', 'Kalangala',
  'Kaliro', 'Kalungu', 'Kampala', 'Kamuli', 'Kamwenge', 'Kanungu', 'Kapchorwa',
  'Kapelebyong', 'Kasese', 'Katakwi', 'Kayunga', 'Kibaale', 'Kiboga', 'Kibuku',
  'Kikuube', 'Kiruhura', 'Kiryandongo', 'Kisoro', 'Kitagwenda', 'Kitgum', 'Koboko',
  'Kole', 'Kotido', 'Kumi', 'Kwania', 'Kween', 'Kyankwanzi', 'Kyegegwa', 'Kyenjojo',
  'Kyotera', 'Lamwo', 'Lira', 'Luuka', 'Luwero', 'Lwengo', 'Lyantonde', 'Manafwa',
  'Maracha', 'Masaka', 'Masindi', 'Mayuge', 'Mbale', 'Mbarara', 'Mitooma', 'Mityana',
  'Moroto', 'Moyo', 'Mpigi', 'Mubende', 'Mukono', 'Nabilatuk', 'Nakapiripirit',
  'Nakaseke', 'Nakasongola', 'Namayingo', 'Namisindwa', 'Namutumba', 'Napak',
  'Nebbi', 'Ngora', 'Ntoroko', 'Ntungamo', 'Nwoya', 'Obongi', 'Omoro', 'Otuke',
  'Oyam', 'Pader', 'Pakwach', 'Pallisa', 'Rakai', 'Rubanda', 'Rubirizi', 'Rukiga',
  'Rukungiri', 'Sembabule', 'Serere', 'Sheema', 'Sironko', 'Soroti', 'Tororo',
  'Wakiso', 'Yumbe', 'Zombo',
];
const DISTRICTS_FALLBACK = [
  ...UGANDA_DISTRICTS.map((name, i) => ({ id: name, label: name, order: i + 1, country: 'UG' })),
  { id: 'Other', label: 'Other', order: UGANDA_DISTRICTS.length + 1, country: 'UG' },
];

// Mirrors today's exact New Farmer form - the default schema until an
// admin edits newFarmerFields via Firestore Console (see
// docs/Config-Management.md "Editing reference data"). Full Name and
// Phone aren't here - they're fixed, always-required inputs in
// newFarmer.js itself, since duplicate-checking and search depend on them.
const NEW_FARMER_FIELDS_FALLBACK = [
  { id: 'dateOfBirth', section: 'Personal Information', label: 'Date of Birth', type: 'date', order: 1, required: false, active: true },
  { id: 'gender', section: 'Personal Information', label: 'Gender', type: 'choice', order: 2, required: false, active: true,
    options: [{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }] },
  { id: 'email', section: 'Personal Information', label: 'Email Address', type: 'email', order: 3, required: false, active: true, placeholder: 'Optional' },

  { id: 'village', section: 'Farm Information', label: 'Village', type: 'text', order: 4, required: true, active: true, placeholder: 'e.g. Awuvu' },
  { id: 'district', section: 'Farm Information', label: 'District', type: 'select', order: 5, required: true, active: true, optionsSource: 'districts', placeholder: 'Select district' },
  { id: 'farmSize', section: 'Farm Information', label: 'Farm Size', type: 'choice', order: 6, required: false, active: true, optionsSource: 'farmSizes' },
  { id: 'hivesTraditional', section: 'Farm Information', label: 'Traditional Hives', type: 'number', order: 7, required: false, active: true },
  { id: 'hivesKtb', section: 'Farm Information', label: 'KTB Hives', type: 'number', order: 8, required: false, active: true },
  { id: 'hivesModern', section: 'Farm Information', label: 'Modern Hives', type: 'number', order: 9, required: false, active: true },
  { id: 'otherCropsOrLivestock', section: 'Farm Information', label: 'Other Crops or Livestock', type: 'text', order: 10, required: false, active: true, placeholder: 'Optional' },

  { id: 'avgHarvestKgPerYear', section: 'Production Details', label: 'Average Honey Harvest', type: 'number', order: 11, required: false, active: true, placeholder: 'kg per year' },
  { id: 'usesChemicals', section: 'Production Details', label: 'Uses chemicals/pesticides?', type: 'toggle', order: 12, required: false, active: true },
  { id: 'wantsTraining', section: 'Production Details', label: 'Interested in training?', type: 'toggle', order: 13, required: false, active: true },
];

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

export async function getDistricts() {
  const countryCode = getCountryCode();
  const all = await getOptionList('districts', DISTRICTS_FALLBACK);
  const filtered = all.filter((d) => !d.country || d.country === countryCode);
  return filtered.length ? filtered : all;
}
