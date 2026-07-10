/**
 * Caches the app shell (HTML/CSS/JS/icons + the pinned Firebase SDK CDN
 * files) so the app can still be opened with zero connectivity - e.g.
 * after being force-quit and reopened while offline. This is separate
 * from, and in addition to, Firestore's own offline data cache
 * (see docs/System-Architecture.md "Offline behavior in detail"):
 * Firestore only caches documents, not the page itself, so without this
 * a fresh navigation with no network never gets far enough to run any
 * app code at all - the browser shows its own "no internet" error before
 * anything here has a chance to help.
 *
 * CACHE_NAME is bumped by hand alongside APP_VERSION on every release
 * (see docs/Release-Management.md) - the old cache is deleted on
 * activate, so a stale shell can never get permanently stuck.
 */
const CACHE_NAME = 'malaika-shell-v0.5.3';

const SHELL_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/router.js',
  'js/config/firebase.config.js',
  'js/lib/auth.js',
  'js/lib/constants.js',
  'js/lib/country.js',
  'js/lib/db.js',
  'js/lib/device.js',
  'js/lib/firebase.js',
  'js/lib/header.js',
  'js/lib/icons.js',
  'js/lib/referenceData.js',
  'js/lib/sync.js',
  'js/lib/ui.js',
  'js/screens/adminApprovals.js',
  'js/screens/buyProduce.js',
  'js/screens/card.js',
  'js/screens/farmerProfile.js',
  'js/screens/findFarmer.js',
  'js/screens/history.js',
  'js/screens/home.js',
  'js/screens/login.js',
  'js/screens/newFarmer.js',
  'js/screens/notAuthorized.js',
  'js/screens/reconcile.js',
  'js/screens/tutorial.js',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/logo/icon-square.png',
  'assets/logo/logo-lockup.png',
];

// Version-pinned in the URL itself, so safe to cache indefinitely -
// these come from firebase.js's imports and are required before any
// screen can render.
const FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        [...SHELL_URLS, ...FIREBASE_SDK_URLS].map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] Could not precache', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isShellAsset(url) {
  return FIREBASE_SDK_URLS.includes(url) || SHELL_URLS.some((path) => url.endsWith('/' + path) || url.endsWith(path));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Full-page navigations (including a fresh, offline app open) always
  // get the cached app shell if the network isn't available - this is
  // the specific gap that made offline force-quit-then-reopen fail.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put('index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  if (!isShellAsset(req.url)) return; // let Firestore/Auth/API calls pass through untouched

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
