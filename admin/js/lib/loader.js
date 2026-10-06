/**
 * On-demand loading of the three third-party libraries the management app
 * uses. None of them is needed to sign in or browse records, so each is
 * fetched only by the screen that needs it - the dashboard stays as quick
 * to open as it was before charts existed.
 *
 * Every file is pinned to an exact version AND a Subresource Integrity
 * hash. This tool can edit farmer and purchase records, so a CDN serving
 * altered code must fail to load rather than run with an admin's session.
 * To upgrade a library: change the URL, then recompute its hash with
 *   curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A
 *
 * SheetJS comes from its own CDN, not cdnjs: the copy on cdnjs/npm is stuck
 * at 0.18.5, which has known vulnerabilities when parsing crafted files -
 * and parsing uploaded files is exactly what Import does.
 */

const LIBS = {
  chart: {
    global: 'Chart',
    scripts: [
      ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', 'sha384-bs/nf9FbdNouRbMiFcrcZfLXYPKiPaGVGplVbv7dLGECccEXDW+S3zjqSKR5ZEaD'],
    ],
  },
  leaflet: {
    global: 'L',
    // The shared map picker (shared/mapPicker.js) may already have loaded
    // Leaflet itself - so "ready" also needs the cluster plugin, and each
    // script is skipped if what it provides is already there.
    ready: () => window.L && window.L.markerClusterGroup,
    skip: [() => !!window.L, () => !!(window.L && window.L.markerClusterGroup)],
    styles: [
      ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css', 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'],
      ['https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css', 'sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV'],
      ['https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css', 'sha384-wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+'],
    ],
    // Order matters: the cluster plugin extends the L global.
    scripts: [
      ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'],
      ['https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js', 'sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr'],
    ],
  },
  xlsx: {
    global: 'XLSX',
    scripts: [
      ['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT'],
    ],
  },
};

const pending = {};

function addTag(tag, attrs) {
  return new Promise((resolve, reject) => {
    const node = document.createElement(tag);
    Object.assign(node, attrs);
    node.crossOrigin = 'anonymous';
    node.onload = () => resolve();
    node.onerror = () => reject(new Error('Could not load ' + (attrs.src || attrs.href) + '. Check your internet connection.'));
    document.head.appendChild(node);
  });
}

/** Resolves to the library's global (window.Chart, window.L, window.XLSX). */
export function loadLib(name) {
  const lib = LIBS[name];
  if (!lib) return Promise.reject(new Error('Unknown library ' + name));
  const ready = lib.ready ? lib.ready() : window[lib.global];
  if (ready && !pending[name]) return Promise.resolve(window[lib.global]);
  if (!pending[name]) {
    pending[name] = (async () => {
      await Promise.all((lib.styles || [])
        .filter(([href]) => !document.querySelector('link[href="' + href + '"]'))
        .map(([href, integrity]) => addTag('link', { rel: 'stylesheet', href, integrity })));
      for (let i = 0; i < lib.scripts.length; i++) {
        if (lib.skip && lib.skip[i] && lib.skip[i]()) continue;
        const [src, integrity] = lib.scripts[i];
        await addTag('script', { src, integrity });
      }
      return window[lib.global];
    })().catch((err) => {
      delete pending[name]; // allow a retry after a network blip
      throw err;
    });
  }
  return pending[name];
}
