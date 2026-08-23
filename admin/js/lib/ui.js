export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.filter((n) => n !== null && n !== undefined && n !== false));
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast' });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.className = 'toast toast-' + kind;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3200);
}

export function formatUgx(amount) {
  const value = Math.round(Number(amount) || 0);
  return 'UGX ' + value.toLocaleString('en-UG');
}

export function formatKg(kg) {
  return (Number(kg) || 0).toFixed(1) + ' kg';
}

export function formatDate(value) {
  if (!value) return '—';
  const d = value && value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = value && value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Renders a stored location as coordinates plus a maps link, or a dash. */
export function formatLocation(loc) {
  if (!loc || typeof loc.lat !== 'number') return '—';
  return loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + (loc.accuracyM ? ' (±' + loc.accuracyM + 'm)' : '');
}

export function mapsLink(loc) {
  if (!loc || typeof loc.lat !== 'number') return null;
  return el(
    'a',
    { href: 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng, target: '_blank', rel: 'noopener', class: 'maps-link' },
    'View on map'
  );
}

export function table(headers, rows) {
  return el('div', { class: 'table-wrap' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', {}, h)))]),
      el('tbody', {}, rows),
    ]),
  ]);
}

export function emptyState(message) {
  return el('div', { class: 'empty-state' }, message);
}

export function spinner(message = 'Loading…') {
  return el('div', { class: 'loading' }, [el('div', { class: 'spinner' }), el('p', {}, message)]);
}
