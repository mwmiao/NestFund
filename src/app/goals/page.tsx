import { deleteGoalAction, saveGoalAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Badge, Card, EmptyState, Field, PageHeader, ProgressBar } from '@/components/ui';
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
        <input type="color" name="color" defaultValue={goal?.color ?? '#10b981'} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent" />
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

  const total = goals.reduce((sum, g) => sum + g.current, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.target, 0);

  return (
    <>
      <PageHeader
        title={t('goals.title')}
        subtitle={goals.length > 0 ? t('goals.summary', { saved: money(total), target: money(totalTarget) }) : undefined}
      />
      {goals.length === 0 && (
        <Card className="mb-4">
          <EmptyState title={t('goals.emptyTitle')} hint={t('goals.emptyHint')} action={{ href: '/setup?step=goals', label: t('goals.emptyAction') }} />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 empty:hidden">
        {goals.map((g) => {
          const p = goalProgress(g, now);
          const reached = p.remaining === 0;
          return (
            <section key={g.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* The type label is shown only when it adds information beyond the name. */}
                  {t(`goals.kinds.${g.kind}`) !== g.name && (
                    <div className="eyebrow mb-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: g.color }} aria-hidden />
                      {t(`goals.kinds.${g.kind}`)}
                    </div>
                  )}
                  <h2 className="flex items-center gap-2 truncate text-lg font-semibold">
                    {t(`goals.kinds.${g.kind}`) === g.name && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />}
                    {g.name}
                  </h2>
                </div>
                {reached ? (
                  <Badge tone="positive">{t('goals.reached')}</Badge>
                ) : g.targetDate && p.onTrack != null ? (
                  <Badge tone={p.onTrack ? 'positive' : 'caution'}>{p.onTrack ? t('goals.onTrack') : t('goals.offTrack')}</Badge>
                ) : null}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{money(g.current)}</span>
                <span className="muted text-sm tabular-nums">/ {money(g.target)}</span>
                <span className="ml-auto text-sm font-medium tabular-nums">{formatPercent(p.pct, locale, 0)}</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={p.pct} color={g.color} label={g.name} />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="eyebrow">{t('goals.left')}</dt>
                  <dd className="mt-0.5 tabular-nums">{money(p.remaining)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">{t('goals.perMonth')}</dt>
                  <dd className="mt-0.5 tabular-nums">{g.monthly > 0 ? money(g.monthly) : '—'}</dd>
                </div>
                <div>
                  <dt className="eyebrow">{t('goals.etaLabel')}</dt>
                  <dd className="mt-0.5">{reached ? '✓' : p.projectedMonth ? monthLabel(p.projectedMonth, locale, 'short') : '—'}</dd>
                </div>
              </dl>

              {!reached && g.targetDate && p.requiredMonthly != null && !p.onTrack && (
                <p className="muted mt-3 text-xs">{t('goals.requiredMonthly', { amount: money(p.requiredMonthly), month: monthLabel(g.targetDate, locale) })}</p>
              )}
              {!reached && g.monthly <= 0 && <p className="muted mt-3 text-xs">{t('goals.noEta')}</p>}
              {g.account && (
                <p className="muted mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <AccountBadge id={g.account} label={accountName(g.account, t)} size="xs" />
                  {t('goals.fromAccount', { account: accountName(g.account, t) })}
                </p>
              )}

              <details className="mt-auto pt-4">
                <summary className="link inline-flex cursor-pointer select-none">{t('common.edit')}</summary>
                <div className="mt-3">
                  <GoalForm goal={g} t={t} />
                </div>
              </details>
            </section>
          );
        })}
      </div>
      <details className="card mt-4" open={goals.length === 0}>
        <summary className="section-title cursor-pointer select-none">+ {t('goals.new')}</summary>
        <div className="mt-4">
          <GoalForm t={t} />
        </div>
      </details>
    </>
  );
}
