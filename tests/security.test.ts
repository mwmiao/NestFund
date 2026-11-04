import { describe, expect, it, vi } from 'vitest';
import { fromCents, toCents } from '@/lib/db';
import { parseDecimal, round2 } from '@/lib/format';
import { MAX_AMOUNT, RateLimiter, clampText, clientKey, constantTimeEqual, describeError, neutralizeFormula, parseBasicAuth, redact, safeLocalPath } from '@/lib/security';
import { T212_BASE_URLS, T212Error, t212Get } from '@/lib/t212-core';
import { decryptSecret, encryptSecret, keyFromPassphrase } from '@/lib/secret-box';
import { CSV_COLUMNS, parseTransactionsCsv } from '@/lib/tx-csv';
import { toCsv } from '@/lib/csv';

describe('redirect targets stay inside the app', () => {
  it.each(['/transactions', '/transactions?month=2026-11', '/settings/backup#x'])('allows %s', (p) => expect(safeLocalPath(p, '/')).toBe(p));
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example', // browsers read this as //evil.example
    '/\\/evil.example',
    'javascript:alert(1)',
    '/ok\r\nSet-Cookie: x=1',
    '/ok\u0000',
    '',
    '/' + 'a'.repeat(600),
  ])('rejects %j', (p) => expect(safeLocalPath(p, '/fallback')).toBe('/fallback'));
});

describe('amounts', () => {
  it('parses Portuguese and English formats', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('€ 39,90')).toBe(39.9);
    expect(parseDecimal('-5')).toBe(-5);
  });
  it('rejects text, exponents and anything that is not a plain number', () => {
    for (const bad of ['abc', '1e5', '0x10', '1,2,3,4', '--5', '5-', '1 000 x', '', '   ', 'NaN', 'Infinity']) expect(parseDecimal(bad)).toBeNull();
    expect(parseDecimal(NaN)).toBeNull();
    expect(parseDecimal(Infinity)).toBeNull();
    expect(parseDecimal({})).toBeNull();
  });
  it('rejects absurd values instead of storing them (including digit strings that overflow to Infinity)', () => {
    expect(parseDecimal(String(MAX_AMOUNT))).toBe(MAX_AMOUNT);
    expect(parseDecimal(String(MAX_AMOUNT + 1))).toBeNull();
    expect(parseDecimal('9'.repeat(400))).toBeNull();
    expect(parseDecimal(1e15)).toBeNull();
  });
  it('keeps cents exact when converting to and from the database representation', () => {
    for (const v of [0.1 + 0.2, 1.005, 19.99, 4.35, 1234567.89, 0.01, 999999999.99]) {
      expect(fromCents(toCents(v))).toBeCloseTo(v, 2);
      expect(Number.isSafeInteger(toCents(v))).toBe(true);
    }
    expect(toCents(MAX_AMOUNT)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
  it('summing many small amounts does not drift', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total = round2(total + 0.1);
    expect(total).toBe(100);
  });
});

describe('text and spreadsheets', () => {
  it('caps free text', () => {
    expect(clampText('  hello  ', 3)).toBe('hel');
    expect(clampText('x'.repeat(10_000), 200)).toHaveLength(200);
  });
  it('neutralises spreadsheet formulas in every cell an export writes', () => {
    for (const bad of ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) expect(neutralizeFormula(bad).startsWith("'")).toBe(true);
    expect(neutralizeFormula('Continente')).toBe('Continente');
    expect(neutralizeFormula('3 Mobile')).toBe('3 Mobile');
  });
  it('a formula typed into a CSV is imported as plain text and exported neutralised', () => {
    const csv = ['date,amount,description,merchant', '2026-11-02,5,=cmd|calc,"+evil"'].join('\n');
    const row = parseTransactionsCsv(csv, () => null).transactions[0];
    expect(row.description).toBe('=cmd|calc');
    expect(toCsv([[...CSV_COLUMNS], [neutralizeFormula(row.description), neutralizeFormula(row.merchant ?? '')]]).split('\r\n')[1]).toBe("'=cmd|calc,'+evil");
  });
});

describe('basic auth helpers', () => {
  const header = (s: string) => 'Basic ' + btoa(s);
  it('decodes valid credentials, including a password with colons', () => {
    expect(parseBasicAuth(header('ana:p:ss:word'))).toEqual({ user: 'ana', pass: 'p:ss:word' });
  });
  it('never throws on malformed headers', () => {
    for (const bad of [null, undefined, '', 'Bearer abc', 'Basic', 'Basic !!!notbase64', 'Basic ' + btoa('nocolon')]) expect(parseBasicAuth(bad as string | null)).toBeNull();
  });
  it('constant-time compare is correct for equal, different and different-length input', () => {
    expect(constantTimeEqual('secret', 'secret')).toBe(true);
    expect(constantTimeEqual('secret', 'secreT')).toBe(false);
    expect(constantTimeEqual('secret', 'secret2')).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
    expect(constantTimeEqual('ação', 'ação')).toBe(true);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit, then blocks until the window ends', () => {
    const l = new RateLimiter(3, 1000);
    expect([1, 2, 3].map(() => l.hit('a', 0).ok)).toEqual([true, true, true]);
    const blocked = l.hit('a', 100);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(l.blocked('a', 200).ok).toBe(false);
    expect(l.hit('a', 1001).ok).toBe(true); // new window
  });
  it('counts each client separately and can be reset', () => {
    const l = new RateLimiter(1, 1000);
    l.hit('a', 0);
    expect(l.hit('a', 1).ok).toBe(false);
    expect(l.hit('b', 1).ok).toBe(true);
    l.reset('a');
    expect(l.hit('a', 2).ok).toBe(true);
  });
  it('identifies clients behind a proxy', () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    expect(clientKey(h({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
    expect(clientKey(h({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
    expect(clientKey(h({}))).toBe('local');
  });
});

describe('logs never carry credentials', () => {
  const key = 'k'.repeat(8) + 'AbCdEf0123456789AbCdEf0123456789ZZ';
  it('redacts authorization values, keys and long tokens', () => {
    expect(redact('Authorization: Basic dXNlcjpwYXNzd29yZA==')).not.toContain('dXNlcjpwYXNzd29yZA');
    expect(redact('Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
    expect(redact(`apiKey=${key}`)).not.toContain(key);
    expect(redact(`failed with ${key} in url`)).not.toContain(key);
    expect(redact('plain message about 12.50 EUR')).toBe('plain message about 12.50 EUR');
  });
  it('describes an error without a stack or the secret', () => {
    const line = describeError(new Error(`request failed for api_key: ${key}`));
    expect(line).toContain('Error');
    expect(line).not.toContain(key);
    expect(line).not.toContain('\n    at ');
    expect(describeError('boom')).toContain('boom');
  });
});

describe('Trading 212 credentials', () => {
  const creds = { env: 'live' as const, apiKey: 'SUPER-SECRET-KEY-1234', apiSecret: 'SUPER-SECRET-VALUE' };
  const ok = () => new Response('{}', { status: 200 });

  it('never follows a redirect (the key must only reach the Trading 212 host) and only reads', async () => {
    const fetchMock = vi.fn(async () => ok());
    await t212Get('/equity/account/summary', creds, fetchMock);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(T212_BASE_URLS.live)).toBe(true);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
  });

  it('errors never contain the key or the secret', async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      const err = await t212Get('/equity/account/summary', creds, async () => new Response('{}', { status })).then(() => null as never, (e: T212Error) => e);
      expect(JSON.stringify({ m: err.message, c: err.code })).not.toMatch(/SUPER-SECRET/);
    }
    const net = await t212Get('/equity/account/summary', creds, async () => {
      throw new TypeError('fetch failed');
    }).then(() => null as never, (e: T212Error) => e);
    expect(net.code).toBe('network');
    expect(net.message).not.toMatch(/SUPER-SECRET/);
  });

  it('stored secrets are authenticated: tampering or another key fails instead of returning garbage', () => {
    const key = keyFromPassphrase('one');
    const box = encryptSecret(creds.apiKey, key);
    expect(box).not.toContain('SUPER-SECRET');
    expect(decryptSecret(box, key)).toBe(creds.apiKey);
    expect(() => decryptSecret(box, keyFromPassphrase('two'))).toThrow();
    const flipped = box.slice(0, -4) + (box.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decryptSecret(flipped, key)).toThrow();
    expect(() => decryptSecret('v2:' + box.slice(3), key)).toThrow();
  });
});
