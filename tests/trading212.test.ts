import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret, keyFromPassphrase } from '@/lib/secret-box';
import { T212Error, T212_READ_ONLY_PATHS, authorizationHeader, fetchT212, mapPositions, metricsFromSummary, t212Get, type T212Path } from '@/lib/t212-core';

const creds = { env: 'live' as const, apiKey: 'KEY123', apiSecret: 'SECRET456' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Shapes from the official OpenAPI spec (docs.trading212.com).
const SUMMARY = {
  cash: { availableToTrade: 12.5, inPies: 0, reservedForOrders: 0 },
  currency: 'EUR',
  id: 1,
  investments: { currentValue: 9229.8, realizedProfitLoss: 0, totalCost: 8255.97, unrealizedProfitLoss: 973.83 },
  totalValue: 9242.3,
};
const POSITIONS = [
  {
    averagePricePaid: 98.2,
    currentPrice: 109.8,
    instrument: { currency: 'EUR', isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', ticker: 'IWDAa_EQ' },
    quantity: 84.06,
    walletImpact: { currency: 'EUR', currentValue: 9229.8, fxImpact: null, totalCost: 8255.97, unrealizedProfitLoss: 973.83 },
  },
];

describe('Trading 212 client is read-only', () => {
  it('only allows GET requests to the account summary and positions', async () => {
    const fetchMock = vi.fn(async () => json(SUMMARY));
    await t212Get('/equity/account/summary', creds, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('https://live.trading212.com/api/v0/equity/account/summary', expect.objectContaining({ method: 'GET' }));
    expect(T212_READ_ONLY_PATHS.every((p) => !/order/i.test(p))).toBe(true);
  });

  it('refuses any path outside the allowlist (e.g. orders) without calling the network', async () => {
    const fetchMock = vi.fn();
    await expect(t212Get('/equity/orders/market' as T212Path, creds, fetchMock)).rejects.toMatchObject({ code: 'blocked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses HTTP Basic for key + secret and the raw key for legacy keys', () => {
    expect(authorizationHeader(creds)).toBe(`Basic ${Buffer.from('KEY123:SECRET456').toString('base64')}`);
    expect(authorizationHeader({ env: 'live', apiKey: 'LEGACY' })).toBe('LEGACY');
  });

  it('maps HTTP errors to clear codes', async () => {
    for (const [status, code] of [
      [401, 'auth'],
      [403, 'forbidden'],
      [429, 'rate_limit'],
      [500, 'server'],
    ] as const) {
      await expect(t212Get('/equity/account/summary', creds, async () => json({}, status))).rejects.toMatchObject({ code, status });
    }
    await expect(
      t212Get('/equity/account/summary', creds, async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('Trading 212 mapping', () => {
  it('derives total, cash, invested, unrealized and growth from the account summary', () => {
    const m = metricsFromSummary(SUMMARY);
    expect(m).toMatchObject({ currency: 'EUR', totalValue: 9242.3, cash: 12.5, invested: 8255.97, unrealized: 973.83 });
    expect(m.growthPct).toBeCloseTo(973.83 / 8255.97, 8);
  });

  it('rejects a summary without the expected numbers', () => {
    expect(() => metricsFromSummary({ totalValue: 'x' })).toThrow(T212Error);
  });

  it('has 0% growth when nothing is invested', () => {
    expect(metricsFromSummary({ totalValue: 0, investments: { totalCost: 0, unrealizedProfitLoss: 0 } }).growthPct).toBe(0);
  });

  it('maps current positions and the legacy portfolio format', () => {
    expect(mapPositions(POSITIONS)[0]).toEqual({
      ticker: 'IWDAa_EQ',
      name: 'iShares Core MSCI World',
      quantity: 84.06,
      averagePrice: 98.2,
      currentPrice: 109.8,
      value: 9229.8,
      unrealized: 973.83,
    });
    expect(mapPositions([{ ticker: 'VWCEd_EQ', quantity: 10, averagePrice: 100, currentPrice: 110, ppl: 100 }])[0]).toMatchObject({ value: 1100, unrealized: 100 });
  });
});

describe('Trading 212 sync', () => {
  it('reads the summary and positions', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => json(url.endsWith('/summary') ? SUMMARY : POSITIONS));
    const snap = await fetchT212(creds, fetchMock);
    expect(snap.metrics.totalValue).toBe(9242.3);
    expect(snap.positions).toHaveLength(1);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });

  it('falls back to /equity/portfolio when /equity/positions does not exist', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/summary') ? json(SUMMARY) : url.endsWith('/positions') ? json({}, 404) : json([{ ticker: 'X', quantity: 1, currentPrice: 5, ppl: 1 }]),
    );
    expect((await fetchT212(creds, fetchMock)).positions?.[0].ticker).toBe('X');
  });

  it('keeps the summary when positions are not permitted', async () => {
    const snap = await fetchT212(creds, async (url: string) => (url.endsWith('/summary') ? json(SUMMARY) : json({}, 403)));
    expect(snap.metrics.totalValue).toBe(9242.3);
    expect(snap.positions).toBeNull();
    expect(snap.positionsError).toBe('forbidden');
  });

  it('fails as a whole when the summary fails, so manual values stay untouched', async () => {
    await expect(fetchT212(creds, async () => json({}, 401))).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('secret encryption', () => {
  const key = crypto.randomBytes(32);

  it('round-trips and never contains the plain text', () => {
    const box = encryptSecret('my-api-secret', key);
    expect(box.startsWith('v1:')).toBe(true);
    expect(box).not.toContain('my-api-secret');
    expect(decryptSecret(box, key)).toBe('my-api-secret');
  });

  it('uses a random IV (same input, different ciphertext)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });

  it('fails with the wrong key or tampered data', () => {
    const box = encryptSecret('secret', key);
    expect(() => decryptSecret(box, crypto.randomBytes(32))).toThrow();
    const raw = Buffer.from(box.slice(3), 'base64');
    raw[raw.length - 1] ^= 1; // flip one bit of the ciphertext
    const tampered = 'v1:' + raw.toString('base64');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('derives a stable 32-byte key from NESTFUND_SECRET', () => {
    expect(keyFromPassphrase('abc')).toHaveLength(32);
    expect(keyFromPassphrase('abc').equals(keyFromPassphrase('abc'))).toBe(true);
  });
});
