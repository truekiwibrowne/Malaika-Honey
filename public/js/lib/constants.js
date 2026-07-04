export const APP_VERSION = '0.1.0';

export const PRODUCTS = [
  { id: 'honey', label: 'Honey' },
  { id: 'beeWax', label: 'Bee Wax' },
  { id: 'pollen', label: 'Pollen' },
  { id: 'propolis', label: 'Propolis' },
  { id: 'beeVenom', label: 'Bee Venom' },
];

export const GRADES = ['A', 'B', 'C'];

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'mobileMoney', label: 'Mobile Money' },
  { id: 'bank', label: 'Bank' },
];

export const FARM_SIZES = [
  { id: 'small', label: 'Small (1-5 acres)' },
  { id: 'medium', label: 'Medium (6-15 acres)' },
  { id: 'large', label: 'Large (16+ acres)' },
];

export const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

// Not exhaustive of every current Uganda district (borders/names change
// over time) - "Other" lets staff enter one not listed rather than
// blocking registration.
export const DISTRICTS = [
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
  'Wakiso', 'Yumbe', 'Zombo', 'Other',
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
