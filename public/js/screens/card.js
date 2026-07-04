import { el, mount, toast } from '../lib/ui.js';
import { getFarmerByFrn } from '../lib/db.js';

const BRAND_MAROON = [124, 35, 40];

async function fetchAsDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadFarmerCardPdf(farmer) {
  const [{ jsPDF }, iconDataUrl] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'),
    fetchAsDataUrl('assets/logo/icon-square.png'),
  ]);

  // CR80 standard ID card size (85.6mm x 53.98mm), landscape.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 53.98] });
  const [r, g, b] = BRAND_MAROON;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 85.6, 53.98, 'F');

  doc.addImage(iconDataUrl, 'PNG', 6, 6, 10, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MALAIKA HONEY', 19, 9.5);

  doc.setFontSize(15);
  doc.text('FRN ' + farmer.frn, 6, 23);

  doc.setFontSize(11);
  doc.text(farmer.fullName, 6, 29.5);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(6, 33, 79.6, 33);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const rows = [
    ['Village', farmer.village],
    ['District', farmer.district],
    ['Phone', farmer.phone],
  ];
  let y = 38;
  rows.forEach(([label, value]) => {
    doc.setTextColor(230, 210, 210);
    doc.text(label, 6, y);
    doc.setTextColor(255, 255, 255);
    doc.text(String(value || '—'), 79.6, y, { align: 'right' });
    y += 5.2;
  });

  doc.save(farmer.frn + '-malaika-honey-card.pdf');
}

export async function renderCard(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading card…'));

  const farmer = await getFarmerByFrn(frn);
  if (!farmer) {
    mount(
      root,
      el('a', { href: '#/farmer/' + frn, class: 'back-btn' }, '← Back'),
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device.')
    );
    return;
  }

  const downloadBtn = el(
    'button',
    {
      class: 'btn btn-maroon',
      onClick: async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Preparing PDF…';
        try {
          await downloadFarmerCardPdf(farmer);
        } catch (err) {
          console.error(err);
          toast('Could not generate the PDF. Check your connection and try again.');
        } finally {
          downloadBtn.disabled = false;
          downloadBtn.textContent = '⬇ Download PDF';
        }
      },
    },
    '⬇ Download PDF'
  );

  mount(
    root,
    el('a', { href: '#/farmer/' + frn, class: 'back-btn' }, '← Back'),
    el('h1', {}, 'Farmer Card'),
    el('p', { class: 'welcome' }, 'Printable ID card for ' + farmer.fullName + '.'),
    el('div', { class: 'id-card' }, [
      el('div', { class: 'id-card-brand' }, [
        el('img', { class: 'id-card-logo', src: 'assets/logo/icon-square.png', alt: '' }),
        el('span', {}, 'MALAIKA HONEY'),
      ]),
      el('div', { class: 'id-card-frn' }, 'FRN ' + farmer.frn),
      el('div', { style: 'font-size:20px;font-weight:700' }, farmer.fullName),
      el('div', { class: 'id-card-row' }, [el('span', { class: 'k' }, 'Village'), el('span', {}, farmer.village)]),
      el('div', { class: 'id-card-row' }, [el('span', { class: 'k' }, 'District'), el('span', {}, farmer.district)]),
      el('div', { class: 'id-card-row' }, [el('span', { class: 'k' }, 'Phone'), el('span', {}, farmer.phone)]),
    ]),
    el('p', { class: 'hint' }, 'Give this card to the farmer to bring on future visits — it speeds up finding their record at the buying centre.'),
    downloadBtn
  );
}
