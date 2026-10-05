import { el, mount, spinner, table, toast, confirmDialog, formatKg, formatUgx, formatNumber, formatDate } from '../lib/ui.js';
import { fetchAllFarmers, fetchAllPurchases, loadDistrictResolver, computeStatsDrift, fixStatsDrift, findLikelyDuplicates } from '../lib/data.js';
import { normalisePhone } from '../lib/importer.js';
import { registeredIso } from '../lib/stats.js';

/**
 * Data checks: problems that are otherwise invisible.
 *  - lifetime totals that no longer match the farmer's purchases (Backlog
 *    3.8 / Risk Register R38), with a one-click correction;
 *  - likely duplicate farmers, each one click from the merge dialog;
 *  - records missing things the reports depend on.
 */
export async function renderDataHealth(root) {
  mount(root, spinner('Checking records…'));
  let farmers, purchases, geoCtx;
  try {
    [farmers, purchases, geoCtx] = await Promise.all([fetchAllFarmers(), fetchAllPurchases(), loadDistrictResolver().catch(() => null)]);
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load data: ' + (err.message || 'unknown error')));
    return;
  }

  const live = farmers.filter((f) => f.status !== 'merged');
  const drift = computeStatsDrift(farmers, purchases);
  const dupes = findLikelyDuplicates(farmers, normalisePhone);
  const unmatched = purchases.filter((p) => p.frnUnverified);
  const resolve = geoCtx ? geoCtx.resolveDistrict : null;
  const noDistrict = live.filter((f) => !f.district);
  const badDistrict = resolve ? live.filter((f) => f.district && !resolve(f.district)) : [];
  const noReceipt = purchases.filter((p) => !String(p.receiptNo || '').trim());

  const fixBtn = el('button', { type: 'button', class: 'btn btn-maroon btn-sm' }, 'Correct all ' + drift.length);
  fixBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Correct lifetime totals?', [
      'Each farmer’s stored lifetime weight, total paid and last delivery date will be set to what their purchases actually add up to.',
      'Every correction is written to that farmer’s edit history.',
    ], { confirmLabel: 'Correct ' + drift.length });
    if (!ok) return;
    fixBtn.disabled = true;
    fixBtn.textContent = 'Correcting…';
    try {
      await fixStatsDrift(drift);
      toast('Lifetime totals corrected.', 'success');
      renderDataHealth(root);
    } catch (err) {
      console.error(err);
      toast('Could not correct: ' + (err.message || 'please try again'), 'error');
      fixBtn.disabled = false;
      fixBtn.textContent = 'Correct all ' + drift.length;
    }
  });

  const check = (ok, title, text, extra = null) =>
    el('section', { class: 'panel check-panel' }, [
      el('div', { class: 'check-head' }, [
        el('span', { class: 'check-icon ' + (ok ? 'ok' : 'attn'), 'aria-hidden': 'true' }, ok ? '✓' : '!'),
        el('div', {}, [el('h3', {}, title), el('p', { class: 'muted' }, text)]),
      ]),
      extra,
    ]);

  mount(
    root,
    el('div', { class: 'page-head' }, [el('div', {}, [el('h1', {}, 'Data checks'), el('p', { class: 'muted' }, formatNumber(live.length) + ' farmers and ' + formatNumber(purchases.length) + ' purchases checked just now.')])]),

    check(
      !drift.length,
      drift.length ? drift.length + ' farmer' + (drift.length === 1 ? '’s' : 's’') + ' lifetime totals don’t match their purchases' : 'Lifetime totals match purchases',
      'Each farmer’s lifetime weight and total paid are kept as running totals. This recalculates them from the actual purchases to catch any that have drifted (e.g. a write that failed on a phone).',
      drift.length
        ? el('div', {}, [
            table(['Farmer', 'Stored kg', 'Actual kg', 'Stored paid', 'Actual paid', 'Last delivery (stored → actual)'], drift.slice(0, 100).map((d) =>
              el('tr', {}, [
                el('td', {}, el('a', { href: '#/farmers/' + d.farmer.frn }, (d.farmer.fullName || d.farmer.frn) + ' (' + d.farmer.frn + ')')),
                el('td', { class: 'num' }, formatKg(d.stored.kg)),
                el('td', { class: 'num' }, formatKg(d.actual.kg)),
                el('td', { class: 'num' }, formatUgx(d.stored.ugx)),
                el('td', { class: 'num' }, formatUgx(d.actual.ugx)),
                el('td', {}, (d.stored.last || '—') + ' → ' + (d.actual.last || '—')),
              ]))),
            drift.length > 100 ? el('p', { class: 'muted small' }, 'First 100 of ' + drift.length + ' shown.') : null,
            el('div', { class: 'panel-actions' }, [fixBtn]),
          ])
        : null
    ),

    check(
      !dupes.length,
      dupes.length ? dupes.length + ' possible duplicate group' + (dupes.length === 1 ? '' : 's') : 'No likely duplicate farmers',
      'Farmers with the same name in the same district, or the same phone number written differently. Check each one - two people can share a name - and merge real duplicates.',
      dupes.length
        ? el('div', { class: 'dupe-list' }, dupes.slice(0, 50).map((g) =>
            el('div', { class: 'dupe-group' }, [
              el('div', { class: 'muted small' }, g.reason),
              table(['FRN', 'Name', 'Phone', 'Village', 'Registered', 'Lifetime', ''], g.farmers.map((f, i) =>
                el('tr', {}, [
                  el('td', {}, el('a', { href: '#/farmers/' + f.frn }, f.frn)),
                  el('td', {}, f.fullName),
                  el('td', {}, f.phone || '—'),
                  el('td', {}, (f.village || '—') + ', ' + (f.district || '—')),
                  el('td', {}, formatDate(registeredIso(f))),
                  el('td', { class: 'num' }, formatKg(f.lifetimeStats?.totalKg)),
                  el('td', {}, i === 0 ? null : el('a', { href: '#/farmers/' + g.farmers[0].frn + '?merge=' + f.frn, class: 'btn btn-outline btn-xs' }, 'Merge…')),
                ]))),
            ])
          ))
        : null
    ),

    check(
      !unmatched.length,
      unmatched.length ? unmatched.length + ' purchase' + (unmatched.length === 1 ? '' : 's') + ' not matched to a farmer' : 'Every purchase is matched to a farmer',
      'Recorded against an FRN the phone couldn’t confirm. They’re counted in totals but not in any farmer’s figures until resolved in the field app (Fix Unverified Purchases).',
      unmatched.length ? el('a', { href: '#/purchases?unmatched=1' }, 'View unmatched purchases →') : null
    ),

    check(
      !noDistrict.length && !badDistrict.length,
      noDistrict.length || badDistrict.length
        ? formatNumber(noDistrict.length + badDistrict.length) + ' farmers can’t be placed on the map'
        : 'Every farmer has a recognised district',
      (noDistrict.length ? noDistrict.length + ' have no district. ' : '') + (badDistrict.length ? badDistrict.length + ' have a district name that isn’t recognised (' + [...new Set(badDistrict.map((f) => f.district))].slice(0, 8).join(', ') + '). ' : '') + 'Fix the farmer’s district, or give an unrecognised name a region and position in Settings → Districts.',
      badDistrict.length ? el('a', { href: '#/settings?tab=districts' }, 'Open Settings → Districts →') : null
    ),

    check(
      noReceipt.length === 0,
      noReceipt.length ? formatNumber(noReceipt.length) + ' purchases have no receipt number' : 'Every purchase has a receipt number',
      'Receipt numbers tie digital records to the paper receipt book, and let imports recognise a purchase that is already recorded.',
      null
    )
  );
}
