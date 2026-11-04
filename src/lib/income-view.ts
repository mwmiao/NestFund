// Presentation helpers for the manual monthly income: pay-date notes, next payment and the forecast-vs-real difference.
import type { TFunction } from '@/i18n/config';
import { addMonths, formatDate } from './dates';
import { expectedPayDate, type PayDate } from './payday';
import type { MonthIncome } from './types';

/** "Pago antecipadamente porque o dia 25 cai ao sábado" — null when it is paid on the nominal day. */
export function payNote(pd: PayDate, t: TFunction): string | null {
  if (!pd.reason) return null;
  const day = String(Number(pd.nominal.slice(8, 10)));
  if (pd.reason === 'holiday') return t('income.payNote.holiday', { day, holiday: pd.holiday ? t(`income.holidays.${pd.holiday}`) : '' });
  return t(`income.payNote.${pd.reason}`, { day });
}

export interface NextPayment {
  kind: 'salary' | 'meal';
  month: string;
  pay: PayDate;
}

/** Next not-yet-received payment of one kind, looking at the current and following months. */
export function nextPayment(kind: 'salary' | 'meal', today: string, payDay: number, incomes: Map<string, MonthIncome>): NextPayment | null {
  const thisMonth = today.slice(0, 7);
  for (let i = 0; i < 3; i++) {
    const month = addMonths(thisMonth, i);
    const inc = incomes.get(month);
    const received = kind === 'salary' ? inc?.salaryConfirmed : inc?.mealConfirmed;
    if (received) continue;
    const pay = expectedPayDate(month, payDay);
    if (pay.date >= today) return { kind, month, pay };
  }
  return null;
}

export const dateText = (iso: string) => formatDate(iso);

/** Real minus expected, only when a forecast was replaced by the real amount. */
export function incomeDifference(inc: MonthIncome | null, salary: number, meal: number): { salary: number | null; meal: number | null; total: number | null } {
  const s = inc?.salaryConfirmed && inc.expectedSalary != null ? Math.round((salary - inc.expectedSalary) * 100) / 100 : null;
  const m = inc?.mealConfirmed && inc.expectedMeal != null ? Math.round((meal - inc.expectedMeal) * 100) / 100 : null;
  return { salary: s, meal: m, total: s == null && m == null ? null : Math.round(((s ?? 0) + (m ?? 0)) * 100) / 100 };
}
