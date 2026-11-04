// Which in-app notices apply right now. Pure: the caller passes the numbers, nothing here reads the database or the clock.
// Notices only inform; they never tell the user to spend, save or invest.
import { daysInMonth } from './dates';

export interface NotificationPrefs {
  /** Weekly reminder to review transactions without a category. */
  weeklyUncategorized: boolean;
  /** Reminder in the last days of the month to look at budget and goals. */
  monthEnd: boolean;
  /** Notice when a category reaches 80% of its monthly budget (and again when it passes 100%). */
  categoryBudget: boolean;
  /** Notice when the month's budget is negative. */
  negativeBudget: boolean;
}

/** Everything is off until the user turns it on. */
export const DEFAULT_PREFS: NotificationPrefs = { weeklyUncategorized: false, monthEnd: false, categoryBudget: false, negativeBudget: false };
export const PREF_KEYS = Object.keys(DEFAULT_PREFS) as (keyof NotificationPrefs)[];

export type NotificationKind = 'weekly' | 'monthEnd' | 'categoryBudget' | 'negativeBudget';

export interface AppNotification {
  /** Unique per notice and period, so dismissing one never hides a later one. */
  id: string;
  kind: NotificationKind;
  tone: 'info' | 'caution';
  /** Raw values; the UI formats them in the user's language. */
  data: { n?: number; categoryId?: number; spent?: number; limit?: number; ratio?: number; amount?: number; which?: 'planned' | 'real' };
}

export interface NotificationInput {
  prefs: NotificationPrefs;
  /** YYYY-MM-DD */
  today: string;
  uncategorized: number;
  categories: { id: number; kind: string; monthlyBudget: number | null }[];
  spentByCategory: Map<number | null, number>;
  summary: { hasIncome: boolean; negativePlanned: boolean; plannedAvailable: number; negativeReal: boolean; realAvailable: number };
  dismissed: ReadonlySet<string>;
}

/** ISO 8601 week label, e.g. 2026-W45 (weeks start on Monday). */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The month-end reminder appears for the last three days of the month. */
export const MONTH_END_DAYS = 3;

export function computeNotifications(input: NotificationInput): AppNotification[] {
  const { prefs, today, dismissed } = input;
  const month = today.slice(0, 7);
  const out: AppNotification[] = [];

  if (prefs.weeklyUncategorized && input.uncategorized > 0) {
    out.push({ id: `weekly:${isoWeek(today)}`, kind: 'weekly', tone: 'info', data: { n: input.uncategorized } });
  }

  if (prefs.monthEnd && Number(today.slice(8, 10)) > daysInMonth(month) - MONTH_END_DAYS) {
    out.push({ id: `monthEnd:${month}`, kind: 'monthEnd', tone: 'info', data: {} });
  }

  if (prefs.categoryBudget) {
    for (const c of input.categories) {
      const limit = c.monthlyBudget ?? 0;
      if (c.kind !== 'expense' || limit <= 0) continue;
      const spent = input.spentByCategory.get(c.id) ?? 0;
      const ratio = spent / limit;
      if (ratio < 0.8) continue;
      // Separate ids for "80%" and "over budget" so crossing 100% later is announced again.
      out.push({ id: `cat:${c.id}:${month}:${ratio >= 1 ? 100 : 80}`, kind: 'categoryBudget', tone: ratio >= 1 ? 'caution' : 'info', data: { categoryId: c.id, spent, limit, ratio } });
    }
  }

  if (prefs.negativeBudget && input.summary.hasIncome) {
    if (input.summary.negativePlanned) {
      out.push({ id: `neg:${month}:planned`, kind: 'negativeBudget', tone: 'caution', data: { which: 'planned', amount: Math.abs(input.summary.plannedAvailable) } });
    }
    if (input.summary.negativeReal) {
      out.push({ id: `neg:${month}:real`, kind: 'negativeBudget', tone: 'caution', data: { which: 'real', amount: Math.abs(input.summary.realAvailable) } });
    }
  }

  return out.filter((n) => !dismissed.has(n.id));
}
