const routes = [];
let hooks = {};

export function addRoute(pattern, handler, options = {}) {
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
  routes.push({ regex, paramNames, handler, options });
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

      if (hooks.isAuthenticated) {
        const authed = hooks.isAuthenticated();
        if (!route.options.public && !authed) {
          navigate('#/login');
          return;
        }
        if (route.options.public && authed) {
          navigate('#/home');
          return;
        }
      }

      if (hooks.onRouteMatched) hooks.onRouteMatched(route.options, params, query);
      route.handler(params, query);
      return;
    }
  }
  navigate('#/home');
}

export function startRouter(routerHooks = {}) {
  hooks = routerHooks;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
