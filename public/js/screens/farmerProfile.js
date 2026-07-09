import { el, mount } from '../lib/ui.js';
import { getFarmerByFrn } from '../lib/db.js';
import { formatUgx, formatDate } from '../lib/constants.js';
import { iconEl } from '../lib/icons.js';

export async function renderFarmerProfile(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading farmer…'));

  const farmer = await getFarmerByFrn(frn);

  if (!farmer) {
    mount(
      root,
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device. Reconnect to the internet and try again.')
    );
    return;
  }

  const stats = farmer.lifetimeStats || {};

  mount(
    root,
    el('h1', {}, farmer.fullName),
    el('p', { class: 'welcome' }, 'Farmer profile.'),
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
        el('div', { class: 'stat-label' }, 'Lifetime'),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-value' }, formatDate(stats.lastPurchaseAt)),
        el('div', { class: 'stat-label' }, 'Last Delivery'),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-value' }, formatUgx(stats.totalPaidUgx || 0)),
        el('div', { class: 'stat-label' }, 'Total Paid'),
      ]),
    ]),

    el('a', { href: '#/buy/' + farmer.frn, class: 'btn btn-yellow' }, [iconEl('honeyJar'), 'Buy Produce']),
    el('a', { href: '#/history/' + farmer.frn, class: 'btn btn-blue' }, [iconEl('history'), 'History']),
    el('a', { href: '#/card/' + farmer.frn, class: 'btn btn-outline' }, [iconEl('idCard'), 'Farmer Card'])
  );
}
