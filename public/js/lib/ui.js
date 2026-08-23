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
export function toast(message) {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast' });
    document.getElementById('app').appendChild(node);
  }
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2600);
}

export function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const update = () => {
    banner.hidden = navigator.onLine;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/**
 * Small, quiet status line showing whether a GPS fix has been captured for
 * the record being entered (see location.js). Deliberately understated: it
 * is information, not a warning - a record with no fix is perfectly valid
 * and saves normally. Its purpose is to stop staff assuming every record is
 * geotagged when some are not, so it must never claim to still be searching
 * once the attempt has actually failed.
 */
const LOCATION_TEXT = {
  idle: 'Finding location…',
  searching: 'Finding location…',
  found: 'Location captured',
  unavailable: 'Location unavailable',
};

export function locationIndicator(statusFn) {
  const node = el('p', { class: 'location-hint' });
  const render = () => {
    const state = statusFn();
    node.textContent = LOCATION_TEXT[state] || LOCATION_TEXT.idle;
    node.classList.toggle('has-fix', state === 'found');
    node.classList.toggle('no-fix', state === 'unavailable');
    // Nothing more will change once we have a fix or know we can't get one.
    if (state === 'found' || state === 'unavailable') stop();
  };
  const timer = setInterval(render, 1500);
  // Screens are replaced wholesale by mount(), so there is no teardown hook -
  // poll until the node leaves the document, then stop.
  const guard = setInterval(() => {
    if (!node.isConnected) stop();
  }, 5000);
  function stop() {
    clearInterval(timer);
    clearInterval(guard);
  }
  render();
  return node;
}
