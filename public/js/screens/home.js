import { el, mount, setHeaderTitle } from '../lib/ui.js';

export function renderHome(root) {
  setHeaderTitle('');

  mount(
    root,
    el('h1', {}, 'Malaika Honey'),
    el('p', { class: 'welcome' }, 'Welcome. What would you like to do?'),
    el('hr', { class: 'hr' }),
    el(
      'a',
      { href: '#/find-farmer', class: 'btn btn-blue' },
      [el('span', { class: 'icon' }, '🔍'), 'Find Farmer']
    ),
    el(
      'a',
      { href: '#/new-farmer', class: 'btn btn-maroon' },
      [el('span', { class: 'icon' }, '➕'), 'New Farmer']
    ),
    el(
      'a',
      { href: '#/find-farmer?intent=buy', class: 'btn btn-yellow' },
      [el('span', { class: 'icon' }, '🍯'), 'Buy Produce']
    ),
    el('div', { class: 'spacer' }),
    el('p', { class: 'hint', style: 'text-align:center' }, 'Malaika Honey Field App')
  );
}
