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
  return (Number(kg) || 0).toLocaleString('en-UG', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';
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

export function formatNumber(n, digits = 0) {
  return (Number(n) || 0).toLocaleString('en-UG', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** 1,284 / 12.9K / 4.2M - for stat tiles, never for tables. */
export function compact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const short = (x, digits) => x.toFixed(digits).replace(/\.0$/, '');
  if (abs >= 1e9) return short(v / 1e9, abs >= 1e10 ? 0 : 1) + 'B';
  if (abs >= 1e6) return short(v / 1e6, abs >= 1e7 ? 0 : 1) + 'M';
  if (abs >= 1e4) return short(v / 1e3, abs >= 1e5 ? 0 : 1) + 'K';
  return Math.round(v).toLocaleString('en-UG');
}

/**
 * Segmented toggle. options: [{ value, label }]. Returns the element; its
 * `value` property reflects the current choice.
 */
export function segmented(options, value, onChange, label = '') {
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || null });
  group.value = value;
  const buttons = options.map((o) =>
    el('button', {
      type: 'button',
      role: 'radio',
      class: 'seg' + (o.value === value ? ' active' : ''),
      'aria-checked': o.value === value ? 'true' : 'false',
      onClick: () => {
        if (group.value === o.value) return;
        group.value = o.value;
        buttons.forEach((b, i) => {
          const on = options[i].value === o.value;
          b.classList.toggle('active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        onChange(o.value);
      },
    }, o.label)
  );
  group.replaceChildren(...buttons);
  return group;
}

/**
 * Modal dialog on the native <dialog> element (focus trap, Esc to close and
 * a backdrop for free). `build(close)` returns the body nodes. Resolves with
 * whatever close(value) is called with (undefined on Esc / Cancel).
 */
export function openDialog(title, build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog' + (wide ? ' dialog-wide' : '') });
    let result;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.append(
      el('div', { class: 'dialog-head' }, [
        el('h3', {}, title),
        el('button', { type: 'button', class: 'dialog-x', 'aria-label': 'Close', onClick: () => close() }, '×'),
      ]),
      el('div', { class: 'dialog-body' }, build(close))
    );
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

/** Yes/no confirmation. Resolves true only on confirm. */
export function confirmDialog(title, message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return openDialog(title, (close) => [
    ...[].concat(message).map((m) => (typeof m === 'string' ? el('p', {}, m) : m)),
    el('div', { class: 'dialog-actions' }, [
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => close(false) }, 'Cancel'),
      el('button', { type: 'button', class: 'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-maroon'), onClick: () => close(true) }, confirmLabel),
    ]),
  ]).then((v) => v === true);
}

/** Tab strip. tabs: [{ key, label }]. Calls onSelect(key). */
export function tabs(items, active, onSelect) {
  return el('div', { class: 'tabs', role: 'tablist' }, items.map((t) =>
    el('button', {
      type: 'button',
      role: 'tab',
      class: 'tab' + (t.key === active ? ' active' : ''),
      'aria-selected': t.key === active ? 'true' : 'false',
      onClick: () => onSelect(t.key),
    }, t.label)
  ));
}

/** Parses '#/route?x=1' query params from the current hash. */
export function hashQuery() {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q);
}

/** Excel + CSV download buttons, as a pair. onPick('xlsx' | 'csv'). */
export function exportButtons(onPick) {
  const run = (format, btn) => async () => {
    btn.disabled = true;
    try {
      await onPick(format);
    } catch (err) {
      console.error(err);
      toast('Export failed: ' + (err.message || 'unknown error'), 'error');
    } finally {
      btn.disabled = false;
    }
  };
  const xlsx = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'Export Excel');
  const csv = el('button', { type: 'button', class: 'btn btn-outline btn-sm' }, 'CSV');
  xlsx.addEventListener('click', run('xlsx', xlsx));
  csv.addEventListener('click', run('csv', csv));
  return [xlsx, csv];
}
