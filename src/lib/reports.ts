import 'server-only';
import { totalsByCategory, type CategoryTotal } from './calc';
import { currentMonth, isMonth, todayISO } from './dates';
import { round2 } from './format';
import { listCategories, listSnapshots, listTransactions } from './repo';
import {
  filterTxs,
  monthlyContributions,
  monthsInPeriod,
  monthWindow,
  periodTotals,
  plannedVsActual,
  previousFilters,
  topLabels,
  type BudgetRow,
  type ContributionRow,
  type LabelTotal,
  type PeriodTotals,
  type ReportFilters,
} from './report-calc';
import { listT212History } from './t212';
import { ACCOUNT_IDS } from './types';

export function parseReportFilters(sp: Record<string, string | string[] | undefined>): ReportFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const year = get('year');
  const month = get('month');
  const cat = Number(get('category'));
  const account = get('account');
  const validYear = year && /^\d{4}$/.test(year) ? year : undefined;
  return {
    year: validYear,
    // A year replaces the month; with neither, the report covers the current month.
    month: validYear ? undefined : isMonth(month) ? month : currentMonth(),
    account: ACCOUNT_IDS.includes(account as never) ? account : undefined,
    categoryId: Number.isInteger(cat) && cat > 0 ? cat : undefined,
  };
}

export interface PortfolioPoint {
  date: string;
  value: number;
  invested: number;
}

export interface Report {
  filters: ReportFilters;
  previous: ReportFilters;
  totals: PeriodTotals;
  previousTotals: PeriodTotals;
  byCategory: CategoryTotal[];
  topCategories: CategoryTotal[];
  budget: BudgetRow[];
  budgetTotals: { planned: number; spent: number };
  topStores: LabelTotal[];
  window: string[];
  contributions: ContributionRow[];
  trading212: PortfolioPoint[];
  traderepublic: PortfolioPoint[];
  years: string[];
}

export function buildReport(filters: ReportFilters): Report {
  const all = listTransactions();
  const categories = listCategories();
  const today = todayISO();
  const previous = previousFilters(filters);

  const current = filterTxs(all, filters);
  const before = filterTxs(all, previous);
  const byCategory = totalsByCategory(current);
  const spentByCat = new Map(byCategory.map((r) => [r.categoryId, r.total]));
  const budget = plannedVsActual(categories, spentByCat, monthsInPeriod(filters, today));
  // With a category filter the table naturally shrinks to that category.
  const shownBudget = filters.categoryId ? budget.filter((b) => b.categoryId === filters.categoryId) : budget;

  // Contributions and portfolio curves cover 12 months: the selected year, or the 12 months up to the selected month.
  const end = filters.year ? (filters.year === today.slice(0, 4) ? currentMonth() : `${filters.year}-12`) : (filters.month as string);
  const window = monthWindow(end, 12);
  const from = `${window[0]}-01`;
  const to = `${window[window.length - 1]}-31`;
  const inWindow = <T extends { date: string }>(rows: T[]) => rows.filter((r) => r.date >= from && r.date <= to);

  const history = inWindow(listT212History(800)).map((h) => ({ date: h.date, value: h.totalValue, invested: h.invested }));
  const snaps = (acc: 'trading212' | 'traderepublic') => inWindow(listSnapshots(acc)).map((s) => ({ date: s.date, value: s.value, invested: s.invested }));
  const t212Snaps = snaps('trading212');

  const years = [...new Set([...all.map((t) => t.date.slice(0, 4)), today.slice(0, 4)])].sort().reverse();

  return {
    filters,
    previous,
    totals: periodTotals(current),
    previousTotals: periodTotals(before),
    byCategory,
    topCategories: byCategory.slice(0, 5),
    budget: shownBudget,
    budgetTotals: { planned: round2(shownBudget.reduce((s, b) => s + b.planned, 0)), spent: round2(shownBudget.reduce((s, b) => s + b.spent, 0)) },
    topStores: topLabels(current, 5),
    window,
    contributions: monthlyContributions(all, window),
    trading212: history.length >= t212Snaps.length ? history : t212Snaps,
    traderepublic: snaps('traderepublic'),
    years,
  };
}
