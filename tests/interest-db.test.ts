import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, SCHEMA, migrate } from '@/lib/schema';

// Real repository code on a throwaway database: the Trade Republic interest is booked once a month, never twice,
// never edits existing data, and the balance includes it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-interest-'));
process.env.DATA_DIR = dir;

type Db = typeof import('@/lib/db');
type Repo = typeof import('@/lib/repo');
type Interest = typeof import('@/lib/interest-repo');
let db: Db;
let repo: Repo;
let interest: Interest;

const insertTx = (date: string, amount: number, extra: { to?: string; from?: string; created?: string } = {}) =>
  db
    .getDb()
    .prepare("INSERT INTO transactions (date, amount, type, description, account, to_account, payment_method, created_at) VALUES (?, ?, 'transfer', 'TR', ?, ?, 'transfer', ?)")
    .run(date, Math.round(amount * 100), extra.from ?? 'ctt', extra.to ?? 'traderepublic', extra.created ?? `${date} 10:00:00`);
const credits = () => db.getDb().prepare('SELECT month, credit_date, gross, tax, net, opening, deposits, withdrawals, closing FROM interest_credits ORDER BY month').all() as Record<string, number | string>[];
const snapshot = (date: string, value: number, createdAt: string) =>
  db.getDb().prepare("INSERT INTO snapshots (date, account, value, invested, created_at) VALUES (?, 'traderepublic', ?, ?, ?)").run(date, Math.round(value * 100), Math.round(value * 100), createdAt);

beforeAll(async () => {
  db = await import('@/lib/db');
  repo = await import('@/lib/repo');
  interest = await import('@/lib/interest-repo');
});
afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  for (const t of ['interest_credits', 'transactions', 'snapshots', 'settings']) db.getDb().exec(`DELETE FROM ${t}${t === 'settings' ? " WHERE key = 'interest'" : ''}`);
});

describe('the real scenario', () => {
  beforeEach(() => {
    insertTx('2026-11-03', 2900.61);
    insertTx('2026-11-04', 55.1);
  });

  it('books November on 1 December: 6,55 € gross, 1,83 € IRS, 4,72 € net, and adds it to the balance', () => {
    expect(interest.materializeInterest('2026-12-01')).toBe(1);
    expect(credits()).toEqual([{ month: '2026-11', credit_date: '2026-12-01', gross: 655, tax: 183, net: 472, opening: 0, deposits: 295571, withdrawals: 0, closing: 295571 + 472 }]);
    expect(repo.accountBalances().traderepublic.balance).toBe(2960.43); // 2.955,71 + 4,72
  });

  it('does nothing before the month is over, so the balance is not touched', () => {
    expect(interest.materializeInterest('2026-11-30')).toBe(0);
    expect(credits()).toEqual([]);
    expect(repo.accountBalances().traderepublic.balance).toBe(2955.71);
  });

  it('never duplicates a credit after a refresh, a restart or a repeated sync', () => {
    interest.materializeInterest('2026-12-01');
    for (let i = 0; i < 5; i++) {
      expect(interest.materializeInterest('2026-12-01')).toBe(0);
      expect(interest.materializeInterest('2026-12-15')).toBe(0);
    }
    // a Trading 212 style write elsewhere in the database (history, snapshot) does not trigger a second credit
    db.getDb().prepare("INSERT INTO t212_history (date, total_value, invested, cash, unrealized, growth_pct, currency, synced_at) VALUES ('2026-12-01', 1, 1, 0, 0, 0, 'EUR', 'x')").run();
    expect(interest.materializeInterest('2026-12-01')).toBe(0);
    expect(credits()).toHaveLength(1);
    expect(repo.accountBalances().traderepublic.balance).toBe(2960.43);
    expect(repo.accountBalances().traderepublic.balance).toBe(2960.43); // and not 2965,15 on the next read
  });

  it('a second month earns on the credited interest, but never on the interest of the current month', () => {
    interest.materializeInterest('2027-01-01');
    const rows = credits();
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-12']);
    expect(rows[1].opening).toBe(295571 + 472); // December starts with the credited November interest
    // December: 31 days on 2.960,43 € at 3 % gross = 7,5427 -> 7,54 gross, 2,11 IRS, 5,43 net
    expect(rows[1]).toMatchObject({ gross: 754, tax: 211, net: 543 });
  });

  it('existing transactions, snapshots and other balances are never changed', () => {
    snapshot('2026-11-01', 1, '2026-11-01 08:00:00');
    const before = JSON.stringify(db.getDb().prepare('SELECT * FROM transactions ORDER BY id').all()) + JSON.stringify(db.getDb().prepare('SELECT * FROM snapshots ORDER BY id').all());
    const ctt = repo.accountBalances().ctt.balance;
    interest.materializeInterest('2027-03-01');
    expect(JSON.stringify(db.getDb().prepare('SELECT * FROM transactions ORDER BY id').all()) + JSON.stringify(db.getDb().prepare('SELECT * FROM snapshots ORDER BY id').all())).toBe(before);
    expect(repo.accountBalances().ctt.balance).toBe(ctt);
  });
});

describe('real balances win over estimates', () => {
  it('a check-in recorded after a credit replaces the estimate (no double counting)', () => {
    insertTx('2026-11-03', 2900.61);
    interest.materializeInterest('2026-12-01'); // estimate: +4,64 € dated 1 Dec
    expect(repo.accountBalances().traderepublic.balance).toBeCloseTo(2905.25, 2);
    snapshot('2026-12-02', 2905.3, '2026-12-02 08:00:00'); // the app shows 2.905,30 €
    expect(repo.accountBalances().traderepublic.balance).toBe(2905.3);
    // and the next month starts from the real figure
    interest.materializeInterest('2027-01-01');
    const dec = credits().find((r) => r.month === '2026-12')!;
    expect(dec.opening).toBe(290525); // 2.900,61 + the 4,64 estimate credited on 1 Dec
    expect(dec.deposits).toBe(5); // the 0,05 € the real balance added on 2 Dec
  });

  it('interest is a gain, not money paid in: the invested amount does not change', () => {
    insertTx('2026-11-03', 1000);
    const before = repo.accountBalances().traderepublic.invested;
    interest.materializeInterest('2026-12-01');
    expect(repo.accountBalances().traderepublic.invested).toBe(before);
  });
});

describe('edge cases', () => {
  it('a deposit on the last day of the month earns from the 1st (October gets nothing, November a full month)', () => {
    insertTx('2026-10-31', 5000);
    interest.materializeInterest('2026-12-01');
    const [oct, nov] = credits();
    expect(oct).toMatchObject({ month: '2026-10', gross: 0, net: 0 });
    expect(nov).toMatchObject({ month: '2026-11', gross: 1233 }); // 5.000 × 3 % × 30/365 = 12,33
  });

  it('a withdrawal stops earning on the day it leaves', () => {
    insertTx('2026-10-01', 1000);
    insertTx('2026-11-10', 400, { from: 'traderepublic', to: 'ctt' });
    interest.materializeInterest('2026-12-01');
    const nov = credits().find((r) => r.month === '2026-11')!;
    // 1.000 € for 9 days (1–9 Nov) + 600 € for 21 days (10–30 Nov), at 3 %/365
    expect(nov.gross).toBe(Math.round((1000 * 9 + 600 * 21) * 0.03 / 365 * 100));
    expect(nov.withdrawals).toBe(40000);
  });

  it('deposit and withdrawal on the same day are netted for the interest', () => {
    insertTx('2026-10-01', 1000);
    insertTx('2026-11-10', 300);
    insertTx('2026-11-10', 300, { from: 'traderepublic', to: 'ctt' });
    interest.materializeInterest('2026-12-01');
    expect(credits().find((r) => r.month === '2026-11')!.gross).toBe(Math.round((1000 * 30 * 0.03 / 365) * 100));
  });

  it('a zero balance books zero interest', () => {
    insertTx('2026-10-01', 100);
    insertTx('2026-10-02', 100, { from: 'traderepublic', to: 'ctt' });
    interest.materializeInterest('2026-12-01');
    expect(credits().every((r) => r.gross === 0 && r.net === 0)).toBe(true);
    expect(repo.accountBalances().traderepublic.balance).toBe(0);
  });

  it('switching the calculation off stops new credits and keeps the existing ones', () => {
    insertTx('2026-10-01', 1000);
    interest.materializeInterest('2026-11-05');
    expect(credits()).toHaveLength(1);
    interest.saveInterestConfig({ ...interest.getInterestConfig(), enabled: false });
    expect(interest.materializeInterest('2027-06-01')).toBe(0);
    expect(credits()).toHaveLength(1);
  });

  it('a changed rate only affects months not booked yet', () => {
    insertTx('2026-10-01', 1000);
    interest.materializeInterest('2026-11-05');
    const octGross = credits()[0].gross;
    interest.saveInterestConfig({ ...interest.getInterestConfig(), annualRate: 0.02 });
    interest.materializeInterest('2026-12-05');
    const rows = credits();
    expect(rows[0].gross).toBe(octGross);
    expect(rows[1].gross).toBe(Math.round((rows[1].opening as number) * 0.02 * 30 / 365)); // November at the new 2 %
  });

  it('settings outside a sane range fall back to the defaults', () => {
    db.getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('interest', ?)").run(JSON.stringify({ annualRate: 5, taxRate: -1, depositLagDays: 99, enabled: 'yes' }));
    expect(interest.getInterestConfig()).toMatchObject({ annualRate: 0.2, taxRate: 0, depositLagDays: 3, enabled: true });
  });
});

describe('schema upgrade', () => {
  it('adds the credits table to an older database without touching its data', () => {
    const old = new Database(':memory:');
    old.exec(SCHEMA.replace(/CREATE TABLE IF NOT EXISTS interest_credits[\s\S]*?\);\n/, ''));
    old.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES ('2026-11-01', 1000, 'purchase', 'x', 'ctt', 'card')").run();
    old.pragma("user_version = 3"); // interest_credits is migration 3
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name = 'interest_credits'").get()).toBeUndefined();
    migrate(old);
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name = 'interest_credits'").get()).toBeDefined();
    expect(old.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 1 });
  });
});
