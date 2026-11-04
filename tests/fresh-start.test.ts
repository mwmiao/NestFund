import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { accountBalance, computeMonthSummary, goalProgress, savingsRate, simulateEtf, simulateHouseSavings } from '@/lib/calc';
import { MIGRATIONS, SCHEMA, migrate } from '@/lib/schema';
import { DEFAULT_CATEGORIES, DEFAULT_PROFILE, hasLegacySampleData, resetAllData, seedDatabase } from '@/lib/seed';

const finite = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => typeof v === 'number')
    .every(([, v]) => Number.isFinite(v as number));

function freshDb() {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  seedDatabase(db);
  return db;
}

const count = (db: Database.Database, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('fresh start seed', () => {
  it('creates only the zeroed profile and built-in categories without budgets', () => {
    const db = freshDb();
    for (const table of ['transactions', 'snapshots', 'month_budgets', 'budget_items', 'goals']) expect(count(db, table)).toBe(0);
    expect(count(db, 'categories')).toBe(DEFAULT_CATEGORIES.length);
    expect(count(db, 'categories WHERE monthly_budget IS NOT NULL')).toBe(0);
    const profile = JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'profile'").get() as { value: string }).value);
    // Every amount is zero; only the pay days (25, the contract rule) have a value.
    expect(Object.entries(profile).filter(([k]) => !k.endsWith('PayDay')).every(([, v]) => v === 0)).toBe(true);
    expect(profile).toEqual(DEFAULT_PROFILE);
  });

  it('reset removes every user record and restores built-in categories', () => {
    const db = freshDb();
    db.prepare("INSERT INTO categories (key, name, color, kind, monthly_budget, builtin) VALUES (NULL, 'Custom', '#000', 'expense', 1000, 0)").run();
    db.prepare("UPDATE categories SET name = 'Renamed', key = NULL, monthly_budget = 5000 WHERE key = 'food'").run();
    db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES ('2026-11-01', 1000, 'purchase', 'x', 'ctt', 'card')").run();
    db.prepare("INSERT INTO snapshots (date, account, value, invested) VALUES ('2026-11-01', 'trading212', 924230, 825597)").run();
    db.prepare("INSERT INTO goals (kind, name, target, color) VALUES ('house', 'Casa', 100, '#000')").run();
    db.prepare("INSERT INTO budget_items (name, kind, amount) VALUES ('Gym', 'fixed', 3990)").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('onboarding', '{\"done\":[\"balances\"]}')").run();
    // Real data with the same ETF balance as the old sample (it used the owner's real numbers) is NOT sample data.
    expect(hasLegacySampleData(db)).toBe(false);
    const tx = db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, merchant) VALUES ('2026-10-15', 100, 'purchase', ?, 'ctt', 'card', ?)");
    tx.run('Venda no Vinted', 'Vinted');
    tx.run('Tecido e espuma EVA', 'Retrosaria');
    tx.run('Almoço', 'Tasca do Zé');
    expect(hasLegacySampleData(db)).toBe(false); // partial match: still real data
    tx.run('Café e bolos', 'Pastelaria');
    expect(hasLegacySampleData(db)).toBe(true); // every sample-only transaction present

    resetAllData(db);

    for (const table of ['transactions', 'snapshots', 'month_budgets', 'budget_items', 'goals']) expect(count(db, table)).toBe(0);
    expect(count(db, 'categories')).toBe(DEFAULT_CATEGORIES.length);
    expect(count(db, "categories WHERE key = 'food' AND monthly_budget IS NULL")).toBe(1);
    expect(db.prepare("SELECT 1 FROM settings WHERE key = 'onboarding'").get()).toBeUndefined();
    expect(hasLegacySampleData(db)).toBe(false);
  });
});

describe('calculations with no data (no NaN, no division by zero)', () => {
  it('month summary of an empty month', () => {
    const s = computeMonthSummary({ month: '2026-11', income: 0, extraIncome: 0, mealCard: 0, items: [], notes: null }, [], []);
    expect(finite(s as unknown as Record<string, unknown>)).toBe(true);
    expect(s.savingsRate).toBe(0);
    expect(s.realAvailable).toBe(0);
    expect(s.negativePlanned).toBe(false);
    expect(s.byCategory).toEqual([]);
  });

  it('goal with a zero target', () => {
    const p = goalProgress({ target: 0, current: 0, monthly: 0, targetDate: null }, '2026-11');
    expect(p.pct).toBe(0);
    expect(p.remaining).toBe(0);
  });

  it('simulators with zero inputs', () => {
    const house = simulateHouseSavings({ housePrice: 0, downPaymentPct: 0.1, purchaseCostsPct: 0.07, monthlyContribution: 0, annualBonus: 0, initialBalance: 0, years: 10 });
    expect(house.target).toBe(0);
    expect(house.monthsToTarget).toBeNull();
    expect(house.points.every((p) => finite(p as unknown as Record<string, unknown>))).toBe(true);
    const etf = simulateEtf({ monthlyContribution: 0, currentValue: 0, annualReturn: 0.06, years: 20 });
    expect(etf.at(-1)!.value).toBe(0);
  });

  it('account without any record', () => {
    expect(accountBalance('ctt', [], [])).toEqual({ account: 'ctt', balance: 0, invested: 0, since: null });
    expect(savingsRate(0, 0)).toBe(0);
  });
});

describe('balance check-in on the same day as new movements', () => {
  const snap = { account: 'revolut' as const, date: '2026-11-03', value: 180, invested: 180, createdAt: '2026-11-03 10:00:00' };
  const base = { type: 'purchase' as const, account: 'revolut' as const, toAccount: null, date: '2026-11-03' };

  it('counts a purchase logged after the balance was recorded', () => {
    expect(accountBalance('revolut', [snap], [{ ...base, amount: 14.9, createdAt: '2026-11-03 10:05:00' }]).balance).toBeCloseTo(165.1, 2);
  });

  it('ignores a same-day purchase that was already part of the recorded balance', () => {
    expect(accountBalance('revolut', [snap], [{ ...base, amount: 14.9, createdAt: '2026-11-03 09:00:00' }]).balance).toBe(180);
  });
});

describe('migration of a v1.0.0 database', () => {
  it('adds snapshots.created_at and bumps user_version without touching data', () => {
    const db = new Database(':memory:');
    // v1.0.0 snapshot table (no created_at) at user_version 1.
    db.exec(SCHEMA.replace(/notes TEXT,\n  created_at TEXT\n\);/, 'notes TEXT\n);'));
    db.pragma('user_version = 1');
    db.prepare("INSERT INTO snapshots (date, account, value, invested) VALUES ('2026-11-01', 'ctt', 100, 100)").run();
    migrate(db);
    const cols = (db.prepare('PRAGMA table_info(snapshots)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('created_at');
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length + 1);
    expect(count(db, 'snapshots')).toBe(1);
    migrate(db); // idempotent
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length + 1);
  });
});

describe('backup before migration', () => {
  it('copies the whole database before applying pending migrations, and keeps all data', async () => {
    const fsMod = await import('node:fs');
    const os = await import('node:os');
    const pathMod = await import('node:path');
    const dir = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'nf-mig-'));
    const file = pathMod.join(dir, 'nestfund.db');
    const db = new Database(file);
    db.exec(SCHEMA.replace(/notes TEXT,\n  created_at TEXT\n\);/, 'notes TEXT\n);'));
    db.pragma('user_version = 1');
    db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method) VALUES ('2026-11-01', 1234, 'purchase', 'real data', 'ctt', 'card')").run();

    migrate(db, { backupDir: pathMod.join(dir, 'backups') });

    const backups = fsMod.readdirSync(pathMod.join(dir, 'backups'));
    expect(backups).toHaveLength(1);
    const copy = new Database(pathMod.join(dir, 'backups', backups[0]), { readonly: true });
    expect(copy.prepare('SELECT description FROM transactions').get()).toEqual({ description: 'real data' });
    expect(copy.pragma('user_version', { simple: true })).toBe(1);
    copy.close();
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get()).toEqual({ n: 1 });

    migrate(db, { backupDir: pathMod.join(dir, 'backups') }); // nothing pending: no new backup
    expect(fsMod.readdirSync(pathMod.join(dir, 'backups'))).toHaveLength(1);
    db.close();
    fsMod.rmSync(dir, { recursive: true, force: true });
  });
});
