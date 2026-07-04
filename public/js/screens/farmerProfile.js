import { el, mount, setHeaderTitle, toast } from '../lib/ui.js';
import { getFarmerByFrn } from '../lib/db.js';
import { formatUgx, formatDate } from '../lib/constants.js';

export async function renderFarmerProfile(root, { frn }) {
  setHeaderTitle('Farmer Profile');
  mount(root, el('p', { class: 'hint' }, 'Loading farmer…'));

  const farmer = await getFarmerByFrn(frn);

  if (!farmer) {
    mount(
      root,
      el('a', { href: '#/find-farmer', class: 'back-btn' }, '← Back'),
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device. Reconnect to the internet and try again.')
    );
    return;
  }

  const stats = farmer.lifetimeStats || {};

  mount(
    root,
    el('a', { href: '#/find-farmer', class: 'back-btn' }, '← Back'),
    el('h1', {}, farmer.fullName),
    el('div', { class: 'frn-badge' }, 'FRN ' + farmer.frn),

    el('div', { class: 'card' }, [
      el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
        el('span', { class: 'sub' }, 'Village'),
        el('span', {}, farmer.village + ', ' + farmer.district),
      ]),
      el('div', { class: 'history-item', style: 'border:none;background:none;padding:4px 0' }, [
        el('span', { class: 'sub' }, 'Phone'),
        el('span', {}, farmer.phone),
      ]),
    ]),

    el('div', { class: 'stat-row' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-value' }, (stats.totalKg || 0).toFixed(1) + ' kg'),
        el('div', { class: 'stat-label' }, 'Lifetime Product'),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-value' }, formatDate(stats.lastPurchaseAt)),
        el('div', { class: 'stat-label' }, 'Last Delivery'),
      ]),
    ]),
    el('div', { class: 'stat-row' }, [
      el('div', { class: 'stat', style: 'flex:1' }, [
        el('div', { class: 'stat-value' }, formatUgx(stats.totalPaidUgx || 0)),
        el('div', { class: 'stat-label' }, 'Total Paid'),
      ]),
    ]),

    el('hr', { class: 'hr' }),

    el('a', { href: '#/buy/' + farmer.frn, class: 'btn btn-yellow' }, [el('span', { class: 'icon' }, '🍯'), 'Buy Produce']),
    el('a', { href: '#/history/' + farmer.frn, class: 'btn btn-blue' }, [el('span', { class: 'icon' }, '📜'), 'History']),
    el('a', { href: '#/card/' + farmer.frn, class: 'btn btn-outline' }, [el('span', { class: 'icon' }, '🪪'), 'Print Card']),
    el(
      'button',
      {
        class: 'btn btn-secondary',
        onClick: () => toast('Editing farmer details is coming in a future update.'),
      },
      [el('span', { class: 'icon' }, '✏'), 'Edit Details']
    )
  );
}
