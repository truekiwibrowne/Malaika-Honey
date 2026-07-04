import { el, mount, setHeaderTitle } from '../lib/ui.js';
import { getFarmerByFrn } from '../lib/db.js';

export async function renderCard(root, { frn }) {
  setHeaderTitle('Farmer Card');
  mount(root, el('p', { class: 'hint' }, 'Loading card…'));

  const farmer = await getFarmerByFrn(frn);
  if (!farmer) {
    mount(
      root,
      el('a', { href: '#/find-farmer', class: 'back-btn' }, '← Back'),
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device.')
    );
    return;
  }

  mount(
    root,
    el('a', { href: '#/farmer/' + frn, class: 'back-btn no-print' }, '← Back'),
    el('h1', { class: 'no-print' }, 'Farmer Card'),
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
    el('p', { class: 'hint no-print' }, 'Give this card to the farmer. It speeds up their next visit — present it at the buying centre so staff can find their record quickly.'),
    el(
      'button',
      { class: 'btn btn-maroon no-print', onClick: () => window.print() },
      '🖨 Print Card'
    )
  );
}
