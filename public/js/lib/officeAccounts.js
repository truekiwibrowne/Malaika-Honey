/**
 * How a field office's sign-in identity is derived - pure functions, no
 * Firebase import, shared by BOTH apps:
 *
 *   - the field app (auth.js signs offices in; addOffice.js creates them);
 *   - the management app (Settings -> Staff access -> Add access, which gets
 *     a copy of this file at deploy time - see netlify.toml).
 *
 * One copy matters here: an office created by one app must be able to sign
 * in through the other. If the email domain, the code padding or the name
 * slug ever differed, the account would be created fine and then simply
 * never work, with "Wrong code." as the only symptom.
 */

export const OFFICE_EMAIL_DOMAIN = 'office.malaikahoney.local';

// Firebase Auth requires a password of at least 6 characters, but office
// codes are meant to be short (e.g. 4 digits) so they're easy for staff
// to remember and type. Appending this fixed, non-secret suffix pads the
// real Firebase password to a safe length without staff ever needing to
// know it exists - they always just type the short code shown to them.
// This does NOT add real security (the suffix is constant and effectively
// public, documented here in the repo) - the entropy is still only
// whatever the office code itself provides; see docs/Risk-Register.md.
// Must stay in sync with whatever password was actually set on each
// office's Firebase Auth account (see docs/Config-Management.md "Field
// office provisioning").
export const OFFICE_CODE_PAD = '-mhfrm';

/** The fieldOffices document id for an office name: "Gulu Town" -> "gulutown". */
export function officeSlug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * The synthetic email an office account is stored under in Firebase Auth -
 * officeId is the fieldOffices document id chosen from the Login screen's
 * dropdown (see referenceData.js getFieldOffices).
 */
export function officeIdToEmail(officeId) {
  return officeId + '@' + OFFICE_EMAIL_DOMAIN;
}

export function officeCodeToPassword(code) {
  return code + OFFICE_CODE_PAD;
}
