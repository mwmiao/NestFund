import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, SCHEMA, migrate } from '@/lib/schema';
import { estimateFromDays, expectedPayDate, isBusinessDay, paidDayEquivalents, portugueseHolidays } from '@/lib/payday';
import { computeMonthSummary } from '@/lib/calc';
import { incomeDifference, nextPayment } from '@/lib/income-view';

describe('Portuguese holidays', () => {
  it('knows the movable ones (Easter 2026 = 5 Apr)', () => {
    const h = portugueseHolidays(2026);
    expect(h.get('2026-04-03')).toBe('goodFriday');
    expect(h.get('2026-04-05')).toBe('easter');
    expect(h.get('2026-06-04')).toBe('corpusChristi');
    expect(h.size).toBe(13);
  });
  it('knows the fixed ones', () => {
    const h = portugueseHolidays(2026);
    for (const d of ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25']) expect(h.has(`2026-${d}`)).toBe(true);
  });
  it('weekends and holidays are not business days', () => {
    expect(isBusinessDay('2026-11-06')).toBe(true); // Friday
    expect(isBusinessDay('2026-11-07')).toBe(false); // Saturday
    expect(isBusinessDay('2026-11-01')).toBe(false); // Sunday + All Saints
    expect(isBusinessDay('2026-12-25')).toBe(false); // Friday, Christmas
  });
});

describe('expected pay date (day 25, moved back to the previous business day)', () => {
  it('weekday: paid on the 25th', () => {
    const p = expectedPayDate('2026-11', 25); // Wednesday
    expect(p).toMatchObject({ date: '2026-11-25', reason: null });
  });
  it('25th on a Saturday → Friday 24th', () => {
    const p = expectedPayDate('2026-07', 25); // 25 Jul 2026 is a Saturday
    expect(p).toMatchObject({ nominal: '2026-07-25', date: '2026-07-24', reason: 'saturday' });
  });
  it('25th on a Sunday → Friday 23rd', () => {
    const p = expectedPayDate('2026-01', 25); // 25 Jan 2026 is a Sunday
    expect(p).toMatchObject({ date: '2026-01-23', reason: 'sunday' });
  });
  it('25th on a national holiday → previous business day', () => {
    const christmas = expectedPayDate('2026-12', 25); // Friday, Christmas
    expect(christmas).toMatchObject({ date: '2026-12-24', reason: 'holiday', holiday: 'christmas' });
    const freedom = expectedPayDate('2026-04', 25); // Saturday and Freedom Day
    expect(freedom.date).toBe('2026-04-24');
    expect(freedom.reason).toBe('holiday');
    const monday = expectedPayDate('2027-04', 25); // Sunday 2027 → Friday 23
    expect(monday.date).toBe('2027-04-23');
  });
  it('skips a holiday reached while moving back (25 Dec 2022 Sunday → 23rd; 25 Apr 2021 Sunday → 23rd)', () => {
    expect(expectedPayDate('2022-12', 25).date).toBe('2022-12-23');
    expect(expectedPayDate('2021-04', 25).date).toBe('2021-04-23');
  });
  it('a configurable day (meal card) is handled the same way', () => {
    expect(expectedPayDate('2026-11', 1).date).toBe('2026-10-30'); // 1 Nov Sunday + holiday → Friday 30 Oct
  });
});

describe('estimate from days worked', () => {
  it('no holidays', () => expect(estimateFromDays({ normalDays: 21, holidayDays: 0, perDay: 60 })).toBe(1260));
  it('one holiday worked counts double', () => {
    expect(estimateFromDays({ normalDays: 20, holidayDays: 1, perDay: 60 })).toBe(1320);
    expect(paidDayEquivalents(20, 1)).toBe(22);
  });
  it('meal card with its own daily value', () => expect(estimateFromDays({ normalDays: 20, holidayDays: 1, perDay: 7.63 })).toBe(167.86));
  it('ignores negatives and garbage', () => expect(estimateFromDays({ normalDays: -3, holidayDays: Number.NaN, perDay: 50 })).toBe(0));
});

describe('summary without a fixed salary', () => {
  it('an undefined month has zero income (no assumed value)', () => {
    const s = computeMonthSummary({ month: '2026-11', income: 0, extraIncome: 0, mealCard: 0, items: [], notes: null }, [], []);
    expect(s.income).toBe(0);
    expect(s.mealCard).toBe(0);
  });
  it('the meal card is never part of the income', () => {
    const s = computeMonthSummary({ month: '2026-11', income: 1300, extraIncome: 0, mealCard: 160, items: [], notes: null }, [], []);
    expect(s.income).toBe(1300);
    expect(s.mealCard).toBe(160);
  });
  it('difference between expected and real', () => {
    const inc = { salaryConfirmed: true, mealConfirmed: false, expectedSalary: 1300, expectedMeal: null } as never;
    expect(incomeDifference(inc, 1360, 150)).toEqual({ salary: 60, meal: null, total: 60 });
    expect(incomeDifference(null, 1360, 150).total).toBeNull();
  });
  it('next payment skips months already received', () => {
    const incomes = new Map([['2026-11', { salaryConfirmed: true, mealConfirmed: false } as never]]);
    expect(nextPayment('salary', '2026-11-26', 25, incomes)?.pay.date).toBe('2026-12-24');
    expect(nextPayment('salary', '2026-11-10', 25, new Map())?.pay.date).toBe('2026-11-25');
    expect(nextPayment('meal', '2026-11-10', 25, incomes)?.pay.date).toBe('2026-11-25');
  });
});

describe('database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-income-'));
  process.env.DATA_DIR = dir;
  let repo: typeof import('@/lib/repo');
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    db = await import('@/lib/db');
    repo = await import('@/lib/repo');
  });
  afterAll(() => {
    (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    db.getDb().exec('DELETE FROM month_income; DELETE FROM month_budgets;');
  });
  const base = { salary: 1300, meal: 160, extraIncome: 0, normalDays: 20, holidayDays: 1, salaryPerDay: 60, mealPerDay: 7.6, salaryConfirmed: false, mealConfirmed: false, salaryPaidDate: null, mealPaidDate: null, notes: null };

  it('a new month starts with no income defined and no assumed salary', () => {
    expect(repo.getMonthIncome('2026-12')).toBeNull();
    const b = repo.ensureMonthBudget('2026-12');
    expect(b.income).toBe(0);
    expect(b.mealCard).toBe(0);
  });
  it('saving mirrors into the month budget, stores the expected pay date and days', () => {
    repo.saveMonthIncome('2026-07', base);
    const i = repo.getMonthIncome('2026-07');
    expect(i).toMatchObject({ normalDays: 20, holidayDays: 1, salaryExpectedDate: '2026-07-24' });
    expect(repo.ensureMonthBudget('2026-07')).toMatchObject({ income: 1300, mealCard: 160 });
  });
  it('confirming a different real amount keeps the forecast; effective date is stored', () => {
    repo.saveMonthIncome('2026-11', base);
    repo.saveMonthIncome('2026-11', { ...base, salary: 1360, salaryConfirmed: true, salaryPaidDate: '2026-11-24' });
    const i = repo.getMonthIncome('2026-11');
    expect(i).toMatchObject({ salaryConfirmed: true, expectedSalary: 1300, salaryPaidDate: '2026-11-24', salaryExpectedDate: '2026-11-25' });
    expect(repo.ensureMonthBudget('2026-11').income).toBe(1360);
    // editing again keeps the original forecast
    repo.saveMonthIncome('2026-11', { ...base, salary: 1370, salaryConfirmed: true, salaryPaidDate: '2026-11-24' });
    expect(repo.getMonthIncome('2026-11')?.expectedSalary).toBe(1300);
  });
  it('is always editable and other months are untouched', () => {
    repo.saveMonthIncome('2026-10', base);
    repo.saveMonthIncome('2026-11', { ...base, salary: 1500 });
    repo.saveMonthIncome('2026-11', { ...base, salary: 1450 });
    expect(repo.ensureMonthBudget('2026-10').income).toBe(1300);
    expect(repo.ensureMonthBudget('2026-11').income).toBe(1450);
  });
  it('migration is non-destructive: existing months with income become "defined", data kept', () => {
    const old = new Database(':memory:');
    old.exec(SCHEMA.replace(/CREATE TABLE IF NOT EXISTS month_income[\s\S]*?\);\n/, ''));
    old.exec('DROP TABLE IF EXISTS month_income');
    old.prepare("INSERT INTO month_budgets (month, income, extra_income, meal_card, items) VALUES ('2026-09', 175000, 0, 20000, '[]'), ('2026-10', 0, 0, 0, '[]')").run();
    old.pragma('user_version = 4');
    migrate(old);
    expect(old.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length + 1);
    expect((old.prepare('SELECT month FROM month_income').all() as { month: string }[]).map((r) => r.month)).toEqual(['2026-09']);
    expect((old.prepare('SELECT income FROM month_budgets WHERE month = ?').get('2026-09') as { income: number }).income).toBe(175000);
  });
});
