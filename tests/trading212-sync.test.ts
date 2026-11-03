import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real storage code against a throwaway database; only the Trading 212 HTTP API is mocked.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-t212-'));
process.env.DATA_DIR = dir;
delete process.env.NESTFUND_SECRET;

const SUMMARY = {
  cash: { availableToTrade: 12.5, inPies: 0, reservedForOrders: 0 },
  currency: 'EUR',
  investments: { currentValue: 9229.8, totalCost: 8255.97, unrealizedProfitLoss: 973.83 },
  totalValue: 9242.3,
};
const POSITIONS = [{ instrument: { ticker: 'IWDAa_EQ', name: 'MSCI World' }, quantity: 84, averagePricePaid: 98, currentPrice: 110, walletImpact: { currentValue: 9229.8, unrealizedProfitLoss: 973.83 } }];

let respond: (url: string) => Response;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method !== 'GET') throw new Error('non-GET request');
  return respond(url);
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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

const rawSettings = () => (db.getDb().prepare("SELECT value FROM settings WHERE key = 't212'").get() as { value: string } | undefined)?.value ?? '';

describe('Trading 212 connection and sync', () => {
  it('rejects invalid credentials without storing anything', async () => {
    respond = () => json({}, 401);
    expect(await t212.connectT212({ env: 'live', apiKey: 'BADKEY', apiSecret: 'BAD' })).toEqual({ ok: false, code: 'auth' });
    expect(rawSettings()).toBe('');
    expect(t212.getT212Status().connected).toBe(false);
  });

  it('connects, stores the key encrypted and records history + balance', async () => {
    respond = (url) => json(url.endsWith('/summary') ? SUMMARY : POSITIONS);
    expect(await t212.connectT212({ env: 'live', apiKey: 'REALKEY-abcd', apiSecret: 'TOPSECRET' })).toEqual({ ok: true });

    const stored = rawSettings();
    expect(stored).not.toContain('REALKEY');
    expect(stored).not.toContain('TOPSECRET');
    expect(fs.existsSync(path.join(dir, 'secret.key'))).toBe(true);

    const s = t212.getT212Status();
    expect(s).toMatchObject({ connected: true, keyHint: 'abcd', hasSecret: true, lastError: null });
    expect(JSON.stringify(s)).not.toContain('REALKEY');
    expect(s.positions[0].ticker).toBe('IWDAa_EQ');

    const [h] = t212.listT212History();
    expect(h).toMatchObject({ totalValue: 9242.3, invested: 8255.97, unrealized: 973.83, cash: 12.5 });
    expect(h.growthPct).toBeCloseTo(973.83 / 8255.97, 6);

    const snap = db.getDb().prepare("SELECT value, invested, notes FROM snapshots WHERE account = 'trading212'").all();
    expect(snap).toEqual([{ value: 924230, invested: 924230 - 97383, notes: t212.T212_SNAPSHOT_NOTE }]);
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('https://live.trading212.com/api/v0/equity/'))).toBe(true);
  });

  it('does not sync again within 6 hours unless forced', async () => {
    fetchMock.mockClear();
    expect((await t212.syncT212()).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed sync records the error and keeps the last values', async () => {
    const state = JSON.parse(rawSettings());
    state.lastAttemptAt = new Date(Date.now() - 60_000).toISOString(); // past the anti-spam window
    db.getDb().prepare("UPDATE settings SET value = ? WHERE key = 't212'").run(JSON.stringify(state));
    respond = () => json({}, 503);

    expect(await t212.syncT212({ force: true })).toEqual({ ok: false, code: 'server' });
    const s = t212.getT212Status();
    expect(s.lastError?.code).toBe('server');
    expect(s.metrics?.totalValue).toBe(9242.3);
    expect(db.getDb().prepare("SELECT COUNT(*) n FROM snapshots WHERE account = 'trading212'").get()).toEqual({ n: 1 });
  });

  it('keeps one history row and one balance per day across syncs', async () => {
    const state = JSON.parse(rawSettings());
    state.lastAttemptAt = new Date(Date.now() - 60_000).toISOString();
    db.getDb().prepare("UPDATE settings SET value = ? WHERE key = 't212'").run(JSON.stringify(state));
    respond = (url) => json(url.endsWith('/summary') ? { ...SUMMARY, totalValue: 9300 } : POSITIONS);

    expect(await t212.syncT212({ force: true })).toEqual({ ok: true });
    expect(t212.listT212History()).toHaveLength(1);
    expect(t212.listT212History()[0].totalValue).toBe(9300);
    expect(db.getDb().prepare("SELECT COUNT(*) n FROM snapshots WHERE account = 'trading212'").get()).toEqual({ n: 1 });
    expect(t212.getT212Status().lastError).toBeNull();
  });

  it('disconnect removes the credentials but keeps history', async () => {
    t212.disconnectT212();
    expect(t212.getT212Status().connected).toBe(false);
    expect(rawSettings()).not.toContain('v1:');
    expect(t212.listT212History()).toHaveLength(1);
    expect(await t212.syncT212({ force: true })).toEqual({ ok: false, code: 'not_connected' });
  });
});
