import { el, formatUgx, formatKg, formatDate, formatLocation } from './ui.js';

/**
 * Builds printable documents and hands them to the browser's own print
 * dialog, where "Save as PDF" is a standard destination. One implementation
 * therefore covers both printing and PDF export.
 *
 * Why not jsPDF (which card.js uses)? These are multi-page, variable-length
 * documents. The browser already handles pagination, page breaks that don't
 * split a row, and repeating table headers on every page - all of which are
 * fiddly and fragile to hand-roll. card.js keeps jsPDF because a CR80 card
 * is a fixed-size artifact, which is the opposite problem.
 */

function letterhead(title, subtitle) {
  return el('header', { class: 'doc-head' }, [
    el('img', { class: 'doc-logo', src: 'assets/logo/logo-lockup.png', alt: 'Malaika Honey' }),
    el('div', { class: 'doc-title' }, [
      el('h1', {}, title),
      subtitle ? el('p', {}, subtitle) : null,
    ]),
    el('div', { class: 'doc-meta' }, [
      el('span', {}, 'Printed ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })),
    ]),
  ]);
}

function rows(pairs) {
  return el(
    'table',
    { class: 'doc-kv' },
    [el('tbody', {}, pairs.filter(Boolean).map(([k, v]) => el('tr', {}, [el('th', {}, k), el('td', {}, String(v ?? '—'))])))]
  );
}

function purchaseTable(purchases) {
  const totalKg = purchases.reduce((t, p) => t + (Number(p.weightKg) || 0), 0);
  const totalUgx = purchases.reduce((t, p) => t + (Number(p.totalUgx) || 0), 0);

  return el('table', { class: 'doc-table' }, [
    el('thead', {}, [
      el('tr', {}, ['Date', 'Product', 'Grade', 'Weight', 'Price/kg', 'Total', 'Receipt'].map((h) => el('th', {}, h))),
    ]),
    el('tbody', {}, purchases.map((p) =>
      el('tr', {}, [
        el('td', {}, formatDate(p.purchaseDate)),
        el('td', {}, p.product || '—'),
        el('td', {}, p.grade || '—'),
        el('td', { class: 'num' }, formatKg(p.weightKg)),
        el('td', { class: 'num' }, formatUgx(p.pricePerKgUgx)),
        el('td', { class: 'num' }, formatUgx(p.totalUgx)),
        el('td', {}, p.receiptNo || '—'),
      ])
    )),
    el('tfoot', {}, [
      el('tr', {}, [
        el('th', { colspan: 3 }, 'Total (' + purchases.length + ')'),
        el('th', { class: 'num' }, formatKg(totalKg)),
        el('th', {}, ''),
        el('th', { class: 'num' }, formatUgx(totalUgx)),
        el('th', {}, ''),
      ]),
    ]),
  ]);
}

/**
 * Renders a document into the dedicated print container and opens the print
 * dialog. The container lives outside #app so `@media print` can hide the
 * entire application chrome with one rule.
 */
function printDocument(node) {
  const host = document.getElementById('print-root');
  host.replaceChildren(node);
  // Let layout and the logo settle before the dialog snapshots the page -
  // printing an image that hasn't decoded yet leaves a blank letterhead.
  const images = Array.from(host.querySelectorAll('img'));
  const ready = Promise.all(
    images.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })))
  );
  ready.then(() => setTimeout(() => window.print(), 60));
}

/** 1. Farmer record with every purchase allocated to them. */
export function printFarmerRecord(farmer, purchases) {
  const stats = farmer.lifetimeStats || {};
  printDocument(
    el('article', { class: 'doc' }, [
      letterhead('Farmer Record', farmer.fullName + ' · ' + farmer.frn),
      el('section', {}, [
        el('h2', {}, 'Farmer details'),
        rows([
          ['Farmer Registration No.', farmer.frn],
          ['Full name', farmer.fullName],
          ['Phone', farmer.phone],
          ['Date of birth', farmer.dateOfBirth ? formatDate(farmer.dateOfBirth) : '—'],
          ['Gender', farmer.gender],
          ['Village', farmer.village],
          ['District', farmer.district],
          ['Farm size', farmer.farmSize],
          ['Hives (traditional / KTB / modern)',
            [farmer.hives?.traditional ?? 0, farmer.hives?.ktb ?? 0, farmer.hives?.modern ?? 0].join(' / ')],
          ['Average harvest', (farmer.avgHarvestKgPerYear || 0) + ' kg/year'],
          ['Other crops or livestock', farmer.otherCropsOrLivestock],
          ['Uses chemicals', farmer.usesChemicals ? 'Yes' : 'No'],
          ['Wants training', farmer.wantsTraining ? 'Yes' : 'No'],
          ['Registered', formatDate(farmer.registeredAt)],
          ['Registered by', farmer.registeredBy],
          farmer.registeredLocation ? ['Registered at (GPS)', formatLocation(farmer.registeredLocation)] : null,
        ]),
      ]),
      el('section', {}, [
        el('h2', {}, 'Lifetime totals'),
        rows([
          ['Total delivered', formatKg(stats.totalKg)],
          ['Total paid', formatUgx(stats.totalPaidUgx)],
          ['Last delivery', stats.lastPurchaseAt ? formatDate(stats.lastPurchaseAt) : '—'],
        ]),
      ]),
      el('section', {}, [
        el('h2', {}, 'Purchases'),
        purchases.length ? purchaseTable(purchases) : el('p', {}, 'No purchases recorded.'),
      ]),
      el('footer', { class: 'doc-foot' }, 'Malaika Honey · Farmer Relationship Manager'),
    ])
  );
}

/** 2. Single purchase receipt, reprintable. */
export function printPurchaseReceipt(purchase, farmer) {
  printDocument(
    el('article', { class: 'doc doc-receipt' }, [
      letterhead('Purchase Receipt', purchase.receiptNo ? 'Receipt No. ' + purchase.receiptNo : purchase.id),
      el('section', {}, [
        rows([
          ['Date', formatDate(purchase.purchaseDate)],
          ['Farmer', (farmer ? farmer.fullName : purchase.farmerNameSnapshot) || '—'],
          ['Farmer Registration No.', purchase.frn],
          ['Village', farmer ? farmer.village + ', ' + farmer.district : '—'],
          ['Product', purchase.product],
          ['Grade', purchase.grade],
          ['Weight', formatKg(purchase.weightKg)],
          ['Price per kg', formatUgx(purchase.pricePerKgUgx)],
          ['Payment method', purchase.paymentMethod],
          ['Recorded by', purchase.recordedBy],
          purchase.recordedLocation ? ['Recorded at (GPS)', formatLocation(purchase.recordedLocation)] : null,
        ]),
        el('div', { class: 'doc-total' }, [el('span', {}, 'Total paid'), el('strong', {}, formatUgx(purchase.totalUgx))]),
      ]),
      el('section', { class: 'doc-signs' }, [
        el('div', {}, [el('div', { class: 'sign-line' }), el('span', {}, 'Farmer signature')]),
        el('div', {}, [el('div', { class: 'sign-line' }), el('span', {}, 'Buying centre staff')]),
      ]),
      el('footer', { class: 'doc-foot' }, 'Malaika Honey · Farmer Relationship Manager'),
    ])
  );
}

/** 3. The currently-filtered purchases as a management report. */
export function printPurchaseReport(purchases, filterSummary) {
  printDocument(
    el('article', { class: 'doc' }, [
      letterhead('Purchase Report', filterSummary),
      el('section', {}, [purchases.length ? purchaseTableWithFarmer(purchases) : el('p', {}, 'No purchases match these filters.')]),
      el('footer', { class: 'doc-foot' }, 'Malaika Honey · Farmer Relationship Manager'),
    ])
  );
}

function purchaseTableWithFarmer(purchases) {
  const totalKg = purchases.reduce((t, p) => t + (Number(p.weightKg) || 0), 0);
  const totalUgx = purchases.reduce((t, p) => t + (Number(p.totalUgx) || 0), 0);
  return el('table', { class: 'doc-table' }, [
    el('thead', {}, [
      el('tr', {}, ['Date', 'Farmer', 'FRN', 'Product', 'Grade', 'Weight', 'Total', 'Recorded by'].map((h) => el('th', {}, h))),
    ]),
    el('tbody', {}, purchases.map((p) =>
      el('tr', {}, [
        el('td', {}, formatDate(p.purchaseDate)),
        el('td', {}, p.farmerNameSnapshot || '—'),
        el('td', {}, p.frn || '—'),
        el('td', {}, p.product || '—'),
        el('td', {}, p.grade || '—'),
        el('td', { class: 'num' }, formatKg(p.weightKg)),
        el('td', { class: 'num' }, formatUgx(p.totalUgx)),
        el('td', {}, p.recordedBy || '—'),
      ])
    )),
    el('tfoot', {}, [
      el('tr', {}, [
        el('th', { colspan: 5 }, 'Total (' + purchases.length + ')'),
        el('th', { class: 'num' }, formatKg(totalKg)),
        el('th', { class: 'num' }, formatUgx(totalUgx)),
        el('th', {}, ''),
      ]),
    ]),
  ]);
}

/** 4. Farmer register / roster. */
export function printFarmerRegister(farmers, filterSummary) {
  printDocument(
    el('article', { class: 'doc' }, [
      letterhead('Farmer Register', filterSummary),
      el('section', {}, [
        farmers.length
          ? el('table', { class: 'doc-table' }, [
              el('thead', {}, [
                el('tr', {}, ['FRN', 'Name', 'Phone', 'Village', 'District', 'Lifetime kg', 'Total paid'].map((h) => el('th', {}, h))),
              ]),
              el('tbody', {}, farmers.map((f) =>
                el('tr', {}, [
                  el('td', {}, f.frn),
                  el('td', {}, f.fullName),
                  el('td', {}, f.phone || '—'),
                  el('td', {}, f.village || '—'),
                  el('td', {}, f.district || '—'),
                  el('td', { class: 'num' }, formatKg(f.lifetimeStats?.totalKg)),
                  el('td', { class: 'num' }, formatUgx(f.lifetimeStats?.totalPaidUgx)),
                ])
              )),
              el('tfoot', {}, [el('tr', {}, [el('th', { colspan: 7 }, farmers.length + ' farmers')])]),
            ])
          : el('p', {}, 'No farmers match these filters.'),
      ]),
      el('footer', { class: 'doc-foot' }, 'Malaika Honey · Farmer Relationship Manager'),
    ])
  );
}
