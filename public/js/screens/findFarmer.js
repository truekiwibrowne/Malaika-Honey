import { el, mount } from '../lib/ui.js';
import { searchFarmers } from '../lib/db.js';

let debounceTimer = null;

export function renderFindFarmer(root) {
  const resultsBox = el('div', { class: 'field', style: 'gap:10px' });

  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Farmer Registration Number, name, phone',
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
            { href: '#/farmer/' + f.frn, class: 'result-item' },
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
    el('h1', {}, 'Existing Farmer'),
    el('p', { class: 'welcome' }, 'Find a farmer profile.'),
    el('div', { class: 'field' }, [searchInput]),
    resultsBox
  );

  searchInput.focus();
}
