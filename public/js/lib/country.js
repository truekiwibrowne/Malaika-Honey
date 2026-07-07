const COUNTRY_KEY = 'malaika_country_code';
const DEFAULT_COUNTRY = 'UG';

/**
 * The single seam for "which country is this device operating in" - used
 * to filter the district list. Today this is just a per-device default
 * (Uganda), set once and cached in localStorage so it works fully offline.
 * Automatic detection (IP/ISP-based) or an admin-configured default per
 * deployment can be added later purely inside this function - callers
 * only ever see a country code, never how it was determined. IP-based
 * detection specifically can only ever be a best-effort *refinement* when
 * online (it requires a network round-trip to a geolocation service), not
 * the sole mechanism - a device that has never been online still needs a
 * usable default.
 */
export function getCountryCode() {
  let code = localStorage.getItem(COUNTRY_KEY);
  if (!code) {
    code = DEFAULT_COUNTRY;
    localStorage.setItem(COUNTRY_KEY, code);
  }
  return code;
}
