import { el, mount, toast } from '../lib/ui.js';
import { getFarmerByFrnFromCache } from '../lib/db.js';
import { iconEl } from '../lib/icons.js';

function resetDownloadBtnLabel(btn) {
  btn.replaceChildren(iconEl('download'), document.createTextNode(' Download PDF'));
}

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

/**
 * Same URL a generic phone camera/QR app would open directly to this
 * farmer's profile - the in-app scanner (qrScanner.js) parses the FRN
 * back out of this exact format, so changing it here must stay in sync
 * with that parser.
 */
function farmerProfileUrl(farmer) {
  return location.origin + '/#/farmer/' + farmer.frn;
}

async function generateQrDataUrl(text) {
  const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm');
  const QRCode = mod.default || mod;
  return QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#7c2328', light: '#ffffff' } });
}

async function downloadFarmerCardPdf(farmer, qrDataUrl) {
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

  // Value column is narrower than the card's full width (was 79.6) to
  // leave room for the QR code in the bottom-right corner.
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
    doc.text(String(value || '—'), 58, y, { align: 'right' });
    y += 5.2;
  });

  doc.addImage(qrDataUrl, 'PNG', 64, 33, 15.6, 15.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  doc.setTextColor(230, 210, 210);
  doc.text('Scan to find', 71.8, 50.5, { align: 'center' });

  doc.save(farmer.frn + '-malaika-honey-card.pdf');
}

export async function renderCard(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading card…'));

  const farmer = await getFarmerByFrnFromCache(frn);
  if (!farmer) {
    mount(root, el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device.'));
    return;
  }

  let qrDataUrl = null;
  try {
    qrDataUrl = await generateQrDataUrl(farmerProfileUrl(farmer));
  } catch (err) {
    console.error(err);
    // Non-fatal - the card still works without the QR code, e.g. offline
    // the first time this library hasn't been cached yet.
  }

  const downloadBtn = el('button', {
    class: 'btn btn-maroon',
    onClick: async () => {
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Preparing PDF…';
      try {
        const qr = qrDataUrl || (await generateQrDataUrl(farmerProfileUrl(farmer)));
        await downloadFarmerCardPdf(farmer, qr);
      } catch (err) {
        console.error(err);
        toast('Could not generate the PDF. Check your connection and try again.');
      } finally {
        downloadBtn.disabled = false;
        resetDownloadBtnLabel(downloadBtn);
      }
    },
  });
  resetDownloadBtnLabel(downloadBtn);

  mount(
    root,
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
      qrDataUrl ? el('img', { class: 'id-card-qr', src: qrDataUrl, alt: 'QR code to find this farmer' }) : null,
    ]),
    el('p', { class: 'hint' }, 'Give this card to the farmer to bring on future visits — it speeds up finding their record at the buying centre.'),
    downloadBtn
  );
}
