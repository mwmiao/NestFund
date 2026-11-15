import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
const req = (headers: Record<string, string> = {}, path = '/') => new NextRequest(`http://localhost${path}`, { headers });
const passed = (res: Response) => res.headers.get('x-middleware-next') === '1';

const GOOD = { authorization: basic('owner', 'correct-horse') };
const BAD = { authorization: basic('owner', 'wrong') };

beforeEach(() => {
  process.env.BASIC_AUTH_USER = 'owner';
  process.env.BASIC_AUTH_PASSWORD = 'correct-horse';
  (globalThis as { __nestfundLimiters?: Map<string, unknown> }).__nestfundLimiters?.clear();
});

afterEach(() => {
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_PASSWORD;
});

describe('auth middleware', () => {
  it('lets everything through when auth is disabled', () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    expect(passed(middleware(req()))).toBe(true);
    process.env.BASIC_AUTH_USER = 'owner';
    expect(passed(middleware(req()))).toBe(true);
    delete process.env.BASIC_AUTH_USER;
    process.env.BASIC_AUTH_PASSWORD = 'correct-horse';
    expect(passed(middleware(req()))).toBe(true);
  });

  it('keeps /api/health open when auth is enabled', () => {
    expect(passed(middleware(req({}, '/api/health')))).toBe(true);
  });

  it('answers 401 with a Basic challenge when no header is sent', () => {
    const res = middleware(req());
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic realm="NestFund"/);
  });

  it('answers 401 for a wrong password, a wrong username and a malformed header', () => {
    expect(middleware(req(BAD)).status).toBe(401);
    expect(middleware(req({ authorization: basic('intruder', 'correct-horse') })).status).toBe(401);
    expect(() => middleware(req({ authorization: 'Basic !!!notbase64' }))).not.toThrow();
    expect(middleware(req({ authorization: 'Basic !!!notbase64' })).status).toBe(401);
  });

  it('passes correct credentials', () => {
    expect(passed(middleware(req(GOOD)))).toBe(true);
  });

  it('does not count requests without a header as failures', () => {
    for (let i = 0; i < 15; i++) expect(middleware(req()).status).toBe(401);
    expect(passed(middleware(req(GOOD)))).toBe(true);
  });

  it('locks out a client once more than 10 wrong attempts are recorded, even for the correct password', () => {
    const ip = { 'cf-connecting-ip': '9.9.9.9' };
    // The block is checked before the attempt is counted, so the 11th wrong attempt still gets 401 and the 12th gets 429.
    for (let i = 0; i < 11; i++) expect(middleware(req({ ...BAD, ...ip })).status).toBe(401);
    const blocked = middleware(req({ ...BAD, ...ip }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(middleware(req({ ...GOOD, ...ip })).status).toBe(429);
  });

  it('resets the failure counter after a successful login', () => {
    const ip = { 'cf-connecting-ip': '9.9.9.9' };
    for (let i = 0; i < 9; i++) expect(middleware(req({ ...BAD, ...ip })).status).toBe(401);
    expect(passed(middleware(req({ ...GOOD, ...ip })))).toBe(true);
    for (let i = 0; i < 9; i++) expect(middleware(req({ ...BAD, ...ip })).status).toBe(401);
  });

  // Current behavior: clients are told apart by proxy headers. Plan 003 changes this.
  it('does not block a different client address while another is blocked', () => {
    const ip = { 'cf-connecting-ip': '9.9.9.9' };
    for (let i = 0; i < 11; i++) middleware(req({ ...BAD, ...ip }));
    expect(middleware(req({ ...GOOD, ...ip })).status).toBe(429);
    expect(passed(middleware(req({ ...GOOD, 'cf-connecting-ip': '8.8.8.8' })))).toBe(true);
  });
});
