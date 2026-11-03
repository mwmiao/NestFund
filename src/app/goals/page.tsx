import { deleteGoalAction, saveGoalAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Card, EmptyState, Field, PageHeader, ProgressBar } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { goalProgress } from '@/lib/calc';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent, toInputDecimal } from '@/lib/format';
import { AccountBadge } from '@/components/AccountBadge';
import { accountName } from '@/lib/labels';
import { listGoals } from '@/lib/repo';
import { ACCOUNT_IDS, GOAL_KINDS, type Goal } from '@/lib/types';


function GoalForm({ goal, t }: { goal?: Goal; t: TFunction }) {
  return (
    <form action={saveGoalAction} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label={t('common.name')} className="col-span-2">
        <input name="name" required defaultValue={goal?.name ?? ''} className="input" />
      </Field>
      <Field label={t('common.kind')}>
        <select name="kind" defaultValue={goal?.kind ?? 'custom'} className="input">
          {GOAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`goals.kinds.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${t('goals.target')} (€)`}>
        <input name="target" required inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.target) : ''} className="input tabular-nums" />
      </Field>
      <Field label={t('goals.account')}>
        <select name="account" defaultValue={goal?.account ?? ''} className="input">
          <option value="">{t('goals.manual')}</option>
          {ACCOUNT_IDS.map((a) => (
            <option key={a} value={a}>
              {accountName(a, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${t('goals.current')} (€) · ${t('goals.manual')}`}>
        <input name="current" inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.current) : '0'} className="input tabular-nums" />
      </Field>
      <Field label={`${t('goals.monthly')} (€)`}>
        <input name="monthly" inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.monthly) : ''} className="input tabular-nums" />
      </Field>
      <Field label={`${t('goals.targetDate')} (${t('common.optional')})`}>
        <input type="month" name="targetDate" defaultValue={goal?.targetDate ?? ''} className="input" />
      </Field>
      <Field label={t('common.color')}>
        <input type="color" name="color" defaultValue={goal?.color ?? '#10b981'} className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-300 bg-transparent dark:border-zinc-700" />
      </Field>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
        {goal && <ConfirmButton formAction={deleteGoalAction}>{t('common.delete')}</ConfirmButton>}
        <button className="btn-primary">{goal ? t('common.save') : t('common.add')}</button>
      </div>
    </form>
  );
}

export default async function GoalsPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const goals = listGoals();
  const now = currentMonth();

  return (
    <>
      <PageHeader title={t('goals.title')} />
      {goals.length === 0 && (
        <Card className="mb-4">
          <EmptyState title={t('goals.emptyTitle')} hint={t('goals.emptyHint')} action={{ href: '/setup?step=goals', label: t('goals.emptyAction') }} />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 empty:hidden">
        {goals.map((g) => {
          const p = goalProgress(g, now);
          return (
            <Card key={g.id}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide" style={{ color: g.color }}>
                    {t(`goals.kinds.${g.kind}`)}
                  </div>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">{formatPercent(p.pct, locale, 0)}</div>
                </div>
              </div>
              <div className="mb-2 flex justify-between text-sm tabular-nums">
                <span>{money(g.current)}</span>
                <span className="muted">{money(g.target)}</span>
              </div>
              <ProgressBar value={p.pct} color={g.color} />
              {g.account && (
                <p className="muted mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <AccountBadge id={g.account} label={accountName(g.account, t)} size="xs" />
                  {t('goals.fromAccount', { account: accountName(g.account, t) })}
                </p>
              )}
              <div className="mt-3 space-y-1 text-sm">
                <p>{p.remaining === 0 ? t('goals.reached') : t('goals.remaining', { amount: money(p.remaining) })}</p>
                {p.remaining > 0 && (
                  <p className="muted">
                    {p.monthsLeft != null && p.projectedMonth
                      ? t('goals.eta', { month: monthLabel(p.projectedMonth, locale), n: p.monthsLeft })
                      : t('goals.noEta')}
                  </p>
                )}
                {g.targetDate && p.remaining > 0 && p.requiredMonthly != null && (
                  <p className="muted">
                    {t('goals.requiredMonthly', { amount: money(p.requiredMonthly), month: monthLabel(g.targetDate, locale) })}{' '}
                    <span className={p.onTrack ? 'text-emerald-500' : 'text-amber-500'}>· {p.onTrack ? t('goals.onTrack') : t('goals.offTrack')}</span>
                  </p>
                )}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-brand-500">{t('common.edit')}</summary>
                <div className="mt-3">
                  <GoalForm goal={g} t={t} />
                </div>
              </details>
            </Card>
          );
        })}
      </div>
      <Card title={t('goals.new')} className="mt-4">
        <GoalForm t={t} />
      </Card>
    </>
  );
}
