import { el, mount, setHeaderTitle } from '../lib/ui.js';
import { searchFarmers } from '../lib/db.js';

let debounceTimer = null;

export function renderFindFarmer(root, query) {
  setHeaderTitle('Find Farmer');
  const intent = query ? query.get('intent') : null;
  const destPrefix = intent === 'buy' ? '#/buy/' : '#/farmer/';

  const resultsBox = el('div', { class: 'field', style: 'gap:10px' });

  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Search by name, FRN or phone',
    autofocus: true,
    onInput: (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value;
      debounceTimer = setTimeout(() => runSearch(value), 300);
    },
  });

  async function runSearch(value) {
    if (!value || value.trim().length < 2) {
      resultsBox.replaceChildren(el('p', { class: 'hint' }, 'Type at least 2 characters to search.'));
      return;
    }
    resultsBox.replaceChildren(el('p', { class: 'hint' }, 'Searching…'));
    try {
      const farmers = await searchFarmers(value);
      if (!farmers.length) {
        resultsBox.replaceChildren(el('div', { class: 'empty-state' }, 'No matching farmer found.'));
        return;
      }
      resultsBox.replaceChildren(
        ...farmers.map((f) =>
          el(
            'a',
            { href: destPrefix + f.frn, class: 'result-item' },
            [
              el('span', { class: 'name' }, f.fullName),
              el('span', { class: 'sub' }, f.village + ' · ' + f.frn),
            ]
          )
        )
      );
    } catch (err) {
      console.error(err);
      resultsBox.replaceChildren(
        el('div', { class: 'empty-state' }, 'Search failed. If you are offline, only farmers already seen on this phone can be found.')
      );
    }
  }

  mount(
    root,
    el('a', { href: '#/home', class: 'back-btn' }, '← Back'),
    el('h1', {}, 'Find Farmer'),
    el('p', { class: 'welcome' }, intent === 'buy' ? 'Find the farmer to record a purchase for.' : 'Search by name, FRN or phone number.'),
    el('div', { class: 'field' }, [searchInput]),
    resultsBox
  );

  searchInput.focus();
}
