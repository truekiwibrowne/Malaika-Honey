import { el, mount, openDialog, formatKg, formatUgx, formatDate, toast } from '../lib/ui.js';
import { fetchAllFarmers, fetchPurchasesForFarmer, mergeFarmers, mergeFillCandidates, MERGE_MAX_PURCHASES } from '../lib/data.js';
import { registeredIso } from '../lib/stats.js';

/**
 * Merge two farmer records that are the same person (Backlog 3.4).
 * Opened from a farmer's page; `presetFrn` pre-selects the other record
 * (used by the duplicate finder on Data checks). Resolves with the FRN that
 * was kept, or undefined if cancelled.
 */
export function openMergeDialog(current, presetFrn = null) {
  return openDialog('Merge duplicate records', (close) => {
    const body = el('div', { class: 'merge' }, el('p', { class: 'muted' }, 'Loading farmers…'));

    fetchAllFarmers()
      .then((all) => {
        const candidates = all.filter((f) => f.frn !== current.frn && f.status !== 'merged');
        const preset = presetFrn ? candidates.find((f) => f.frn === presetFrn) : null;
        if (preset) showCompare(preset);
        else showPicker(candidates);
      })
      .catch((err) => mount(body, el('p', { class: 'field-error' }, 'Could not load farmers: ' + err.message)));

    function showPicker(candidates) {
      const search = el('input', { type: 'search', placeholder: 'Search by name, FRN or phone', autofocus: true });
      const list = el('div', { class: 'pick-list' });
      const renderList = () => {
        const q = search.value.trim().toLowerCase();
        const name = (current.fullNameLower || '').trim();
        const words = name.split(/\s+/).filter((w) => w.length > 2);
        // Most-likely duplicates first: exact name, then shared name words,
        // then the same district.
        const score = (f) => {
          const other = (f.fullNameLower || '').trim();
          let s = other === name ? 10 : 0;
          s += words.filter((w) => other.split(/\s+/).includes(w)).length * 2;
          if (f.district && f.district === current.district) s += 1;
          return s;
        };
        const pool = q
          ? candidates.filter((f) => [f.fullName, f.frn, f.phone].some((v) => String(v || '').toLowerCase().includes(q)))
          // With no search yet, suggest records sharing a name word.
          : candidates.filter((f) => score(f) >= 2);
        const matches = pool.sort((a, b) => score(b) - score(a)).slice(0, 8);
        mount(list, 
          ...(matches.length
            ? matches.map((f) =>
                el('button', { type: 'button', class: 'pick-item', onClick: () => showCompare(f) }, [
                  el('strong', {}, f.fullName),
                  el('span', { class: 'muted' }, ' ' + f.frn + ' · ' + (f.phone || 'no phone') + ' · ' + (f.village || '—') + ', ' + (f.district || '—')),
                ])
              )
            : [el('p', { class: 'muted' }, q ? 'No matching farmers.' : 'Type to search for the other record.')])
        );
      };
      search.addEventListener('input', renderList);
      mount(body, 
        el('p', {}, ['Which record is the same person as ', el('strong', {}, current.fullName + ' (' + current.frn + ')'), '?']),
        search,
        list
      );
      renderList();
      search.focus();
    }

    async function showCompare(other) {
      mount(body, el('p', { class: 'muted' }, 'Loading purchases…'));
      let currentPurchases;
      let otherPurchases;
      try {
        [currentPurchases, otherPurchases] = await Promise.all([fetchPurchasesForFarmer(current.frn), fetchPurchasesForFarmer(other.frn)]);
      } catch (err) {
        mount(body, el('p', { class: 'field-error' }, 'Could not load purchases: ' + err.message));
        return;
      }
      const recs = {
        [current.frn]: { farmer: current, purchases: currentPurchases },
        [other.frn]: { farmer: other, purchases: otherPurchases },
      };
      // Default: keep the record with more history (purchases, then older).
      let keepFrn = otherPurchases.length > currentPurchases.length ? other.frn : current.frn;
      if (otherPurchases.length === currentPurchases.length && (registeredIso(other) || '9') < (registeredIso(current) || '9')) keepFrn = other.frn;

      const detail = el('div');
      const errorBox = el('div', { class: 'field-error', hidden: true });
      const mergeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm' }, 'Merge records');

      const card = (frn) => {
        const { farmer: f, purchases } = recs[frn];
        const radio = el('input', { type: 'radio', name: 'keep', value: frn, checked: frn === keepFrn });
        radio.addEventListener('change', () => {
          keepFrn = frn;
          renderDetail();
        });
        return el('label', { class: 'merge-card' + (frn === keepFrn ? ' keep' : '') }, [
          el('div', { class: 'merge-card-head' }, [radio, el('strong', {}, frn === keepFrn ? 'Keep this record' : 'Duplicate - merge away')]),
          el('dl', { class: 'meta-list' }, [
            el('dt', {}, 'Name'), el('dd', {}, f.fullName || '—'),
            el('dt', {}, 'FRN'), el('dd', {}, f.frn),
            el('dt', {}, 'Phone'), el('dd', {}, f.phone || '—'),
            el('dt', {}, 'Village'), el('dd', {}, (f.village || '—') + ', ' + (f.district || '—')),
            el('dt', {}, 'Registered'), el('dd', {}, formatDate(registeredIso(f))),
            el('dt', {}, 'Purchases'), el('dd', {}, purchases.length + ' · ' + formatKg(purchases.reduce((t, p) => t + (Number(p.weightKg) || 0), 0))),
          ]),
        ]);
      };

      function renderDetail() {
        const keep = recs[keepFrn].farmer;
        const dupFrn = keepFrn === current.frn ? other.frn : current.frn;
        const dup = recs[dupFrn].farmer;
        const dupPurchases = recs[dupFrn].purchases;
        const fills = mergeFillCandidates(keep, dup);
        const fillBoxes = fills.map((f) => ({ fill: f, box: el('input', { type: 'checkbox', checked: true }) }));
        // Same rule as mergeFarmers: unmatched purchases move but don't count.
        const counted = dupPurchases.filter((p) => !p.frnUnverified);
        const kg = counted.reduce((t, p) => t + (Number(p.weightKg) || 0), 0);
        const ugx = counted.reduce((t, p) => t + (Number(p.totalUgx) || 0), 0);
        const tooMany = dupPurchases.length > MERGE_MAX_PURCHASES;

        mount(detail, 
          el('div', { class: 'merge-cards' }, [card(current.frn), card(other.frn)]),
          el('h4', {}, 'What will happen'),
          el('ul', { class: 'merge-steps' }, [
            el('li', {}, dupPurchases.length + ' purchase' + (dupPurchases.length === 1 ? '' : 's') + ' (' + formatKg(kg) + ', ' + formatUgx(ugx) + ') move from ' + dup.frn + ' to ' + keep.frn + ', and ' + keep.frn + '’s lifetime totals increase by the same amount.'),
            el('li', {}, dup.frn + ' is kept as a “merged” record pointing to ' + keep.frn + ' - nothing is deleted. If staff look it up or scan its card, the field app sends them to ' + keep.frn + ', and new purchases typed against it are credited to ' + keep.frn + '.'),
            el('li', {}, 'Both records’ edit histories record the merge. It can’t be undone from the app.'),
          ]),
          fills.length
            ? el('div', {}, [
                el('h4', {}, 'Fill in blanks on ' + keep.frn + ' from the duplicate'),
                ...fillBoxes.map(({ fill, box }) => el('label', { class: 'check' }, [box, el('span', {}, fill.label + ': ' + fill.value)])),
              ])
            : null,
          tooMany ? el('p', { class: 'field-error' }, 'The duplicate has more purchases than one merge can move (' + MERGE_MAX_PURCHASES + ').') : null
        );
        mergeBtn.disabled = tooMany;
        mergeBtn.onclick = async () => {
          errorBox.hidden = true;
          mergeBtn.disabled = true;
          mergeBtn.textContent = 'Merging…';
          try {
            const res = await mergeFarmers({ keep, dup, dupPurchases, fill: fillBoxes.filter((x) => x.box.checked).map((x) => x.fill) });
            toast('Merged. ' + res.moved + ' purchase' + (res.moved === 1 ? '' : 's') + ' moved to ' + keep.frn + '.', 'success');
            close(keep.frn);
          } catch (err) {
            console.error(err);
            errorBox.textContent = 'Could not merge: ' + (err.message || 'please try again.');
            errorBox.hidden = false;
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge records';
          }
        };
      }

      renderDetail();
      mount(body, 
        detail,
        errorBox,
        el('div', { class: 'dialog-actions' }, [
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => close() }, 'Cancel'),
          mergeBtn,
        ])
      );
    }

    return [body];
  }, { wide: true });
}
