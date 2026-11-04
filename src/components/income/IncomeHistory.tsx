import Link from 'next/link';
import { Badge, Card, Empty } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import { formatDate, monthLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import type { MonthBudget, MonthIncome } from '@/lib/types';

/** Month-by-month income: salary, meal card, days worked (holidays apart), total and the real pay date. Averages are never shown as official values. */
export function IncomeHistory({ budgets, incomes, months, t, locale, title }: { budgets: MonthBudget[]; incomes: MonthIncome[]; months?: string[]; t: TFunction; locale: string; title: string }) {
  const money = (v: number) => formatMoney(v, locale);
  const budgetBy = new Map(budgets.map((b) => [b.month, b]));
  const rows = incomes
    .filter((i) => !months || months.includes(i.month))
    .map((i) => ({ i, b: budgetBy.get(i.month) }))
    .filter((r): r is { i: MonthIncome; b: MonthBudget } => r.b != null)
    .reverse();

  return (
    <Card title={title} className="mt-4">
      {rows.length === 0 ? (
        <Empty>{t('income.historyEmpty')}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="pb-2 font-medium">{t('common.month')}</th>
                <th className="pb-2 text-right font-medium">{t('income.salary')}</th>
                <th className="pb-2 text-right font-medium">{t('income.meal')}</th>
                <th className="pb-2 text-right font-medium">{t('income.normalDaysShort')}</th>
                <th className="pb-2 text-right font-medium">{t('income.holidayDaysShort')}</th>
                <th className="pb-2 text-right font-medium">{t('income.totalIncome')}</th>
                <th className="pb-2 text-right font-medium">{t('income.expectedDate')}</th>
                <th className="pb-2 text-right font-medium">{t('income.paidDateShort')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ i, b }) => (
                <tr key={i.month} className="table-row">
                  <td className="py-2">
                    <Link href={`/budget?m=${i.month}#income`} className="hover:text-brand-500">
                      {monthLabel(i.month, locale)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {money(b.income)} {!i.salaryConfirmed && <Badge>{t('income.estimated')}</Badge>}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {money(b.mealCard)} {!i.mealConfirmed && <Badge>{t('income.estimated')}</Badge>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{i.normalDays}</td>
                  <td className="py-2 text-right tabular-nums">{i.holidayDays}</td>
                  <td className="py-2 text-right tabular-nums">{money(b.income + b.extraIncome + b.mealCard)}</td>
                  <td className="py-2 text-right tabular-nums">{i.salaryExpectedDate ? formatDate(i.salaryExpectedDate) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{i.salaryPaidDate ? formatDate(i.salaryPaidDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted mt-3 text-xs">{t('income.historyNote')}</p>
    </Card>
  );
}
