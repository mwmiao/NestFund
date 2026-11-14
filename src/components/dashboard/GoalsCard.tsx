import Link from 'next/link';
import { Card, EmptyState, ProgressBar } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import { goalProgress } from '@/lib/calc';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import type { Goal } from '@/lib/types';

/** Dashboard summary of the first four goals. */
export function GoalsCard({ goals, t, locale }: { goals: Goal[]; t: TFunction; locale: string }) {
  const money = (v: number) => formatMoney(v, locale);
  return (
    <Card
      title={t('dashboard.goals')}
      className="lg:col-span-2"
      actions={
        goals.length > 0 && (
          <Link href="/goals" className="link">
            {t('dashboard.seeAll')}
          </Link>
        )
      }
    >
      {goals.length ? (
        <ul className="space-y-5">
          {goals.slice(0, 4).map((g) => {
            const p = goalProgress(g, currentMonth());
            return (
              <li key={g.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  <span className="text-xs tabular-nums text-subtle">{formatPercent(p.pct, locale, 0)}</span>
                </div>
                <ProgressBar value={p.pct} color={g.color} label={g.name} />
                <div className="muted mt-1.5 flex justify-between text-xs tabular-nums">
                  <span>
                    {money(g.current)} / {money(g.target)}
                  </span>
                  {p.remaining > 0 && p.projectedMonth && <span>{monthLabel(p.projectedMonth, locale, 'short')}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title={t('goals.emptyTitle')} hint={t('goals.emptyHint')} action={{ href: '/setup?step=goals', label: t('goals.emptyAction') }} />
      )}
    </Card>
  );
}
