const routes = [];

export function addRoute(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            paramNames.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function navigate(hash) {
  if (location.hash === hash) {
    handleRoute();
  } else {
    location.hash = hash;
  }
}

function handleRoute() {
  const raw = location.hash.slice(1) || '/home';
  const [path, queryString] = raw.split('?');
  const query = new URLSearchParams(queryString || '');
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(params, query);
      return;
    }
  }
  navigate('#/home');
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
