import { el, mount } from '../lib/ui.js';
import { APP_VERSION } from '../lib/constants.js';

export function renderHome(root) {
  mount(
    root,
    el('h1', {}, 'Welcome'),
    el('p', { class: 'welcome' }, 'What would you like to do?'),
    el('hr', { class: 'hr' }),
    el('div', { class: 'home-buttons' }, [
      // Find Farmer button hidden for now (not useful enough on its own yet
      // - staff reach the same search screen via Buy Produce). The
      // #/find-farmer route and screen are untouched so this can come back.
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
    ]),
    el('div', { class: 'home-footer' }, [
      el('p', {}, 'Malaika Honey Field App'),
      el('p', {}, 'v' + APP_VERSION),
    ])
  );
}
