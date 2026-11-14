import Link from 'next/link';
import { Card, Dot, EmptyState, ProgressBar } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import type { MonthSummary } from '@/lib/calc';
import { formatMoney, formatPercent } from '@/lib/format';
import { categoryName } from '@/lib/labels';
import type { Category } from '@/lib/types';

/** Dashboard card: variable spending against what can be spent, plus the top categories. */
export function MonthBudgetCard({
  month,
  summary: s,
  hasIncome,
  categories,
  t,
  locale,
}: {
  month: string;
  summary: MonthSummary;
  hasIncome: boolean;
  categories: Category[];
  t: TFunction;
  locale: string;
}) {
  const money = (v: number) => formatMoney(v, locale);
  const catById = new Map(categories.map((c) => [c.id, c]));
  // Same "what is there to spend" as the Budget page: income minus fixed costs, ETF and savings.
  const spendable = Math.max(s.income - s.fixed - s.etf - s.savings, 0);
  return (
    <Card
      title={t('dashboard.thisMonth')}
      className="lg:col-span-3"
      actions={
        <Link href={`/budget?m=${month}`} className="link">
          {t('nav.budget')}
        </Link>
      }
    >
      {hasIncome ? (
        <>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="muted">{t('dashboard.spentOf', { spent: money(s.variableSpent), total: money(spendable) })}</span>
            <span className="font-medium tabular-nums">{spendable > 0 ? formatPercent(s.variableSpent / spendable, locale, 0) : '—'}</span>
          </div>
          <ProgressBar value={spendable > 0 ? s.variableSpent / spendable : 0} tone="auto" label={t('dashboard.thisMonth')} />
          {s.byCategory.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {s.byCategory.slice(0, 5).map((r) => {
                const cat = r.categoryId != null ? catById.get(r.categoryId) : undefined;
                const limit = cat?.monthlyBudget ?? 0;
                return (
                  <li key={String(r.categoryId)}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <Dot color={cat?.color ?? '#71717a'} />
                      <span className="flex-1 truncate">{categoryName(cat, t)}</span>
                      <span className="tabular-nums">
                        {money(r.total)}
                        {limit > 0 && <span className="muted"> / {money(limit)}</span>}
                      </span>
                    </div>
                    {limit > 0 && <ProgressBar size="sm" value={r.total / limit} tone="auto" label={categoryName(cat, t)} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted mt-5 text-sm">{t('dashboard.noSpendingYet')}</p>
          )}
        </>
      ) : (
        <EmptyState compact title={t('income.notDefined')} hint={t('income.notDefinedHint')} action={{ href: `/budget?m=${month}#income`, label: t('income.define') }} />
      )}
    </Card>
  );
}
