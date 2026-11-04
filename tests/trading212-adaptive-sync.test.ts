import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real storage code against a throwaway database; only the Trading 212 HTTP API is mocked.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-t212-adaptive-'));
process.env.DATA_DIR = dir;
delete process.env.NESTFUND_SECRET;

const SUMMARY = {
  cash: { availableToTrade: 12.5, inPies: 0, reservedForOrders: 0 },
  currency: 'EUR',
  investments: { currentValue: 9229.8, totalCost: 8255.97, unrealizedProfitLoss: 973.83 },
  totalValue: 9242.3,
};
const POSITIONS = [{ instrument: { ticker: 'IWDAa_EQ', name: 'MSCI World' }, quantity: 84, averagePricePaid: 98, currentPrice: 110, walletImpact: { currentValue: 9229.8, unrealizedProfitLoss: 973.83 } }];

let summary: unknown = SUMMARY;
let status = 200;
let headers: Record<string, string> = {};
let gate: Promise<void> | null = null;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method !== 'GET') throw new Error('non-GET request');
  if (gate) await gate;
  const body = status === 200 ? (url.endsWith('/summary') ? summary : POSITIONS) : {};
  return new Response(JSON.stringify(body), { status, headers });
});

type T212Module = typeof import('@/lib/t212');
type DbModule = typeof import('@/lib/db');
let t212: T212Module;
let db: DbModule;

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  db = await import('@/lib/db');
  t212 = await import('@/lib/t212');
});
afterAll(() => {
  vi.unstubAllGlobals();
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const patchState = (fn: (s: Record<string, any>) => void) => {
  const row = db.getDb().prepare("SELECT value FROM settings WHERE key = 't212'").get() as { value: string };
  const s = JSON.parse(row.value);
  fn(s);
  db.getDb().prepare("UPDATE settings SET value = ? WHERE key = 't212'").run(JSON.stringify(s));
};
/** Pretends the last check/attempt happened `ms` ago. */
const age = (ms: number) =>
  patchState((s) => {
    s.lastSyncAt = new Date(Date.now() - ms).toISOString();
    s.lastAttemptAt = new Date(Date.now() - ms).toISOString();
  });
const historyRows = () => db.getDb().prepare('SELECT synced_at, total_value FROM t212_history').all() as { synced_at: string; total_value: number }[];
const snapshotRows = () => (db.getDb().prepare("SELECT COUNT(*) n FROM snapshots WHERE account = 'trading212'").get() as { n: number }).n;

describe('adaptive sync on the server', () => {
  it('connects', async () => {
    expect(await t212.connectT212({ env: 'live', apiKey: 'KEY-abcd', apiSecret: 'S' })).toEqual({ ok: true });
  });

  it('unchanged values only move the last-check timestamp (no new history)', async () => {
    const [before] = historyRows();
    const changedAt = t212.getT212Status().lastChangedAt;
    age(120_000);
    fetchMock.mockClear();
    const r = await t212.pollT212();
    expect(r).toMatchObject({ ok: true, code: undefined });
    expect(fetchMock).toHaveBeenCalled();
    expect(historyRows()).toEqual([before]); // same row, same synced_at
    expect(snapshotRows()).toBe(1);
    const s = t212.getT212Status();
    expect(Date.now() - Date.parse(s.lastSyncAt!)).toBeLessThan(5_000); // timestamp moved
    expect(s.lastChangedAt).toBe(changedAt);
  });

  it('changed values update the history', async () => {
    summary = { ...SUMMARY, totalValue: 9300 };
    age(120_000);
    fetchMock.mockClear();
    await t212.pollT212();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => /\/equity\/(account\/summary|positions|portfolio)$/.test(u))).toBe(true); // read-only
    const rows = historyRows();
    expect(rows).toHaveLength(1); // still one row per day
    expect(rows[0].total_value).toBe(930000);
    expect(t212.getT212Status().lastChangedAt).toBe(t212.getT212Status().lastSyncAt);
  });

  it('polls are not repeated within a minute (another tab already synced)', async () => {
    age(10_000);
    fetchMock.mockClear();
    const r = await t212.pollT212();
    expect(r.ok).toBe(false);
    expect(['skipped', 'too_soon']).toContain(r.code);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never runs two syncs at once', async () => {
    age(120_000);
    fetchMock.mockClear();
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const first = t212.syncT212({ force: true });
    const second = t212.syncT212({ force: true });
    const third = t212.pollT212();
    open();
    gate = null;
    const results = await Promise.all([first, second, third]);
    expect(results[0]).toEqual(await second); // the second call shares the first one's promise
    expect(fetchMock.mock.calls.length).toBe(2); // one summary + one positions, not more
  });

  it('after a 429 waits for x-ratelimit-reset and does not retry earlier', async () => {
    age(120_000);
    const reset = Math.floor(Date.now() / 1000) + 120;
    status = 429;
    headers = { 'x-ratelimit-limit': '1', 'x-ratelimit-period': '5', 'x-ratelimit-remaining': '0', 'x-ratelimit-used': '1', 'x-ratelimit-reset': String(reset) };
    const r = await t212.syncT212({ force: true });
    expect(r).toMatchObject({ ok: false, code: 'rate_limit' });
    const s = t212.getT212Status();
    expect(Date.parse(s.retryAt!)).toBe(reset * 1000);
    expect(s.rateLimit).toMatchObject({ limit: 1, period: 5, remaining: 0, used: 1 });

    status = 200;
    headers = {};
    fetchMock.mockClear();
    age(120_000);
    // Neither the poll nor "Sync now" go out before the reset time.
    expect(await t212.pollT212()).toMatchObject({ ok: false, code: 'rate_limit' });
    expect(await t212.pollT212({ manual: true })).toMatchObject({ ok: false, code: 'rate_limit' });
    expect(fetchMock).not.toHaveBeenCalled();

    // Once the reset time has passed the sync works and clears the wait.
    patchState((st) => (st.retryAt = new Date(Date.now() - 1000).toISOString()));
    expect(await t212.pollT212()).toMatchObject({ ok: true, retryAt: null });
    expect(fetchMock).toHaveBeenCalled();
    expect(t212.getT212Status().retryAt).toBeNull();
  });

  it('metricsChanged compares total, invested and gain/loss to the cent', () => {
    const m = { currency: 'EUR', totalValue: 100, cash: 1, invested: 90, unrealized: 10, growthPct: 0.11 };
    expect(t212.metricsChanged(m, { ...m, cash: 5, growthPct: 0.5 })).toBe(false);
    expect(t212.metricsChanged(m, { ...m, unrealized: 10.01 })).toBe(true);
    expect(t212.metricsChanged(undefined, m)).toBe(true);
  });
});
