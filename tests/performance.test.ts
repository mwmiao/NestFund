import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountBalance } from '@/lib/calc';
import { ACCOUNT_IDS, isSpending } from '@/lib/types';

// Real repository code against a throwaway database. These tests prove the speed-ups did not change any result.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-perf-'));
process.env.DATA_DIR = dir;

type Repo = typeof import('@/lib/repo');
type Db = typeof import('@/lib/db');
let repo: Repo;
let db: Db;

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pad = (n: number) => String(n).padStart(2, '0');

beforeAll(async () => {
  db = await import('@/lib/db');
  repo = await import('@/lib/repo');
  const d = db.getDb();
  const insert = d.prepare(
    "INSERT INTO transactions (date, amount, type, description, category_id, account, to_account, payment_method, merchant, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  const cats = (d.prepare('SELECT id FROM categories').all() as { id: number }[]).map((c) => c.id);
  const accounts = ['ctt', 'revolut', 'meal_card', 'cash'];
  d.transaction(() => {
    for (let i = 0; i < 1500; i++) {
      const date = `${2024 + Math.floor(rnd() * 3)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`;
      const r = rnd();
      const created = `${date} ${pad(Math.floor(rnd() * 24))}:00:00`;
      if (r < 0.05) insert.run(date, 150000, 'income', 'Salary', cats[0], 'ctt', null, 'transfer', null, created);
      else if (r < 0.1) insert.run(date, 30000, 'transfer', 'ETF', null, 'ctt', rnd() < 0.5 ? 'trading212' : 'traderepublic', 'transfer', null, created);
      else insert.run(date, 100 + Math.floor(rnd() * 5000), 'purchase', `Shop ${i % 40}`, rnd() < 0.8 ? cats[i % cats.length] : null, accounts[i % accounts.length], null, 'card', i % 3 ? 'Lidl' : null, created);
    }
    // Check-ins for some accounts only; "cash" and "revolut" have none, so all their movements count.
    const snap = d.prepare('INSERT INTO snapshots (date, account, value, invested, created_at) VALUES (?,?,?,?,?)');
    snap.run('2025-06-15', 'ctt', 250000, 250000, '2025-06-15 09:00:00');
    snap.run('2025-06-15', 'trading212', 900000, 800000, '2025-06-15 10:00:00');
    snap.run('2024-12-01', 'traderepublic', 100000, 100000, null);
    snap.run('2025-09-01', 'traderepublic', 160000, 160000, '2025-09-01 08:00:00');
  })();
});

afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('balances read only what they need but give the same numbers', () => {
  it('matches the reference calculation over the full history, for every account', () => {
    const all = repo.listTransactions();
    const snaps = repo.listSnapshots();
    const fast = repo.accountBalances();
    // Trade Republic also gets the interest credited after its last check-in (see interest.test.ts); nothing else differs.
    const lastTr = snaps.filter((x) => x.account === 'traderepublic').map((x) => x.date).sort().at(-1) ?? '';
    const credited = (db.getDb().prepare("SELECT credit_date, net FROM interest_credits WHERE account = 'traderepublic'").all() as { credit_date: string; net: number }[])
      .filter((r) => r.credit_date > lastTr)
      .reduce((sum, r) => sum + r.net / 100, 0);
    for (const a of ACCOUNT_IDS) {
      const expected = accountBalance(a, snaps, all);
      if (a === 'traderepublic') expected.balance = Math.round((expected.balance + credited) * 100) / 100;
      expect(fast[a]).toEqual(expected);
    }
    expect(fast.ctt.balance).not.toBe(0);
  });
});

describe('paginated transactions', () => {
  const filters = [{}, { month: '2025-03' }, { year: '2025' }, { account: 'trading212' }, { account: 'ctt', year: '2024' }, { q: 'Lidl' }, { type: 'transfer' }, { month: '2024-02' }];

  it('pages add up to exactly the unpaginated list, in the same order', () => {
    for (const f of filters) {
      const full = repo.listTransactions(f);
      const first = repo.listTransactionsPage(f, 1);
      expect(first.total).toBe(full.length);
      const collected = [...first.rows];
      for (let p = 2; p <= first.pages; p++) collected.push(...repo.listTransactionsPage(f, p).rows);
      expect(collected.map((t) => t.id)).toEqual(full.map((t) => t.id));
      expect(first.rows.length).toBeLessThanOrEqual(repo.TX_PAGE_SIZE);
    }
  });

  it('totals computed in SQL equal the totals of the whole filtered list (not just one page)', () => {
    for (const f of filters) {
      const list = repo.listTransactions(f);
      const sum = (xs: typeof list) => Math.round(xs.reduce((s, t) => s + t.amount, 0) * 100) / 100;
      const t = repo.transactionTotals(f);
      expect(t.outflow).toBe(sum(list.filter((x) => isSpending(x.type) && x.account !== 'meal_card')));
      expect(t.inflow).toBe(sum(list.filter((x) => x.type === 'income' && x.account !== 'meal_card')));
      expect(t.meal).toBe(sum(list.filter((x) => isSpending(x.type) && x.account === 'meal_card')));
    }
  });

  it('clamps out-of-range and invalid page numbers', () => {
    const f = { year: '2025' };
    const last = repo.listTransactionsPage(f, 1).pages;
    expect(repo.listTransactionsPage(f, 9999).page).toBe(last);
    expect(repo.listTransactionsPage(f, 0).page).toBe(1);
    expect(repo.listTransactionsPage(f, NaN).page).toBe(1);
    expect(repo.listTransactionsPage({ month: '1999-01' }, 1)).toMatchObject({ total: 0, pages: 1, rows: [] });
  });

  it('month and year ranges include the first and last day and exclude neighbours', () => {
    const d = db.getDb();
    const ins = d.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES (?, 100, 'purchase', 'edge', 'ctt', 'card')");
    for (const day of ['2031-01-31', '2031-02-01', '2031-02-28', '2031-03-01', '2031-12-31', '2032-01-01']) ins.run(day);
    const dates = (f: object) => repo.listTransactions(f).map((t) => t.date).sort();
    expect(dates({ month: '2031-02' })).toEqual(['2031-02-01', '2031-02-28']);
    expect(dates({ month: '2031-01' })).toEqual(['2031-01-31']);
    expect(dates({ year: '2031' })).toEqual(['2031-01-31', '2031-02-01', '2031-02-28', '2031-03-01', '2031-12-31']);
  });
});

describe('cache', () => {
  it('returns the same value until the data changes, then a fresh one', () => {
    const a = repo.listTransactions({ month: '2025-03' });
    expect(repo.listTransactions({ month: '2025-03' })).toBe(a); // cache hit: same array
    db.getDb().prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES ('2025-03-10', 500, 'purchase', 'new', 'ctt', 'card')").run();
    const b = repo.listTransactions({ month: '2025-03' });
    expect(b).not.toBe(a);
    expect(b.length).toBe(a.length + 1);
  });

  it('also sees changes made by another connection to the same file', async () => {
    const before = repo.listTransactions({ month: '2026-09' }).length;
    const Database = (await import('better-sqlite3')).default;
    const other = new Database(path.join(dir, 'nestfund.db'));
    other.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES ('2026-09-05', 100, 'purchase', 'external', 'ctt', 'card')").run();
    other.close();
    expect(repo.listTransactions({ month: '2026-09' }).length).toBe(before + 1);
  });

  it('shared results are frozen, so a page cannot corrupt what the next page reads', () => {
    const list = repo.listTransactions();
    expect(Object.isFrozen(list)).toBe(true);
    expect(() => (list as unknown as unknown[]).push({})).toThrow();
    expect(() => repo.listCategories().reverse()).toThrow();
  });

  it('edits are visible immediately through the public functions', () => {
    const before = repo.listCategories().length;
    repo.upsertCategory({ name: 'Fresh', color: '#123456', kind: 'expense', monthlyBudget: null });
    expect(repo.listCategories().length).toBe(before + 1);
  });
});

describe('indexes', () => {
  const plan = (sql: string, ...args: unknown[]) =>
    (db.getDb().prepare('EXPLAIN QUERY PLAN ' + sql).all(...args) as { detail: string }[]).map((r) => r.detail).join(' | ');

  it('period filters use an index range instead of scanning with substr()', () => {
    expect(plan('SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC', '2025-03-01', '2025-03-31')).toMatch(/SEARCH .*idx_tx_date/);
  });
  it('account, category and type filters combined with a period use the composite indexes', () => {
    expect(plan('SELECT * FROM transactions WHERE account = ? AND date >= ? AND date <= ?', 'ctt', '2025-01-01', '2025-12-31')).toMatch(/idx_tx_account_date/);
    expect(plan('SELECT * FROM transactions WHERE category_id = ? AND date >= ?', 1, '2025-01-01')).toMatch(/idx_tx_category_date/);
    expect(plan('SELECT * FROM transactions WHERE type = ? AND date >= ?', 'transfer', '2025-01-01')).toMatch(/idx_tx_type_date/);
  });
  it('existing databases get the new indexes without losing rows', () => {
    const names = (db.getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    for (const n of ['idx_tx_account_date', 'idx_tx_to_account_date', 'idx_tx_category_date', 'idx_tx_type_date']) expect(names).toContain(n);
    expect((db.getDb().prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n).toBeGreaterThan(1500);
  });
});
