import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, computeNotifications, isoWeek, type NotificationInput } from '@/lib/notifications-calc';

const base = (over: Partial<NotificationInput> = {}): NotificationInput => ({
  prefs: { weeklyUncategorized: true, monthEnd: true, categoryBudget: true, negativeBudget: true },
  today: '2026-11-04',
  uncategorized: 0,
  categories: [
    { id: 1, kind: 'expense', monthlyBudget: 200 },
    { id: 2, kind: 'expense', monthlyBudget: null },
    { id: 3, kind: 'savings', monthlyBudget: 100 },
  ],
  spentByCategory: new Map(),
  summary: { hasIncome: true, negativePlanned: false, plannedAvailable: 100, negativeReal: false, realAvailable: 50 },
  dismissed: new Set(),
  ...over,
});
const ids = (i: NotificationInput) => computeNotifications(i).map((n) => n.id);

describe('notifications', () => {
  it('everything is off by default', () => {
    expect(computeNotifications(base({ prefs: DEFAULT_PREFS, uncategorized: 5, today: '2026-11-30', spentByCategory: new Map([[1, 500]]), summary: { hasIncome: true, negativePlanned: true, plannedAvailable: -1, negativeReal: true, realAvailable: -1 } }))).toEqual([]);
  });

  it('weekly reminder needs uncategorised transactions and is once per ISO week', () => {
    expect(ids(base())).toEqual([]);
    expect(ids(base({ uncategorized: 3 }))).toEqual(['weekly:2026-W45']);
    expect(ids(base({ uncategorized: 3, dismissed: new Set(['weekly:2026-W45']) }))).toEqual([]);
    expect(ids(base({ uncategorized: 3, today: '2026-11-09', dismissed: new Set(['weekly:2026-W45']) }))).toEqual(['weekly:2026-W46']);
  });

  it('iso weeks follow Monday-start rules across year ends', () => {
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2025-12-29')).toBe('2026-W01');
    expect(isoWeek('2027-01-03')).toBe('2026-W53');
  });

  it('month-end reminder shows only in the last three days', () => {
    expect(ids(base({ today: '2026-11-27' }))).toEqual([]);
    expect(ids(base({ today: '2026-11-28' }))).toEqual(['monthEnd:2026-11']);
    expect(ids(base({ today: '2026-02-26' }))).toEqual(['monthEnd:2026-02']);
    expect(ids(base({ today: '2026-02-25' }))).toEqual([]);
  });

  it('category notice appears at 80% and again, separately, over 100%', () => {
    expect(ids(base({ spentByCategory: new Map([[1, 159]]) }))).toEqual([]);
    const at80 = computeNotifications(base({ spentByCategory: new Map([[1, 160]]) }));
    expect(at80.map((n) => [n.id, n.tone])).toEqual([['cat:1:2026-11:80', 'info']]);
    const over = computeNotifications(base({ spentByCategory: new Map([[1, 210]]), dismissed: new Set(['cat:1:2026-11:80']) }));
    expect(over.map((n) => [n.id, n.tone])).toEqual([['cat:1:2026-11:100', 'caution']]);
  });

  it('ignores categories without a budget and non-expense categories', () => {
    expect(ids(base({ spentByCategory: new Map([[2, 999], [3, 999]]) }))).toEqual([]);
  });

  it('negative budget needs income and reports planned and real separately', () => {
    const neg = { hasIncome: true, negativePlanned: true, plannedAvailable: -40, negativeReal: true, realAvailable: -10 };
    expect(computeNotifications(base({ summary: neg })).map((n) => [n.id, n.data.amount])).toEqual([['neg:2026-11:planned', 40], ['neg:2026-11:real', 10]]);
    expect(ids(base({ summary: { ...neg, hasIncome: false } }))).toEqual([]);
  });

  it('only enabled kinds are produced', () => {
    const only = base({ prefs: { ...DEFAULT_PREFS, monthEnd: true }, uncategorized: 4, today: '2026-11-30', spentByCategory: new Map([[1, 500]]) });
    expect(ids(only)).toEqual(['monthEnd:2026-11']);
  });
});
