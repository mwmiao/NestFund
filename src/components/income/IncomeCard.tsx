import Link from 'next/link';
import type { TFunction } from '@/i18n/config';
import { Badge } from '@/components/ui';
import { formatDate, todayISO } from '@/lib/dates';
import { expectedPayDate } from '@/lib/payday';
import { incomeDifference, nextPayment, payNote } from '@/lib/income-view';
import { formatMoney } from '@/lib/format';
import type { MonthBudget, MonthIncome, Profile } from '@/lib/types';

/** Dashboard summary of the month's manual income, days worked and the next pay date. */
export function IncomeCard({
  month,
  budget,
  income,
  incomes,
  profile,
  salaryTotal,
  t,
  locale,
}: {
  month: string;
  budget: MonthBudget;
  income: MonthIncome | null;
  incomes: Map<string, MonthIncome>;
  profile: Profile;
  /** Salary used by the month summary (a logged salary replaces the entered one). */
  salaryTotal: number;
  t: TFunction;
  locale: string;
}) {
  const money = (v: number) => formatMoney(v, locale);
  const editHref = `/budget?m=${month}#income`;
  const today = todayISO();
  const nextSalary = nextPayment('salary', today, profile.salaryPayDay, incomes);
  const nextMeal = nextPayment('meal', today, profile.mealPayDay, incomes);
  const diff = incomeDifference(income, budget.income, budget.mealCard);
  const notes = [nextSalary && payNote(nextSalary.pay, t), nextMeal && payNote(nextMeal.pay, t)].filter(Boolean) as string[];

  return (
    <section className="card mb-4" id="income-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">{t('income.title')}</h2>
        <Link href={editHref} className="link">
          {income ? t('income.edit') : t('income.define')}
        </Link>
      </div>

      {income ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="eyebrow">{t('income.salary')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{money(salaryTotal)}</dd>
              <dd className="mt-0.5">
                <Badge tone={income.salaryConfirmed ? 'positive' : 'muted'}>{income.salaryConfirmed ? t('income.confirmed') : t('income.estimated')}</Badge>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('income.meal')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{money(budget.mealCard)}</dd>
              <dd className="mt-0.5">
                <Badge tone={income.mealConfirmed ? 'positive' : 'muted'}>{income.mealConfirmed ? t('income.confirmed') : t('income.estimated')}</Badge>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('income.daysWorked')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{income.normalDays + income.holidayDays}</dd>
              <dd className="muted mt-0.5 text-[11px]">{t('income.holidayWorkedCount', { n: String(income.holidayDays) })}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('income.totalIncome')}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{money(salaryTotal + budget.extraIncome + budget.mealCard)}</dd>
              <dd className="muted mt-0.5 text-[11px]">{t('income.totalHint')}</dd>
            </div>
          </dl>
          {diff.total != null && (
            <p className="mt-3 text-sm">
              <span className="muted">{t('income.difference')}: </span>
              <span className={`font-medium tabular-nums ${diff.total < 0 ? 'text-negative' : 'text-positive'}`}>{formatMoney(diff.total, locale, { sign: true })}</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm">
          <span className="font-medium">{t('income.notDefined')}</span>
          <span className="muted"> — {t('income.notDefinedHint')}</span>
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3 text-sm">
        <div className="eyebrow">{t('income.nextPayment')}</div>
        {nextSalary ? (
          <p className="mt-1">
            <span className="font-medium">{formatDate(nextSalary.pay.date)}</span> <span className="muted">· {t('income.salaryLower')}</span>
            {nextMeal && nextMeal.pay.date !== nextSalary.pay.date && (
              <>
                {' '}
                <span className="muted">
                  · {formatDate(nextMeal.pay.date)} {t('income.mealLower')}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="muted mt-1">{formatDate(expectedPayDate(month, profile.salaryPayDay).date)}</p>
        )}
        {notes.map((n) => (
          <p key={n} className="muted mt-0.5 text-xs">
            {n}
          </p>
        ))}
      </div>
    </section>
  );
}
