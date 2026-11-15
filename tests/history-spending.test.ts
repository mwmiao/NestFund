import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real repository code on a throwaway database: the History spending chart counts spending only,
// never income and never transfers between the user's own accounts.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-history-'));
process.env.DATA_DIR = dir;

type Db = typeof import('@/lib/db');
type Repo = typeof import('@/lib/repo');
let db: Db;
let repo: Repo;

const insert = (date: string, amount: number, type: string, categoryId: number | null = null, toAccount: string | null = null) =>
  db
    .getDb()
    .prepare('INSERT INTO transactions (date, amount, type, description, category_id, account, to_account, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(date, Math.round(amount * 100), type, 'x', categoryId, 'ctt', toAccount, type === 'transfer' ? 'transfer' : 'card');
const totalFor = (categoryId: number | null, month = '2026-11') =>
  repo.spendingByMonthAndCategory('2026-01').find((r) => r.month === month && r.categoryId === categoryId)?.total ?? 0;

beforeAll(async () => {
  db = await import('@/lib/db');
  repo = await import('@/lib/repo');
});
afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  db.getDb().exec('DELETE FROM transactions');
});

describe('spendingByMonthAndCategory', () => {
  it('counts purchases, expenses and payments', () => {
    insert('2026-11-02', 10, 'purchase');
    insert('2026-11-03', 5, 'expense');
    insert('2026-11-04', 2.5, 'payment');
    expect(totalFor(null)).toBe(17.5);
  });

  it('ignores income and transfers', () => {
    insert('2026-11-02', 10, 'purchase');
    insert('2026-11-03', 100, 'income');
    insert('2026-11-04', 50, 'transfer', null, 'traderepublic');
    expect(totalFor(null)).toBe(10);
  });

  it('does not count a transfer under an expense category', () => {
    const cat = (db.getDb().prepare("SELECT id FROM categories WHERE kind = 'expense' LIMIT 1").get() as { id: number }).id;
    insert('2026-11-02', 20, 'purchase', cat);
    insert('2026-11-03', 50, 'transfer', cat, 'revolut');
    expect(totalFor(cat)).toBe(20);
  });

  it('ignores months before the starting month', () => {
    insert('2025-12-15', 10, 'purchase');
    expect(repo.spendingByMonthAndCategory('2026-01')).toEqual([]);
  });
});
