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
