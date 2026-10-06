import { el, mount, spinner, table, toast, confirmDialog, openDialog, formatKg, formatUgx, formatNumber, formatDate, formatDateTime } from '../lib/ui.js';
import { fixStatsDrift } from '../lib/data.js';
import { loadIssues, setChecksCount, closeDuplicate, reopenCheck } from '../lib/checks.js';
import { registeredIso } from '../lib/stats.js';

/**
 * Data checks: problems that are otherwise invisible. The count of open
 * issues here is the badge on the sidebar (both come from lib/checks.js).
 *
 * Each check is closed by fixing the data - except a possible duplicate,
 * which can also be closed as "checked - not the same person", since two
 * farmers can genuinely share a name.
 */
export async function renderDataHealth(root) {
  mount(root, spinner('Checking records…'));
  let r;
  try {
    r = await loadIssues();
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load data: ' + (err.message || 'unknown error')));
    return;
  }
  setChecksCount(r.openCount);
  const rerender = () => renderDataHealth(root);

  const fixBtn = el('button', { type: 'button', class: 'btn btn-maroon btn-sm' }, 'Correct all ' + r.drift.length);
  fixBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Correct lifetime totals?', [
      'Each farmer’s stored lifetime weight, total paid and last delivery date will be set to what their purchases actually add up to.',
      'Every correction is written to that farmer’s edit history.',
    ], { confirmLabel: 'Correct ' + r.drift.length });
    if (!ok) return;
    fixBtn.disabled = true;
    fixBtn.textContent = 'Correcting…';
    try {
      await fixStatsDrift(r.drift);
      toast('Lifetime totals corrected.', 'success');
      rerender();
    } catch (err) {
      console.error(err);
      toast('Could not correct: ' + (err.message || 'please try again'), 'error');
      fixBtn.disabled = false;
      fixBtn.textContent = 'Correct all ' + r.drift.length;
    }
  });

  async function closeGroup(group) {
    const note = await openDialog('Close this check?', (close) => {
      const input = el('input', { type: 'text', placeholder: 'Optional, e.g. “Father and son, different villages”' });
      return [
        el('p', {}, 'Mark ' + group.farmers.map((f) => f.fullName + ' (' + f.frn + ')').join(' and ') + ' as different people. The check won’t come back unless another matching farmer is registered.'),
        el('div', { class: 'field' }, [el('label', {}, 'Note'), input]),
        el('div', { class: 'dialog-actions' }, [
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => close() }, 'Cancel'),
          el('button', { type: 'button', class: 'btn btn-maroon btn-sm', onClick: () => close(input.value.trim()) }, 'Not duplicates - close'),
        ]),
      ];
    });
    if (note === undefined) return;
    try {
      await closeDuplicate(group, note);
      toast('Check closed.', 'success');
      rerender();
    } catch (err) {
      console.error(err);
      toast('Could not close: ' + (err.code === 'permission-denied' ? 'the updated Firestore rules may not be deployed yet.' : err.message), 'error');
    }
  }

  const check = (ok, title, text, extra = null, info = false) =>
    el('section', { class: 'panel check-panel' }, [
      el('div', { class: 'check-head' }, [
        el('span', { class: 'check-icon ' + (ok ? 'ok' : info ? 'info' : 'attn'), 'aria-hidden': 'true' }, ok ? '✓' : info ? 'i' : '!'),
        el('div', {}, [el('h3', {}, title), el('p', { class: 'muted' }, text)]),
      ]),
      extra,
    ]);

  const plural = (n, word) => formatNumber(n) + ' ' + word + (n === 1 ? '' : 's');

  mount(
    root,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, 'Data checks'),
        el('p', { class: 'muted' }, (r.openCount ? plural(r.openCount, 'issue') + ' to review' : 'Nothing to review') + ' · ' + formatNumber(r.live.length) + ' farmers and ' + formatNumber(r.purchases.length) + ' purchases checked just now.'),
      ]),
    ]),

    check(
      !r.drift.length,
      r.drift.length ? r.drift.length + ' farmer' + (r.drift.length === 1 ? '’s' : 's’') + ' lifetime totals don’t match their purchases' : 'Lifetime totals match purchases',
      'Each farmer’s lifetime weight and total paid are kept as running totals. This recalculates them from the actual purchases to catch any that have drifted (e.g. a write that failed on a phone).',
      r.drift.length
        ? el('div', {}, [
            table(['Farmer', 'Stored kg', 'Actual kg', 'Stored paid', 'Actual paid', 'Last delivery (stored → actual)'], r.drift.slice(0, 100).map((d) =>
              el('tr', {}, [
                el('td', {}, el('a', { href: '#/farmers/' + d.farmer.frn }, (d.farmer.fullName || d.farmer.frn) + ' (' + d.farmer.frn + ')')),
                el('td', { class: 'num' }, formatKg(d.stored.kg)),
                el('td', { class: 'num' }, formatKg(d.actual.kg)),
                el('td', { class: 'num' }, formatUgx(d.stored.ugx)),
                el('td', { class: 'num' }, formatUgx(d.actual.ugx)),
                el('td', {}, (d.stored.last || '—') + ' → ' + (d.actual.last || '—')),
              ]))),
            r.drift.length > 100 ? el('p', { class: 'muted small' }, 'First 100 of ' + r.drift.length + ' shown.') : null,
            el('div', { class: 'panel-actions' }, [fixBtn]),
          ])
        : null
    ),

    check(
      !r.duplicates.length,
      r.duplicates.length ? plural(r.duplicates.length, 'possible duplicate group') : 'No open duplicate checks',
      'Farmers with the same name in the same district, or the same phone number written differently. Merge real duplicates; close the check if they are different people.',
      el('div', {}, [
        r.duplicates.length
          ? el('div', { class: 'dupe-list' }, r.duplicates.slice(0, 50).map((g) =>
              el('div', { class: 'dupe-group' }, [
                el('div', { class: 'dupe-head' }, [
                  el('span', { class: 'muted small' }, g.reason),
                  el('button', { type: 'button', class: 'btn btn-outline btn-xs', onClick: () => closeGroup(g) }, 'Checked - not duplicates'),
                ]),
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
          : null,
        r.closedDuplicates.length
          ? el('details', { class: 'closed-checks' }, [
              el('summary', {}, plural(r.closedDuplicates.length, 'closed check')),
              table(['Farmers', 'Closed by', 'When', 'Note', ''], r.closedDuplicates.map(({ group, dismissal }) =>
                el('tr', {}, [
                  el('td', {}, group.farmers.map((f) => f.fullName + ' (' + f.frn + ')').join(', ')),
                  el('td', {}, dismissal.by || '—'),
                  el('td', {}, formatDateTime(dismissal.atLocal)),
                  el('td', { class: 'wrap' }, dismissal.note || '—'),
                  el('td', {}, el('button', {
                    type: 'button',
                    class: 'link-btn',
                    onClick: async () => {
                      await reopenCheck(dismissal);
                      toast('Check re-opened.');
                      rerender();
                    },
                  }, 'Re-open')),
                ]))),
            ])
          : null,
      ])
    ),

    check(
      !r.unresolvedDistricts.length,
      r.unresolvedDistricts.length ? plural(r.unresolvedDistricts.length, 'district') + ' on the registration list can’t be placed in a region' : 'Every district on the registration list has a region',
      'These districts are set to “auto” region, but they aren’t in the 2020 district map, so farmers registered there count under no region and don’t appear on the map. Give each one a region and a map position.',
      r.unresolvedDistricts.length
        ? el('div', {}, [
            el('p', {}, r.unresolvedDistricts.map((d) => d.label || d.id).join(', ')),
            el('a', { href: '#/settings?tab=districts&issues=1', class: 'btn btn-maroon btn-sm' }, 'Fix in Settings → Districts'),
          ])
        : null
    ),

    check(
      !r.unplaced.length && !r.noDistrict.length,
      r.unplaced.length || r.noDistrict.length
        ? plural(r.unplaced.reduce((t, u) => t + u.farmers.length, 0) + r.noDistrict.length, 'farmer') + ' can’t be placed on the map'
        : 'Every farmer has a recognised district',
      'Fix the spelling of the farmer’s district on their record, or - if it’s a real district the map doesn’t know - add it in Settings → Districts with a region and position.',
      r.unplaced.length || r.noDistrict.length
        ? table(['District as written', 'Farmers', ''], [
            ...r.unplaced.map((u) =>
              el('tr', {}, [
                el('td', {}, u.district),
                el('td', { class: 'num' }, formatNumber(u.farmers.length)),
                el('td', { class: 'actions' }, [
                  el('a', { href: '#/farmers?district=' + encodeURIComponent(u.district), class: 'btn btn-outline btn-xs' }, 'View farmers'),
                  el('a', { href: '#/settings?tab=districts&add=' + encodeURIComponent(u.district), class: 'btn btn-outline btn-xs' }, 'Add as district'),
                ]),
              ])
            ),
            r.noDistrict.length
              ? el('tr', {}, [el('td', { class: 'muted' }, '(no district)'), el('td', { class: 'num' }, formatNumber(r.noDistrict.length)), el('td', {}, null)])
              : null,
          ].filter(Boolean))
        : null
    ),

    check(
      !r.unmatched.length,
      r.unmatched.length ? plural(r.unmatched.length, 'purchase') + ' not matched to a farmer' : 'Every purchase is matched to a farmer',
      'Recorded against an FRN the phone couldn’t confirm. They’re counted in totals but not in any farmer’s figures until resolved in the field app (Fix Unverified Purchases).',
      r.unmatched.length ? el('a', { href: '#/purchases?unmatched=1' }, 'View unmatched purchases →') : null
    ),

    check(
      r.noReceipt.length === 0,
      r.noReceipt.length ? plural(r.noReceipt.length, 'purchase') + ' have no receipt number' : 'Every purchase has a receipt number',
      'For information - not counted as an issue. Receipt numbers tie digital records to the paper receipt book, and let imports recognise a purchase that is already recorded.',
      null,
      true
    )
  );
}
