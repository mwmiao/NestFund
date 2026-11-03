import { describe, expect, it } from 'vitest';
import { accountBalance, allocateGoals, availableForIncome, computeMonthSummary, monthMovements, totalsByCategory } from '@/lib/calc';
import type { BudgetItem, Category, MonthBudget, Transaction } from '@/lib/types';

let nextId = 1;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: nextId++,
  date: '2026-11-05',
  amount: 10,
  type: 'purchase',
  description: 'x',
  categoryId: 1,
  subcategory: null,
  account: 'ctt',
  toAccount: null,
  paymentMethod: 'card',
  merchant: null,
  notes: null,
  attachment: null,
  recurring: false,
  recurrence: null,
  parentId: null,
  ...over,
});

const categories: Category[] = [
  { id: 1, key: 'food', name: 'food', color: '#000', kind: 'expense', monthlyBudget: 180, builtin: true },
  { id: 2, key: 'gym', name: 'gym', color: '#000', kind: 'expense', monthlyBudget: null, builtin: true },
  { id: 3, key: 'investment', name: 'investment', color: '#000', kind: 'investment', monthlyBudget: null, builtin: true },
  { id: 4, key: 'gaming', name: 'gaming', color: '#000', kind: 'expense', monthlyBudget: 40, builtin: true },
  { id: 5, key: 'salary', name: 'salary', color: '#000', kind: 'salary', monthlyBudget: null, builtin: true },
  { id: 6, key: 'income', name: 'income', color: '#000', kind: 'income', monthlyBudget: null, builtin: true },
];

const item = (kind: BudgetItem['kind'], amount: number, categoryId: number | null = null, account: BudgetItem['account'] = null): BudgetItem => ({
  id: nextId++,
  name: kind,
  kind,
  amount,
  categoryId,
  account,
  startMonth: null,
  endMonth: null,
});

// Profile: 39,90 + 7 + 10,39 fixed, 275 leisure (Revolut), 500 ETF (Trading 212), 600 savings (Trade Republic).
const budget: MonthBudget = {
  month: '2026-11',
  income: 1750,
  extraIncome: 0,
  mealCard: 200,
  notes: null,
  items: [
    item('fixed', 39.9, 2, 'ctt'),
    item('fixed', 7, null, 'ctt'),
    item('fixed', 10.39, null, 'revolut'),
    item('leisure', 275, null, 'revolut'),
    item('etf', 500, 3, 'trading212'),
    item('savings', 600, null, 'traderepublic'),
  ],
};
const FIXED = 39.9 + 7 + 10.39;

describe('totals by category', () => {
  const txs = [
    tx({ categoryId: 1, amount: 38.45, account: 'meal_card' }),
    tx({ categoryId: 1, amount: 12.1 }),
    tx({ categoryId: 4, amount: 19.99, account: 'revolut' }),
    tx({ categoryId: 4, amount: 5, type: 'income' }),
    tx({ categoryId: 4, amount: 275, type: 'transfer', toAccount: 'revolut' }),
    tx({ categoryId: null, amount: 3 }),
  ];

  it('sums spending per category, sorted descending, ignoring income and transfers', () => {
    expect(totalsByCategory(txs)).toEqual([
      { categoryId: 1, total: 50.55, count: 2 },
      { categoryId: 4, total: 19.99, count: 1 },
      { categoryId: null, total: 3, count: 1 },
    ]);
  });

  it('can exclude meal-card spending', () => {
    expect(totalsByCategory(txs, { excludeMealCard: true })[0]).toEqual({ categoryId: 4, total: 19.99, count: 1 });
  });
});

describe('month summary', () => {
  it('never counts the meal card as available money, but shows it in statistics', () => {
    const s = computeMonthSummary(budget, [tx({ amount: 150, account: 'meal_card', categoryId: 1 }), tx({ amount: 200, type: 'income', account: 'meal_card', categoryId: 6 })], categories);
    expect(s.income).toBe(1750);
    expect(s.mealCardSpent).toBe(150);
    expect(s.mealCardLeft).toBe(50);
    expect(s.manualSpent).toBe(0);
    expect(s.plannedAvailable).toBeCloseTo(1750 - FIXED - 275 - 500 - 600, 2);
    expect(s.byCategory[0]).toMatchObject({ categoryId: 1, total: 150 });
  });

  it('treats transfers as contributions, not spending', () => {
    const s = computeMonthSummary(
      budget,
      [
        tx({ amount: 500, type: 'transfer', account: 'ctt', toAccount: 'trading212', categoryId: 3 }),
        tx({ amount: 600, type: 'transfer', account: 'ctt', toAccount: 'traderepublic' }),
        tx({ amount: 275, type: 'transfer', account: 'ctt', toAccount: 'revolut' }),
      ],
      categories,
    );
    expect(s.manualSpent).toBe(0);
    expect(s.etfTransferred).toBe(500);
    expect(s.savingsTransferred).toBe(600);
    expect(s.realAvailable).toBeCloseTo(1750 - FIXED - 500 - 600, 2);
  });

  it('does not double count fixed costs logged as transactions, and tracks Revolut leisure spending', () => {
    const s = computeMonthSummary(budget, [tx({ amount: 39.9, categoryId: 2, type: 'payment' }), tx({ amount: 19.99, categoryId: 4, account: 'revolut' })], categories);
    expect(s.manualSpent).toBeCloseTo(59.89, 2);
    expect(s.variableSpent).toBeCloseTo(19.99, 2);
    expect(s.leisureSpent).toBeCloseTo(19.99, 2);
    expect(s.realAvailable).toBeCloseTo(1750 - FIXED - 500 - 600 - 19.99, 2);
  });

  it('uses the real salary when it is logged', () => {
    const s = computeMonthSummary(budget, [tx({ amount: 1800, type: 'income', categoryId: 5 }), tx({ amount: 25, type: 'income', categoryId: 6, account: 'revolut' })], categories);
    expect(s.salaryReceived).toBe(1800);
    expect(s.salary).toBe(1800);
    expect(s.otherIncome).toBe(25);
    expect(s.income).toBe(1825);
  });

  it('computes the savings rate on planned ETF + savings', () => {
    const s = computeMonthSummary(budget, [], categories);
    expect(s.savingsTotal).toBe(1100);
    expect(s.savingsRate).toBeCloseTo(1100 / 1750, 6);
  });

  it('flags a negative budget', () => {
    expect(computeMonthSummary({ ...budget, income: 1000 }, [], categories).negativePlanned).toBe(true);
  });

  it('shows the 1.750 € vs 1.800 € difference', () => {
    expect(availableForIncome(1800, budget.items) - availableForIncome(1750, budget.items)).toBeCloseTo(50, 6);
  });
});

describe('account balances', () => {
  const snapshots = [
    { account: 'ctt' as const, date: '2026-10-31', value: 1000, invested: 1000 },
    { account: 'trading212' as const, date: '2026-10-31', value: 9242.3, invested: 8255.97 },
  ];
  const txs = [
    tx({ date: '2026-10-20', amount: 999 }), // before the check-in: ignored
    tx({ date: '2026-11-01', amount: 1750, type: 'income', categoryId: 5 }),
    tx({ date: '2026-11-02', amount: 500, type: 'transfer', toAccount: 'trading212' }),
    tx({ date: '2026-11-02', amount: 275, type: 'transfer', toAccount: 'revolut' }),
    tx({ date: '2026-11-04', amount: 19.99, account: 'revolut' }),
    tx({ date: '2026-11-05', amount: 8.75 }),
  ];

  it('starts from the last check-in and applies later movements', () => {
    expect(accountBalance('ctt', snapshots, txs).balance).toBeCloseTo(1000 + 1750 - 500 - 275 - 8.75, 2);
  });

  it('adds transfers to the Trading 212 cost basis', () => {
    const b = accountBalance('trading212', snapshots, txs);
    expect(b.balance).toBeCloseTo(9742.3, 2);
    expect(b.invested).toBeCloseTo(8755.97, 2);
  });

  it('sums all movements when no check-in exists', () => {
    expect(accountBalance('revolut', snapshots, txs).balance).toBeCloseTo(275 - 19.99 - 0, 2);
  });

  it('reports monthly inflow/outflow per account', () => {
    expect(monthMovements('ctt', txs.slice(1))).toEqual({ account: 'ctt', inflow: 1750, outflow: 783.75, net: 966.25, count: 4 });
  });
});

describe('goal allocation from account balances', () => {
  const goals = [
    { id: 1, target: 6000, current: 0, account: 'traderepublic' as const },
    { id: 2, target: 42500, current: 0, account: 'traderepublic' as const },
    { id: 3, target: 500000, current: 0, account: 'trading212' as const },
    { id: 4, target: 1000, current: 123, account: null },
  ];

  it('fills the emergency fund first, then the house', () => {
    const r = allocateGoals(goals, { traderepublic: 8000, trading212: 9242.3 });
    expect(r.map((g) => g.current)).toEqual([6000, 2000, 9242.3, 123]);
  });

  it('gives everything to the first goal while it is not full', () => {
    const r = allocateGoals(goals, { traderepublic: 2800 });
    expect(r[0].current).toBe(2800);
    expect(r[1].current).toBe(0);
  });
});
