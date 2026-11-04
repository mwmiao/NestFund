import { describe, expect, it } from 'vitest';
import { changeRatio, filterTxs, monthWindow, monthlyContributions, monthsInPeriod, periodTotals, plannedVsActual, previousFilters, topLabels } from '@/lib/report-calc';
import type { Category, Transaction } from '@/lib/types';

let id = 1;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: id++, date: '2026-11-05', amount: 10, type: 'purchase', description: 'x', categoryId: 1, subcategory: null, account: 'ctt', toAccount: null,
  paymentMethod: 'card', merchant: null, notes: null, attachment: null, recurring: false, recurrence: null, parentId: null, ...over,
});
const cat = (over: Partial<Category>): Category => ({ id: 1, key: 'food', name: 'food', color: '#000', kind: 'expense', monthlyBudget: null, builtin: true, ...over });

describe('filters', () => {
  const txs = [tx({ date: '2026-11-02' }), tx({ date: '2026-10-02' }), tx({ date: '2025-11-02', account: 'revolut', categoryId: 2 }), tx({ date: '2026-11-03', type: 'transfer', toAccount: 'revolut' })];
  it('filters by month, year, account (source or destination) and category', () => {
    expect(filterTxs(txs, { month: '2026-11' })).toHaveLength(2);
    expect(filterTxs(txs, { year: '2026' })).toHaveLength(3);
    expect(filterTxs(txs, { account: 'revolut' })).toHaveLength(2);
    expect(filterTxs(txs, { categoryId: 2 })).toHaveLength(1);
    expect(filterTxs(txs, {})).toHaveLength(4);
  });
  it('year wins over month; previous period is the month or year before', () => {
    expect(filterTxs(txs, { month: '2026-11', year: '2025' })).toHaveLength(1);
    expect(previousFilters({ month: '2026-01' }).month).toBe('2025-12');
    expect(previousFilters({ year: '2026' }).year).toBe('2025');
  });
});

describe('period totals', () => {
  it('splits meal card from bank spending and ignores transfers and meal-card top-ups', () => {
    const r = periodTotals([
      tx({ amount: 20 }),
      tx({ amount: 12.5, account: 'meal_card' }),
      tx({ amount: 500, type: 'transfer', toAccount: 'trading212' }),
      tx({ amount: 1800, type: 'income' }),
      tx({ amount: 200, type: 'income', account: 'meal_card' }),
    ]);
    expect(r).toEqual({ spent: 32.5, bank: 20, meal: 12.5, income: 1800, count: 2 });
  });
  it('is all zeros without data', () => {
    expect(periodTotals([])).toEqual({ spent: 0, bank: 0, meal: 0, income: 0, count: 0 });
  });
});

describe('top stores', () => {
  it('groups by merchant (or description), ignoring case, ranked by frequency then amount', () => {
    const r = topLabels([
      tx({ merchant: 'Lidl', amount: 10 }), tx({ merchant: 'LIDL', amount: 5 }), tx({ merchant: 'Lidl', amount: 5 }),
      tx({ description: 'Café', amount: 1.5 }), tx({ description: 'café', amount: 1.5 }),
      tx({ merchant: 'Zara', amount: 80 }), tx({ merchant: 'Rare', amount: 3, type: 'income' }),
    ]);
    expect(r).toEqual([
      { label: 'Lidl', count: 3, total: 20 },
      { label: 'Café', count: 2, total: 3 },
      { label: 'Zara', count: 1, total: 80 },
    ]);
  });
  it('respects the limit', () => {
    expect(topLabels(Array.from({ length: 9 }, (_, i) => tx({ merchant: `S${i}` })), 5)).toHaveLength(5);
  });
});

describe('planned vs actual', () => {
  it('scales monthly budgets by the months in the period and only lists budgeted categories', () => {
    const cats = [cat({ id: 1, monthlyBudget: 180 }), cat({ id: 2, monthlyBudget: null }), cat({ id: 3, monthlyBudget: 40 })];
    const rows = plannedVsActual(cats, new Map([[1, 90], [2, 500]]), 2);
    expect(rows).toEqual([
      { categoryId: 1, planned: 360, spent: 90, ratio: 0.25 },
      { categoryId: 3, planned: 80, spent: 0, ratio: 0 },
    ]);
  });
  it('months in period', () => {
    expect(monthsInPeriod({ month: '2026-11' }, '2026-11-04')).toBe(1);
    expect(monthsInPeriod({ year: '2026' }, '2026-11-04')).toBe(11);
    expect(monthsInPeriod({ year: '2025' }, '2026-11-04')).toBe(12);
    expect(monthsInPeriod({ year: '2027' }, '2026-11-04')).toBe(0);
  });
});

describe('contributions and windows', () => {
  it('sums actual transfers into Trading 212 and Trade Republic per month', () => {
    const months = monthWindow('2026-11', 3);
    expect(months).toEqual(['2026-09', '2026-10', '2026-11']);
    const r = monthlyContributions(
      [tx({ date: '2026-10-02', type: 'transfer', amount: 500, toAccount: 'trading212' }), tx({ date: '2026-11-02', type: 'transfer', amount: 600, toAccount: 'traderepublic' }), tx({ date: '2026-11-03', amount: 99 })],
      months,
    );
    expect(r.map((x) => [x.trading212, x.traderepublic])).toEqual([[0, 0], [500, 0], [0, 600]]);
  });
  it('change ratio is null without a baseline', () => {
    expect(changeRatio(110, 100)).toBeCloseTo(0.1);
    expect(changeRatio(10, 0)).toBeNull();
  });
});
