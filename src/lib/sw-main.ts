/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The service worker. It is written as ONE self-contained function (no imports, no outer variables) because
 * /sw.js is produced by serialising it (see app/sw.js/route.ts) and the unit tests run the very same function
 * against a fake worker environment.
 *
 * What it does, and deliberately does not do:
 *  - Static files (/_next/static, icons, manifest): cache-first. Their names carry a content hash, so they can never be stale.
 *  - A short allow-list of overview pages (dashboard, transactions, budget, goals, reports, history, simulators):
 *    network-first; the last good copy is kept (max 24 pages, 7 days) and shown only when the network fails.
 *  - Everything else is NEVER touched or stored: /api/* (exports, backups, notifications), server actions (POST),
 *    React Server Component requests, settings, setup, backup/import, notifications, the portfolio page (Trading 212 data),
 *    attachments, other origins (so Trading 212 itself) and any non-GET request.
 *  - Offline navigation without a stored copy shows /offline.html.
 *  - A new version waits until the user taps "Update" (SKIP_WAITING); old caches are deleted when it takes over.
 */
export function serviceWorkerMain(self: any, VERSION: string) {
  const STATIC_CACHE = 'nestfund-static-' + VERSION;
  const PAGE_CACHE = 'nestfund-pages-' + VERSION;
  const PRECACHE = ['/offline.html', '/icon.svg', '/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];
  const PAGE_ALLOW = [/^\/$/, /^\/transactions\/?$/, /^\/transactions\/new\/?$/, /^\/budget\/?$/, /^\/goals\/?$/, /^\/reports\/?$/, /^\/history\/?$/, /^\/simulators\/?$/];
  const MAX_PAGES = 24;
  const PAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const NETWORK_TIMEOUT_MS = 4000;
  const STAMP = 'x-nestfund-cached-at';

  const isStaticAsset = (url: URL) => url.pathname.startsWith('/_next/static/') || PRECACHE.indexOf(url.pathname) >= 0;
  const isCacheablePage = (url: URL) => PAGE_ALLOW.some((re) => re.test(url.pathname));
  /** Next.js client navigations and server actions carry these; they must always go straight to the network. */
  const isFramework = (req: any, url: URL) => req.headers.has('RSC') || req.headers.has('Next-Action') || req.headers.has('Next-Router-State-Tree') || url.searchParams.has('_rsc');

  const pageKey = (url: URL) => {
    const u = new URL(url.href);
    u.hash = '';
    u.searchParams.delete('_rsc');
    return u.pathname + u.search;
  };

  async function offlineResponse() {
    const cache = await self.caches.open(STATIC_CACHE);
    return (await cache.match('/offline.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  /** `response` must be a clone that nobody else reads. */
  async function storePage(key: string, response: Response) {
    // Only a plain, successful HTML page; never a redirect (e.g. to a login), an error or anything with cookies.
    const type = response.headers.get('content-type') || '';
    if (!response.ok || response.status !== 200 || response.redirected || (response.type !== 'basic' && response.type !== 'default') || type.indexOf('text/html') !== 0 || response.headers.has('set-cookie')) return;
    const headers = new Headers(response.headers);
    headers.set(STAMP, String(Date.now()));
    const copy = new Response(await response.blob(), { status: 200, statusText: 'OK', headers });
    const cache = await self.caches.open(PAGE_CACHE);
    await cache.delete(key);
    await cache.put(key, copy);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]); // oldest first
  }

  async function storedPage(key: string) {
    const cache = await self.caches.open(PAGE_CACHE);
    const hit = await cache.match(key);
    if (!hit) return null;
    const at = Number(hit.headers.get(STAMP) || 0);
    if (!at || Date.now() - at > PAGE_TTL_MS) {
      await cache.delete(key);
      return null;
    }
    return hit;
  }

  /**
   * A stored page served instead of a live one gets a marker in its <head>, so the app can tell the user it is a saved copy
   * (this also covers "the server is unreachable", which the browser's online/offline events do not report).
   */
  async function asSavedCopy(hit: Response) {
    const at = hit.headers.get(STAMP) || '';
    const html = (await hit.text()).replace('</head>', '<meta name="nestfund-offline-copy" content="' + at + '"></head>');
    const headers = new Headers(hit.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(html, { status: 200, statusText: 'OK', headers });
  }

  async function savedCopy(key: string) {
    const hit = await storedPage(key);
    return hit ? asSavedCopy(hit) : null;
  }

  async function handleNavigation(event: any, url: URL) {
    const key = pageKey(url);
    const cacheable = isCacheablePage(url);
    try {
      // The copy for the cache is cloned the moment the response arrives, before the page starts reading it.
      const network = fetch(event.request).then((r: Response) => {
        if (cacheable) event.waitUntil(storePage(key, r.clone()).catch(() => undefined));
        return r;
      });
      // A slow connection falls back to the stored copy after a few seconds, but the real response still refreshes it.
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
      const first = cacheable ? await Promise.race([network, timeout]) : await network;
      return first || (await savedCopy(key)) || (await network);
    } catch {
      return (cacheable && (await savedCopy(key))) || (await offlineResponse());
    }
  }

  async function cacheFirst(request: Request) {
    const cache = await self.caches.open(STATIC_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.status === 200 && (response.type === 'basic' || response.type === 'default')) await cache.put(request, response.clone());
    return response;
  }

  self.addEventListener('install', (event: any) => {
    event.waitUntil(
      self.caches.open(STATIC_CACHE).then((cache: any) =>
        // One by one: a single failure (for example a 401 behind Basic Auth) must not break the installation.
        Promise.all(PRECACHE.map((path) => cache.add(new Request(path, { cache: 'reload' })).catch(() => undefined))),
      ),
    );
    // No skipWaiting here: an open page keeps matching its own JavaScript until the user accepts the update.
  });

  self.addEventListener('activate', (event: any) => {
    event.waitUntil(
      (async () => {
        const names: string[] = await self.caches.keys();
        await Promise.all(names.filter((n) => n.indexOf('nestfund-') === 0 && n !== STATIC_CACHE && n !== PAGE_CACHE).map((n) => self.caches.delete(n)));
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener('message', (event: any) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  });

  self.addEventListener('fetch', (event: any) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/sw.js') return;
    if (isFramework(req, url)) return;
    if (isStaticAsset(url)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    if (req.mode === 'navigate') event.respondWith(handleNavigation(event, url));
  });
}
