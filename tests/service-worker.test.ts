import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceWorkerMain } from '@/lib/sw-main';

// The worker is run exactly as /sw.js ships it: serialised to text and evaluated with no access to this module's scope
// (so a hidden outer reference would throw here), against a small fake of the service-worker environment.

const ORIGIN = 'https://nestfund.test';
type Handler = (event: unknown) => void;

function makeWorld() {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const urlOf = (x: Request | string) => new URL(typeof x === 'string' ? x : x.url, ORIGIN).href;

  const openCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: Request | string) => m.get(urlOf(r))?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(urlOf(r), res),
      add: async (r: Request | string) => {
        const res = await fetch(r as Request);
        if (!res.ok) throw new Error('bad response');
        m.set(urlOf(r), res);
      },
      delete: async (r: Request | string) => m.delete(urlOf(r)),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
    };
  };

  const self = {
    location: { origin: ORIGIN },
    caches: {
      open: async (n: string) => openCache(n),
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
    },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
  };

  const run = new Function('return (' + serviceWorkerMain.toString() + ')')() as typeof serviceWorkerMain;
  run(self, 'v1');

  const fire = (req: Request) => {
    const event = {
      request: req,
      response: null as Promise<Response> | null,
      waits: [] as Promise<unknown>[],
      respondWith(p: Promise<Response>) {
        this.response = p;
      },
      waitUntil(p: Promise<unknown>) {
        this.waits.push(p);
      },
    };
    handlers.fetch(event);
    return event;
  };
  /** Dispatches a request and settles everything the worker started. Returns null when the worker did not take the request. */
  const go = async (req: Request) => {
    const ev = fire(req);
    const res = ev.response ? await ev.response : null;
    await Promise.all(ev.waits);
    return res;
  };
  const pagesCache = () => stores.get('nestfund-pages-v1');
  return { self, handlers, stores, go, fire, pagesCache };
}

const html = (body = '<html>page</html>', init: ResponseInit = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
const nav = (path: string) => {
  const req = new Request(ORIGIN + path);
  Object.defineProperty(req, 'mode', { value: 'navigate' });
  return req;
};

let online = true;
let routes: (url: URL) => Response | Promise<Response>;
let fetchCalls: string[];

const RealRequest = Request;
beforeEach(() => {
  // In a real worker `new Request('/offline.html')` resolves against the worker's origin; Node needs that spelled out.
  vi.stubGlobal(
    'Request',
    class extends RealRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' && input.startsWith('/') ? ORIGIN + input : input, init);
      }
    },
  );
  online = true;
  fetchCalls = [];
  routes = () => html();
  vi.stubGlobal('fetch', async (input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN);
    fetchCalls.push(url.pathname + url.search);
    if (!online) throw new TypeError('Failed to fetch');
    return routes(url);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('what the worker never touches', () => {
  it.each([
    ['a POST (server action or form)', () => new Request(ORIGIN + '/transactions', { method: 'POST', body: 'x' })],
    ['an API export', () => new Request(ORIGIN + '/api/transactions/export')],
    ['a backup download', () => new Request(ORIGIN + '/api/backup/file?name=nestfund-backup-x.json')],
    ['the notifications count', () => new Request(ORIGIN + '/api/notifications')],
    ['Trading 212 or any other origin', () => new Request('https://live.trading212.com/api/v0/equity/account/summary')],
    ['a React Server Component request', () => new Request(ORIGIN + '/budget', { headers: { RSC: '1' } })],
    ['a router prefetch', () => new Request(ORIGIN + '/budget?_rsc=abc')],
    ['a server action call', () => new Request(ORIGIN + '/', { headers: { 'Next-Action': 'abc' } })],
    ['its own script', () => new Request(ORIGIN + '/sw.js')],
  ])('lets %s go straight to the network', async (_name, make) => {
    const w = makeWorld();
    expect(w.fire(make()).response).toBeNull();
    expect(fetchCalls).toEqual([]);
    expect(w.stores.size).toBe(0);
  });

  it.each(['/settings', '/settings/backup', '/settings/backup/import?token=1', '/setup', '/notifications', '/portfolio', '/transactions/12', '/transactions/rules/apply?rule=1', '/api/health'])(
    'never stores %s, even after a successful visit',
    async (path) => {
      const w = makeWorld();
      await w.go(nav(path));
      expect(w.pagesCache()?.size ?? 0).toBe(0);
    },
  );

  it('shows the offline page, not stored data, for pages that are not on the allow-list', async () => {
    const w = makeWorld();
    routes = (u) => (u.pathname === '/offline.html' ? html('OFFLINE PAGE') : html('SECRET SETTINGS'));
    await w.handlers.install({ waitUntil: (p: Promise<unknown>) => p });
    await w.go(nav('/settings'));
    online = false;
    const res = await w.go(nav('/settings'));
    expect(await res!.text()).toBe('OFFLINE PAGE');
  });
});

describe('visited overview pages work offline', () => {
  it('serves the network response when online and keeps a stamped copy', async () => {
    const w = makeWorld();
    routes = () => html('<html>budget v1</html>');
    const res = await w.go(nav('/budget'));
    expect(await res!.text()).toBe('<html>budget v1</html>');
    const stored = await w.pagesCache()!.get(ORIGIN + '/budget')!;
    expect(await stored.clone().text()).toBe('<html>budget v1</html>');
    expect(Number(stored.headers.get('x-nestfund-cached-at'))).toBeGreaterThan(0);
  });

  it('serves the last copy when the network fails, and the fresh page again when it is back', async () => {
    const w = makeWorld();
    routes = () => html('old');
    await w.go(nav('/'));
    online = false;
    expect(await (await w.go(nav('/')))!.text()).toBe('old');
    online = true;
    routes = () => html('new');
    expect(await (await w.go(nav('/')))!.text()).toBe('new');
    online = false;
    expect(await (await w.go(nav('/')))!.text()).toBe('new'); // the copy was refreshed
  });

  it('marks a stored page it serves as a saved copy, but never stores the marker', async () => {
    const w = makeWorld();
    routes = () => html('<html><head><title>x</title></head><body>b</body></html>');
    const live = await (await w.go(nav('/')))!.text();
    expect(live).not.toContain('nestfund-offline-copy'); // a live page is untouched
    online = false;
    const copy = await (await w.go(nav('/')))!.text();
    expect(copy).toMatch(/<meta name="nestfund-offline-copy" content="\d+"><\/head>/);
    const stored = await w.pagesCache()!.get(ORIGIN + '/')!.clone().text();
    expect(stored).not.toContain('nestfund-offline-copy');
  });

  it('keeps each filter combination separately', async () => {
    const w = makeWorld();
    routes = (u) => html(u.search || 'none');
    await w.go(nav('/transactions'));
    await w.go(nav('/transactions?month=2026-05'));
    online = false;
    expect(await (await w.go(nav('/transactions?month=2026-05')))!.text()).toBe('?month=2026-05');
    expect(await (await w.go(nav('/transactions')))!.text()).toBe('none');
  });

  it('falls back to the offline page when a visited page was never stored', async () => {
    const w = makeWorld();
    routes = (u) => (u.pathname === '/offline.html' ? html('OFFLINE PAGE') : html());
    await w.handlers.install({ waitUntil: (p: Promise<unknown>) => p });
    online = false;
    expect(await (await w.go(nav('/reports')))!.text()).toBe('OFFLINE PAGE');
  });

  it('uses the stored copy when the network is slower than 4 seconds, without losing the real response', async () => {
    vi.useFakeTimers();
    const w = makeWorld();
    routes = () => html('stored');
    const warm = w.go(nav('/goals'));
    await vi.runAllTimersAsync();
    await warm;
    let release: (r: Response) => void = () => undefined;
    routes = () => new Promise<Response>((resolve) => (release = resolve));
    const ev = w.fire(nav('/goals'));
    await vi.advanceTimersByTimeAsync(4100);
    expect(await (await ev.response)!.text()).toBe('stored');
    release(html('fresh'));
    await vi.advanceTimersByTimeAsync(0); // let the late response reach the worker
    await Promise.all(ev.waits);
    const stored = w.pagesCache()!.get(ORIGIN + '/goals')!;
    expect(await stored.clone().text()).toBe('fresh');
  });
});

describe('what is never stored as a page', () => {
  it.each([
    ['an error', () => html('boom', { status: 500 })],
    ['an authentication challenge', () => new Response('no', { status: 401, headers: { 'content-type': 'text/html' } })],
    ['a response that sets a cookie', () => html('x', { headers: { 'content-type': 'text/html', 'set-cookie': 'a=b' } })],
    ['something that is not HTML', () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })],
  ])('%s', async (_n, make) => {
    const w = makeWorld();
    routes = make;
    await w.go(nav('/budget'));
    expect(w.pagesCache()?.size ?? 0).toBe(0);
  });

  it('copies older than 7 days are discarded instead of shown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    const w = makeWorld();
    routes = (u) => (u.pathname === '/offline.html' ? html('OFFLINE PAGE') : html('old page'));
    await w.handlers.install({ waitUntil: (p: Promise<unknown>) => p });
    const warm = w.go(nav('/history'));
    await vi.runAllTimersAsync();
    await warm;
    online = false;
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
    expect(await (await w.go(nav('/history')))!.text()).toBe('old page');
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    expect(await (await w.go(nav('/history')))!.text()).toBe('OFFLINE PAGE');
    expect(w.pagesCache()!.size).toBe(0);
  });

  it('keeps at most 24 pages, dropping the oldest', async () => {
    const w = makeWorld();
    routes = (u) => html(u.search);
    for (let i = 1; i <= 30; i++) await w.go(nav(`/transactions?month=2026-${String((i % 12) + 1).padStart(2, '0')}&page=${i}`));
    expect(w.pagesCache()!.size).toBe(24);
    expect(w.pagesCache()!.has(ORIGIN + '/transactions?month=2026-02&page=1')).toBe(false);
    expect(w.pagesCache()!.has(ORIGIN + '/transactions?month=2026-07&page=30'.replace('07', String((30 % 12) + 1).padStart(2, '0')))).toBe(true);
  });
});

describe('static files', () => {
  it('are fetched once and then served from the cache', async () => {
    const w = makeWorld();
    routes = () => new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript' } });
    await w.go(new Request(ORIGIN + '/_next/static/chunks/main-abc123.js'));
    online = false;
    const res = await w.go(new Request(ORIGIN + '/_next/static/chunks/main-abc123.js'));
    expect(await res!.text()).toBe('console.log(1)');
    expect(fetchCalls).toHaveLength(1);
  });

  it('a failed static request is not cached', async () => {
    const w = makeWorld();
    routes = () => new Response('nope', { status: 404 });
    await w.go(new Request(ORIGIN + '/_next/static/chunks/gone.js'));
    expect(w.stores.get('nestfund-static-v1')?.size ?? 0).toBe(0);
  });
});

describe('installing and updating', () => {
  it('precaches the offline page and icons, and a failing file does not break the install', async () => {
    const w = makeWorld();
    routes = (u) => (u.pathname === '/icon.svg' ? new Response('no', { status: 401 }) : new Response('ok'));
    const waits: Promise<unknown>[] = [];
    w.handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await expect(Promise.all(waits)).resolves.toBeDefined();
    const cached = [...w.stores.get('nestfund-static-v1')!.keys()].map((u) => new URL(u).pathname);
    expect(cached).toContain('/offline.html');
    expect(cached).toContain('/icons/icon-192.png');
    expect(cached).not.toContain('/icon.svg');
  });

  it('does not take over on its own: the user accepts the update first', async () => {
    const w = makeWorld();
    w.handlers.install({ waitUntil: () => undefined });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: 'SOMETHING_ELSE' } });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('on activation it removes the caches of older versions only, and claims the open pages', async () => {
    const w = makeWorld();
    for (const n of ['nestfund-static-v0', 'nestfund-pages-v0', 'nestfund-static-v1', 'nestfund-pages-v1', 'someone-elses-cache']) await w.self.caches.open(n);
    const waits: Promise<unknown>[] = [];
    w.handlers.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect([...w.stores.keys()].sort()).toEqual(['nestfund-pages-v1', 'nestfund-static-v1', 'someone-elses-cache']);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });
});
