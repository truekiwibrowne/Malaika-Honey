/**
 * Default values for every admin-editable reference collection - pure data,
 * no Firebase import, so BOTH apps can use it:
 *
 *   - the field app (referenceData.js) falls back to these whenever a
 *     collection is empty or unreachable;
 *   - the management app (admin/, which gets a copy at deploy time - see
 *     netlify.toml) offers them as the starting point when a collection is
 *     first edited.
 *
 * That second use is why this lives on its own. The fallback is
 * all-or-nothing per collection (see docs/Database-Schema.md "Admin-editable
 * reference data"): the moment ONE document exists, these stop applying. So
 * the first save from Settings must write the complete default list, not just
 * the one entry being added - and it can only do that safely if both apps
 * read the very same list.
 */

export const PRODUCTS_FALLBACK = [
  { id: 'honey', label: 'Honey', order: 1 },
  { id: 'beeWax', label: 'Bee Wax', order: 2 },
  { id: 'pollen', label: 'Pollen', order: 3 },
  { id: 'propolis', label: 'Propolis', order: 4 },
  { id: 'beeVenom', label: 'Bee Venom', order: 5 },
];

export const GRADES_FALLBACK = [
  { id: 'A', label: 'A', order: 1 },
  { id: 'B', label: 'B', order: 2 },
  { id: 'C', label: 'C', order: 3 },
];

// Real office names are the client's own data - there's nothing
// meaningful to hardcode beyond a single placeholder, just so the Login
// picker (see public/js/screens/login.js) is never truly empty before
// an admin adds real offices (see docs/Config-Management.md "Field
// office provisioning").
export const FIELD_OFFICES_FALLBACK = [{ id: 'main', label: 'Main Office', order: 1 }];

export const PAYMENT_METHODS_FALLBACK = [
  { id: 'cash', label: 'Cash', order: 1 },
  { id: 'mobileMoney', label: 'Mobile Money', order: 2 },
  { id: 'bank', label: 'Bank', order: 3 },
];

export const FARM_SIZES_FALLBACK = [
  { id: 'small', label: 'Small (1-5 acres)', order: 1 },
  { id: 'medium', label: 'Medium (6-15 acres)', order: 2 },
  { id: 'large', label: 'Large (16+ acres)', order: 3 },
];

// Not exhaustive of every current Uganda district (borders/names change
// over time) - "Other" lets staff enter one not listed rather than
// blocking registration (see newFarmer.js's generic "Other" handling).
export const UGANDA_DISTRICTS = [
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
export const DISTRICTS_FALLBACK = [
  ...UGANDA_DISTRICTS.map((name, i) => ({ id: name, label: name, order: i + 1, country: 'UG' })),
  { id: 'Other', label: 'Other', order: UGANDA_DISTRICTS.length + 1, country: 'UG' },
];

// Mirrors today's exact New Farmer form - the default schema until an
// admin edits newFarmerFields via Firestore Console (see
// docs/Config-Management.md "Editing reference data"). Full Name and
// Phone aren't here - they're fixed, always-required inputs in
// newFarmer.js itself, since duplicate-checking and search depend on them.
export const NEW_FARMER_FIELDS_FALLBACK = [
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
