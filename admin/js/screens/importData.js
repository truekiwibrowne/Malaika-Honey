import { el, mount, spinner, table, toast, confirmDialog, formatDateTime, formatNumber, segmented } from '../lib/ui.js';
import { fetchAllFarmers, fetchAllPurchases, loadDistrictResolver } from '../lib/data.js';
import { loadCollection } from '../lib/refdata.js';
import { readSheet, downloadSheets, stamp } from '../lib/sheet.js';
import { IMPORT_TYPES, mapColumns, previewImport, commitImport, downloadTemplate, detectCropColumns } from '../lib/importer.js';
import { exportEverything, exportFarmers, exportPurchases } from '../lib/exporters.js';
import { fetchAudit } from '../lib/audit.js';

/**
 * Import & Export (Backlog 3.3 plus bulk import). Export is one click;
 * import is a deliberate four-step flow - template, upload, check, confirm -
 * because nothing it adds can be undone from the app. Importing never
 * changes an existing record: see lib/importer.js for how that's enforced.
 */
export async function renderImportData(root) {
  mount(root, spinner('Loading…'));

  let farmers, purchases, geoCtx, products, grades, paymentMethods, farmSizes, cropsLivestock, villages;
  async function loadData() {
    [farmers, purchases, geoCtx, products, grades, paymentMethods, farmSizes, cropsLivestock, villages] = await Promise.all([
      fetchAllFarmers(),
      fetchAllPurchases(),
      loadDistrictResolver().catch(() => null),
      loadCollection('products').then((r) => r.entries),
      loadCollection('grades').then((r) => r.entries),
      loadCollection('paymentMethods').then((r) => r.entries),
      loadCollection('farmSizes').then((r) => r.entries),
      loadCollection('cropsLivestock').then((r) => r.entries),
      loadCollection('villages').then((r) => r.entries),
    ]);
  }
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    mount(root, el('div', { class: 'empty-state' }, 'Could not load data: ' + (err.message || 'unknown error')));
    return;
  }
  const resolveDistrict = () => (geoCtx ? geoCtx.resolveDistrict : () => null);

  // ---------------------------------------------------------------- export
  const exportSection = el('section', { class: 'panel' }, [
    el('h3', {}, 'Export'),
    el('p', { class: 'muted' }, 'Download every record as a spreadsheet - for M&E analysis, partner reports or a backup. To export a filtered list, use the Export buttons on the Farmers or Purchases page.'),
    el('div', { class: 'btn-row-inline' }, [
      button('Everything (Excel, 2 sheets)', 'btn-maroon', () => exportEverything(farmers, purchases, { resolveDistrict: resolveDistrict(), cropsLivestock })),
      button('Farmers (Excel)', 'btn-outline', () => exportFarmers(farmers, 'xlsx', { resolveDistrict: resolveDistrict(), label: 'all-farmers', cropsLivestock })),
      button('Farmers (CSV)', 'btn-outline', () => exportFarmers(farmers, 'csv', { resolveDistrict: resolveDistrict(), label: 'all-farmers', cropsLivestock })),
      button('Purchases (Excel)', 'btn-outline', () => exportPurchases(purchases, 'xlsx', { resolveDistrict: resolveDistrict(), farmers, label: 'all-purchases' })),
      button('Purchases (CSV)', 'btn-outline', () => exportPurchases(purchases, 'csv', { resolveDistrict: resolveDistrict(), farmers, label: 'all-purchases' })),
    ]),
  ]);

  // ---------------------------------------------------------------- import
  const state = { type: 'farmers', file: null, sheet: null, mapping: null, preview: null, filter: 'all', allowUnmatched: false };

  const typeToggle = segmented(
    [{ value: 'farmers', label: 'Farmer registrations' }, { value: 'purchases', label: 'Purchases' }],
    state.type,
    (v) => {
      state.type = v;
      reset();
    },
    'What to import'
  );
  const fileInput = el('input', { type: 'file', accept: '.xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', id: 'import-file', class: 'visually-hidden' });
  const dropZone = el('label', { class: 'drop-zone', for: 'import-file' }, [
    el('strong', {}, 'Choose a file'),
    el('span', { class: 'muted' }, ' or drop it here - Excel (.xlsx) or CSV, up to 10 MB'),
  ]);
  const stepHost = el('div');

  fileInput.addEventListener('change', () => fileInput.files[0] && loadFile(fileInput.files[0]));
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  function reset() {
    state.file = state.sheet = state.mapping = state.preview = null;
    fileInput.value = '';
    mount(stepHost);
    mount(templateNote, ...templateButtons());
  }

  const templateNote = el('div', { class: 'btn-row-inline' });
  function templateButtons() {
    return [
      el('span', { class: 'muted' }, '1. Start from the template: '),
      button('Excel template', 'btn-outline', () => downloadTemplate(state.type, 'xlsx', { cropsLivestock })),
      button('CSV template', 'btn-outline', () => downloadTemplate(state.type, 'csv', { cropsLivestock })),
    ];
  }

  async function loadFile(file) {
    mount(stepHost, spinner('Reading ' + file.name + '…'));
    try {
      state.file = file;
      state.sheet = await readSheet(file);
      if (!state.sheet.rows.length) throw new Error('No data rows found under the header row.');
      state.mapping = mapColumns(state.type, state.sheet.headers).mapping;
      buildPreview();
    } catch (err) {
      console.error(err);
      mount(stepHost, el('div', { class: 'notice notice-warn' }, 'Could not read that file: ' + (err.message || 'unknown error')));
    }
  }

  function ctx() {
    return {
      farmers,
      purchases,
      products,
      grades,
      paymentMethods,
      farmSizes,
      cropsLivestock,
      villages,
      resolveDistrict: resolveDistrict(),
      options: { allowUnmatched: state.allowUnmatched },
    };
  }

  function buildPreview() {
    const fields = IMPORT_TYPES[state.type].fields;
    const missingRequired = fields.filter((f) => f.required && !state.mapping[f.key]);
    if (state.type === 'purchases' && !state.mapping.frn && !state.mapping.phone) missingRequired.unshift({ header: 'FRN or Phone' });
    if (state.type === 'purchases' && !state.mapping.pricePerKgUgx && !state.mapping.totalUgx) missingRequired.push({ header: 'Price per kg or Total' });
    state.preview = missingRequired.length ? null : previewImport(state.type, state.sheet.rows, state.mapping, ctx());
    renderStep(missingRequired);
  }

  function renderStep(missingRequired) {
    const fields = IMPORT_TYPES[state.type].fields;
    const headers = state.sheet.headers.filter(Boolean);

    // Column mapping - auto-detected, adjustable.
    const mappingTable = table(
      ['Field', 'Column in your file'],
      fields.map((f) => {
        const select = el('select', {}, [el('option', { value: '' }, '— not in file —'), ...headers.map((h) => el('option', { value: h }, h))]);
        select.value = state.mapping[f.key] || '';
        select.addEventListener('change', () => {
          state.mapping[f.key] = select.value || null;
          buildPreview();
        });
        return el('tr', {}, [el('td', {}, f.header + (f.required ? ' *' : '')), el('td', {}, select)]);
      })
    );
    const cropCols = state.type === 'farmers' ? detectCropColumns(headers, cropsLivestock) : new Map();
    const unmapped = headers.filter((h) => !Object.values(state.mapping).includes(h) && !cropCols.has(h));

    const head = el('div', { class: 'panel' }, [
      el('h3', {}, '3. Check the columns'),
      el('p', { class: 'muted' }, state.file.name + ' · sheet “' + state.sheet.sheetName + '” · ' + formatNumber(state.sheet.rows.length) + ' rows. Columns were matched by their header names - change any that are wrong.'),
      el('details', { open: !!missingRequired.length }, [el('summary', {}, 'Column matching'), mappingTable]),
      cropCols.size ? el('p', { class: 'muted small' }, 'Crops & livestock columns: ' + [...cropCols.values()].map((i) => i.label).join(', ')) : null,
      unmapped.length ? el('p', { class: 'muted small' }, 'Ignored columns: ' + unmapped.join(', ')) : null,
      state.type === 'purchases'
        ? el('label', { class: 'check' }, [
            (() => {
              const box = el('input', { type: 'checkbox', checked: state.allowUnmatched });
              box.addEventListener('change', () => {
                state.allowUnmatched = box.checked;
                buildPreview();
              });
              return box;
            })(),
            el('span', {}, 'Import purchases for unregistered FRNs as “unmatched” (to be fixed later in the field app’s Fix Unverified Purchases screen)'),
          ])
        : null,
    ]);

    if (missingRequired.length) {
      mount(stepHost, head, el('div', { class: 'notice notice-warn' }, 'Required column' + (missingRequired.length > 1 ? 's' : '') + ' not found: ' + missingRequired.map((f) => f.header).join(', ') + '. Choose the matching column above, or add it to your file.'));
      return;
    }

    const rows = state.preview;
    const counts = { new: 0, skip: 0, error: 0, warn: 0 };
    rows.forEach((r) => {
      counts[r.status] += 1;
      if (r.status === 'new' && r.warnings.length) counts.warn += 1;
    });

    const filterBar = segmented(
      [
        { value: 'all', label: 'All ' + rows.length },
        { value: 'new', label: 'To add ' + counts.new },
        { value: 'warn', label: 'With warnings ' + counts.warn },
        { value: 'skip', label: 'Skipped ' + counts.skip },
        { value: 'error', label: 'Errors ' + counts.error },
      ],
      state.filter,
      (v) => {
        state.filter = v;
        renderRows();
      },
      'Show rows'
    );
    const rowsHost = el('div');
    const keyCols = state.type === 'farmers'
      ? [['FRN', (r) => r.record?.frn || r.row[state.mapping.frn] || (r.status === 'new' ? 'new' : '')], ['Name', (r) => r.row[state.mapping.fullName]], ['Phone', (r) => r.record?.phone || r.row[state.mapping.phone]], ['District', (r) => r.row[state.mapping.district]]]
      : [['FRN', (r) => r.record?.frn || r.row[state.mapping.frn] || r.row[state.mapping.phone]], ['Date', (r) => r.record?.purchaseDate || r.row[state.mapping.purchaseDate]], ['Product', (r) => r.row[state.mapping.product]], ['Weight', (r) => r.row[state.mapping.weightKg]], ['Total', (r) => r.record ? formatNumber(r.record.totalUgx) : r.row[state.mapping.totalUgx]]];

    function renderRows() {
      const list = rows.filter((r) => state.filter === 'all' || (state.filter === 'warn' ? r.status === 'new' && r.warnings.length : r.status === state.filter));
      const shown = list.slice(0, 500);
      mount(rowsHost, 
        list.length
          ? table(['Row', 'Result', ...keyCols.map(([h]) => h), 'Notes'], shown.map((r) =>
              el('tr', { class: r.status === 'error' ? 'row-error' : r.status === 'skip' ? 'row-muted' : r.warnings.length ? 'row-warn' : '' }, [
                el('td', { class: 'num' }, String(r.row.__row)),
                el('td', {}, el('span', { class: 'tag ' + { new: 'tag-good', skip: 'tag-muted', error: 'tag-bad' }[r.status] }, { new: 'add', skip: 'skip', error: 'error' }[r.status])),
                ...keyCols.map(([, fn]) => el('td', {}, String(fn(r) ?? ''))),
                el('td', { class: 'notes' }, [...r.reasons, ...r.warnings].join(' ')),
              ])))
          : el('div', { class: 'empty-state' }, 'No rows in this group.'),
        list.length > shown.length ? el('p', { class: 'muted small' }, 'First 500 of ' + list.length + ' shown. Download the report for every row.') : null
      );
    }

    const importBtn = el('button', { type: 'button', class: 'btn btn-green', disabled: !counts.new }, counts.new ? 'Add ' + formatNumber(counts.new) + ' new ' + (state.type === 'farmers' ? 'farmer' : 'purchase') + (counts.new === 1 ? '' : 's') : 'Nothing new to add');
    importBtn.addEventListener('click', () => runImport(counts, importBtn));

    mount(stepHost, 
      head,
      el('div', { class: 'panel' }, [
        el('h3', {}, '4. Review'),
        el('div', { class: 'import-summary' }, [
          summaryTile(counts.new, 'will be added', 'good'),
          summaryTile(counts.skip, 'already exist - skipped', 'muted'),
          summaryTile(counts.error, 'have errors - skipped', counts.error ? 'bad' : 'muted'),
          summaryTile(counts.warn, 'added with a warning', counts.warn ? 'warn' : 'muted'),
        ]),
        el('div', { class: 'filter-bar' }, [filterBar, button('Download row report', 'btn-secondary', () => downloadReport(rows))]),
        rowsHost,
      ]),
      el('div', { class: 'panel' }, [
        el('h3', {}, '5. Import'),
        el('p', { class: 'muted' }, 'Only the rows marked “add” are written. Existing farmers and purchases are never changed. ' + (state.type === 'purchases' ? 'Each farmer’s lifetime totals are updated to include the imported purchases.' : 'Farmers without an FRN in the file get a new one.')),
        importBtn,
      ])
    );
    renderRows();
  }

  let importing = false;
  async function runImport(counts, btn) {
    if (importing) return; // one import at a time - a double-click must not run it twice
    importing = true;
    try {
      await runImportOnce(counts, btn);
    } finally {
      importing = false;
    }
  }

  async function runImportOnce(counts, btn) {
    const noun = state.type === 'farmers' ? 'farmer' : 'purchase';
    const ok = await confirmDialog(
      'Import ' + counts.new + ' ' + noun + (counts.new === 1 ? '' : 's') + '?',
      ['This adds ' + counts.new + ' new ' + noun + ' record' + (counts.new === 1 ? '' : 's') + ' from ' + state.file.name + '. ' + (counts.skip + counts.error) + ' row(s) will be skipped.', 'Imported records can be edited afterwards but not removed from the app.'],
      { confirmLabel: 'Import' }
    );
    if (!ok) return;
    btn.disabled = true;
    const progress = el('div', { class: 'progress' }, [el('div', { class: 'progress-bar', style: 'width:0%' })]);
    btn.replaceWith(progress);
    try {
      const res = await commitImport(state.type, state.preview, {
        fileName: state.file.name,
        onProgress: ({ done, total }) => (progress.firstChild.style.width = Math.round((done / total) * 100) + '%'),
      });
      await loadData();
      const listHref = state.type === 'farmers' ? '#/farmers?import=' + res.importId : '#/purchases?import=' + res.importId;
      mount(stepHost, 
        el('div', { class: 'notice notice-good' }, [
          el('strong', {}, 'Imported ' + formatNumber(res.created.length) + ' ' + noun + (res.created.length === 1 ? '' : 's') + '. '),
          res.raced.length ? res.raced.length + ' row(s) were added by someone else while you were reviewing and were skipped. ' : '',
          'Batch ', el('strong', {}, res.importId), '. ',
          el('a', { href: listHref }, 'View the imported records →'),
        ])
      );
      toast('Import complete.', 'success');
      refreshHistory();
    } catch (err) {
      console.error(err);
      stepHost.prepend(el('div', { class: 'notice notice-warn' }, 'The import stopped with an error: ' + (err.message || 'unknown error') + '. Rows already written are kept; importing the same file again will add only what is missing.'));
      progress.remove();
    }
  }

  function downloadReport(rows) {
    const headers = state.sheet.headers.filter(Boolean);
    const columns = [
      { header: 'Row', value: (r) => r.row.__row, type: 'number' },
      { header: 'Result', value: (r) => ({ new: 'will be added', skip: 'skipped - already exists', error: 'error' }[r.status]) },
      { header: 'Reasons', value: (r) => r.reasons.join(' '), width: 50 },
      { header: 'Warnings', value: (r) => r.warnings.join(' '), width: 50 },
      ...headers.map((h) => ({ header: h, value: (r) => r.row[h] })),
    ];
    return downloadSheets([{ name: 'Import check', columns, rows }], 'malaika-import-check-' + stamp(), 'xlsx');
  }

  // ---------------------------------------------------------------- history
  const historyHost = el('div');
  async function refreshHistory() {
    try {
      const entries = (await fetchAudit(300)).filter((e) => String(e.action).startsWith('import.')).slice(0, 15);
      mount(historyHost, 
        entries.length
          ? table(['When', 'By', 'What', ''], entries.map((e) =>
              el('tr', {}, [
                el('td', {}, formatDateTime(e.atLocal)),
                el('td', {}, e.by),
                el('td', { class: 'wrap' }, e.summary),
                el('td', {}, e.details?.importId
                  ? el('a', { href: (e.action === 'import.farmers' ? '#/farmers?status=all&import=' : '#/purchases?import=') + e.details.importId }, 'View')
                  : null),
              ])))
          : el('p', { class: 'muted' }, 'No imports yet.')
      );
    } catch (err) {
      mount(historyHost, el('p', { class: 'muted' }, 'Import history unavailable: ' + err.message));
    }
  }

  mount(templateNote, ...templateButtons());
  mount(
    root,
    el('div', { class: 'page-head' }, [el('div', {}, [el('h1', {}, 'Import & Export'), el('p', { class: 'muted' }, 'Bring in registrations and purchases from spreadsheets, or take everything out.')])]),
    exportSection,
    el('section', { class: 'panel' }, [
      el('h3', {}, 'Import'),
      el('p', { class: 'muted' }, 'Add farmers or purchases recorded on paper or in another system. Rows that match an existing record (same FRN, same phone number, or the same purchase) are skipped - an import never overwrites anything, and importing the same file twice adds nothing the second time.'),
      el('div', { class: 'filter-bar' }, [typeToggle]),
      templateNote,
      el('div', { class: 'btn-row-inline' }, [el('span', { class: 'muted' }, '2. Upload your file:')]),
      dropZone,
      fileInput,
    ]),
    stepHost,
    el('h2', {}, 'Recent imports'),
    historyHost
  );
  refreshHistory();
}

function button(label, kind, onClick) {
  const b = el('button', { type: 'button', class: 'btn btn-sm ' + kind }, label);
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await onClick();
    } catch (err) {
      console.error(err);
      toast('Failed: ' + (err.message || 'unknown error'), 'error');
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function summaryTile(n, label, tone) {
  return el('div', { class: 'summary-tile tone-' + tone }, [el('div', { class: 'stat-value' }, formatNumber(n)), el('div', { class: 'stat-label' }, label)]);
}
