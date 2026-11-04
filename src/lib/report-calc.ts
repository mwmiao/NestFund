// Pure aggregation for the Reports page and its CSV export. No I/O, no sample data: everything comes from the transactions passed in.
import { addMonths } from './dates';
import { round2 } from './format';
import { isSpending, type Category, type Transaction } from './types';

export interface ReportFilters {
  /** YYYY-MM. Ignored when `year` is set. */
  month?: string;
  /** YYYY */
  year?: string;
  account?: string;
  categoryId?: number;
}

/** Filters by period, account (source or destination) and category. No period = everything. */
export function filterTxs(txs: Transaction[], f: ReportFilters): Transaction[] {
  return txs.filter((t) => {
    if (f.year ? !t.date.startsWith(f.year) : f.month ? !t.date.startsWith(f.month) : false) return false;
    if (f.account && t.account !== f.account && t.toAccount !== f.account) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    return true;
  });
}

/** The period right before: previous month, or previous year. */
export function previousFilters(f: ReportFilters): ReportFilters {
  if (f.year) return { ...f, year: String(Number(f.year) - 1) };
  if (f.month) return { ...f, month: addMonths(f.month, -1) };
  return f;
}

export interface PeriodTotals {
  /** All spending: bank/cash/cards plus the meal card. */
  spent: number;
  /** Spending paid from money accounts (everything except the meal card). */
  bank: number;
  /** Spending paid with the meal card. */
  meal: number;
  /** Income, never counting meal-card top-ups. */
  income: number;
  count: number;
}

export function periodTotals(txs: Transaction[]): PeriodTotals {
  let bank = 0;
  let meal = 0;
  let income = 0;
  let count = 0;
  for (const t of txs) {
    if (isSpending(t.type)) {
      count++;
      if (t.account === 'meal_card') meal += t.amount;
      else bank += t.amount;
    } else if (t.type === 'income' && t.account !== 'meal_card') income += t.amount;
  }
  return { spent: round2(bank + meal), bank: round2(bank), meal: round2(meal), income: round2(income), count };
}

export interface LabelTotal {
  label: string;
  count: number;
  total: number;
}

/** Most frequent stores (or descriptions when no store was typed), ties broken by amount. Case and spacing are ignored when grouping. */
export function topLabels(txs: Transaction[], n = 5): LabelTotal[] {
  const groups = new Map<string, { names: Map<string, number>; count: number; total: number }>();
  for (const t of txs) {
    if (!isSpending(t.type)) continue;
    const name = (t.merchant?.trim() || t.description.trim()).replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { names: new Map(), count: 0, total: 0 };
    g.names.set(name, (g.names.get(name) ?? 0) + 1);
    g.count += 1;
    g.total += t.amount;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ label: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: g.count, total: round2(g.total) }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, n);
}

export interface BudgetRow {
  categoryId: number;
  planned: number;
  spent: number;
  /** spent / planned (1 = exactly on budget) */
  ratio: number;
}

/** Number of months a monthly category budget should be multiplied by for the period. */
export function monthsInPeriod(f: ReportFilters, today: string): number {
  if (!f.year) return 1;
  const current = today.slice(0, 4);
  if (f.year === current) return Number(today.slice(5, 7));
  return f.year > current ? 0 : 12;
}

/** Planned (monthly budget × months) against what was really spent, for categories that have a budget. */
export function plannedVsActual(categories: Category[], spentByCategory: Map<number | null, number>, months: number): BudgetRow[] {
  return categories
    .filter((c) => c.monthlyBudget != null && c.monthlyBudget > 0)
    .map((c) => {
      const planned = round2((c.monthlyBudget as number) * months);
      const spent = round2(spentByCategory.get(c.id) ?? 0);
      return { categoryId: c.id, planned, spent, ratio: planned > 0 ? spent / planned : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** The `count` months ending at `end` (YYYY-MM), oldest first. */
export function monthWindow(end: string, count = 12): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - (count - 1)));
}

export interface ContributionRow {
  month: string;
  trading212: number;
  traderepublic: number;
}

/** Money actually moved into Trading 212 and Trade Republic (transfers), per month. */
export function monthlyContributions(txs: Transaction[], months: string[]): ContributionRow[] {
  return months.map((month) => {
    let trading212 = 0;
    let traderepublic = 0;
    for (const t of txs) {
      if (t.type !== 'transfer' || !t.date.startsWith(month)) continue;
      if (t.toAccount === 'trading212') trading212 += t.amount;
      if (t.toAccount === 'traderepublic') traderepublic += t.amount;
    }
    return { month, trading212: round2(trading212), traderepublic: round2(traderepublic) };
  });
}

/** Percentage change from `before` to `now`; null when there is nothing to compare against. */
export function changeRatio(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}
