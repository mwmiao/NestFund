import Link from 'next/link';
import { dismissOnboardingAction } from '@/app/actions';
import { Sparkline } from '@/components/charts/Sparkline';
import { AccountsPanel, type AccountRow, type RecentTransfer } from '@/components/dashboard/AccountsPanel';
import { MonthPicker } from '@/components/MonthPicker';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Badge, Card, Dot, EmptyState, ProgressBar } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { computeMonthSummary, goalProgress } from '@/lib/calc';
import { currentMonth, formatDate, formatRelative, isMonth, monthLabel, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { categoryName } from '@/lib/labels';
import {
  ONBOARDING_STEPS,
  accountBalances,
  balanceMap,
  ensureMonthBudget,
  getOnboarding,
  hasSampleData,
  listCategories,
  listGoals,
  listTransactions,
  materializeRecurring,
} from '@/lib/repo';
import { etfSummary } from '@/lib/portfolio';
import { getT212Status, listT212History } from '@/lib/t212';
import type { AccountId } from '@/lib/types';

const ACCOUNT_ROWS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'];
const NET_WORTH_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'cash', 'other'];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string; saved?: string }> }) {
  const { m, saved: justSaved } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);

  materializeRecurring();
  const budget = ensureMonthBudget(month);
  const categories = listCategories();
  const txs = listTransactions({ month });
  const s = computeMonthSummary(budget, txs, categories);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const balances = accountBalances();
  const goals = listGoals(balanceMap(balances));
  const onboarding = getOnboarding();
  const setupLeft = ONBOARDING_STEPS.length - onboarding.done.length;
  const t212 = getT212Status();
  const t212Trend = listT212History(30).map((h) => h.totalValue);

  const netWorth = NET_WORTH_ACCOUNTS.reduce((sum, a) => sum + balances[a].balance, 0);
  const spent = s.manualSpent + s.mealCardSpent;
  const saved = s.etfTransferred + s.savingsTransferred;
  const spendable = Math.max(s.income - s.fixed - s.etf - s.savings, 0);
  const hasIncome = s.income > 0;
  const etf = etfSummary(balances.trading212, t212);

  const accountRows: AccountRow[] = ACCOUNT_ROWS.map((id) => {
    const b = balances[id];
    const row: AccountRow = { id, balance: b.balance, invested: b.invested, balanceText: !b.since && b.balance === 0 ? '' : money(b.balance) };
    if (id === 'trading212') {
      row.apiSynced = t212.connected && etf.source === 'api';
      if (etf.invested > 0) {
        row.extraText = `${formatMoney(etf.gain, locale, { sign: true })} · ${formatPercent(etf.growthPct, locale, 1)}`;
        row.extraTone = etf.gain >= 0 ? 'positive' : 'negative';
      }
    }
    if (id === 'meal_card' && s.mealCard > 0) row.extraText = t('dashboard.leftThisMonth', { amount: money(s.mealCardLeft) });
    return row;
  });
  const recentTransfers: RecentTransfer[] = listTransactions({ type: 'transfer', limit: 4 })
    .filter((x) => x.toAccount)
    .map((x) => ({ id: x.id, from: x.account, to: x.toAccount as AccountId, amountText: money(x.amount), dateText: formatDate(x.date) }));


  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{t('dashboard.title')}</h1>
        <MonthPicker month={month} basePath="/" locale={locale} labels={{ prev: t('common.previous'), next: t('common.next'), today: t('common.today') }} />
      </div>

      <div className="mb-4 space-y-2 empty:hidden">
        {justSaved && <Alert tone="success">{t('common.saved')}</Alert>}
        {hasSampleData() && (
          <Alert tone="warning">
            {t('setup.sampleDetected')}{' '}
            <Link href="/setup#reset" className="font-medium underline">
              {t('setup.resetButton')}
            </Link>
          </Alert>
        )}
        {/* Budget alerts only make sense once there is income to compare against. */}
        {hasIncome && s.negativePlanned && <Alert tone="danger">{t('dashboard.alertPlanned', { amount: money(Math.abs(s.plannedAvailable)) })}</Alert>}
        {hasIncome && s.negativeReal && <Alert tone="warning">{t('dashboard.alertReal', { amount: money(Math.abs(s.realAvailable)) })}</Alert>}
      </div>

      {setupLeft > 0 && !onboarding.dismissed && (
        <section className="card mb-4 flex flex-col gap-3 border-brand-500/30 bg-brand-500/5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="section-title">{t('setup.cardTitle')}</h2>
            <p className="muted mt-0.5 text-sm">{t('setup.cardHint', { n: setupLeft })}</p>
          </div>
          <div className="flex gap-2">
            <form action={dismissOnboardingAction}>
              <button className="btn-ghost">{t('setup.notNow')}</button>
            </form>
            <Link href="/setup" className="btn-primary">
              {onboarding.done.length ? t('setup.resume') : t('setup.start')}
            </Link>
          </div>
        </section>
      )}

      {/* 1 — the four answers: how much I have, spent, saved and can still spend */}
      <section className="card mb-4 grid gap-6 lg:grid-cols-[1.3fr_2fr] lg:items-end">
        <div>
          <div className="eyebrow">{t('dashboard.netWorth')}</div>
          <div className="mt-1 text-[2.25rem] font-semibold leading-tight tracking-tight tabular-nums sm:text-display">{money(netWorth)}</div>
          <div className="muted mt-1 text-xs">{t('dashboard.netWorthHint')}</div>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <dt className="eyebrow">{t('dashboard.spentMonth')}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{money(spent)}</dd>
            {s.mealCardSpent > 0 && <dd className="muted mt-0.5 text-[11px]">{t('dashboard.ofWhichMeal', { amount: money(s.mealCardSpent) })}</dd>}
          </div>
          <div>
            <dt className="eyebrow">{t('dashboard.savedMonth')}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-positive sm:text-xl">{money(saved)}</dd>
            {s.savingsTotal > 0 && <dd className="muted mt-0.5 text-[11px]">{t('dashboard.ofPlanned', { amount: money(s.savingsTotal) })}</dd>}
          </div>
          <div>
            <dt className="eyebrow">{t('dashboard.canSpend')}</dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${hasIncome && s.realAvailable < 0 ? 'text-negative' : ''}`}>{hasIncome ? money(s.realAvailable) : '—'}</dd>
            {!hasIncome && (
              <dd className="mt-0.5 text-[11px]">
                <Link href="/setup?step=income" className="link !text-[11px]">
                  {t('dashboard.setIncome')}
                </Link>
              </dd>
            )}
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 2 — balances per account, with inline balance updates and quick transfers */}
        <AccountsPanel rows={accountRows} recentTransfers={recentTransfers} today={todayISO()} />

        {/* 3 — goals */}
        <Card title={t('dashboard.goals')} className="lg:col-span-2" actions={goals.length > 0 && <Link href="/goals" className="link">{t('dashboard.seeAll')}</Link>}>
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

        {/* 4 — this month's budget */}
        <Card title={t('dashboard.thisMonth')} className="lg:col-span-3" actions={<Link href={`/budget?m=${month}`} className="link">{t('nav.budget')}</Link>}>
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
            <EmptyState compact title={t('dashboard.emptyBudgetTitle')} hint={t('dashboard.emptyBudgetHint')} action={{ href: '/setup?step=income', label: t('dashboard.emptyBudgetAction') }} />
          )}
        </Card>

        {/* 5 — Trading 212 at a glance */}
        <Card
          title={t('dashboard.investments')}
          className="lg:col-span-2"
          actions={
            t212.connected ? (
              <Badge tone={t212.lastError ? 'negative' : t212.stale ? 'caution' : 'positive'}>
                {t212.lastError ? t('t212.status.error') : t212.lastSyncAt ? formatRelative(t212.lastSyncAt, locale) : t('t212.status.connected')}
              </Badge>
            ) : undefined
          }
        >
          {etf.source !== 'none' ? (
            <>
              <div className="eyebrow">Trading 212</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{money(etf.value)}</div>
              <div className={`mt-0.5 text-sm tabular-nums ${etf.gain >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatMoney(etf.gain, locale, { sign: true })}
                {etf.invested > 0 && ` (${formatPercent(etf.growthPct, locale, 2)})`}
              </div>
              <div className="mt-3 text-brand-500">
                <Sparkline values={t212Trend} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                <div>
                  <dt className="eyebrow">{t('t212.investedCapital')}</dt>
                  <dd className="tabular-nums">{money(etf.invested)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">{t('t212.lastSync')}</dt>
                  <dd>{etf.source === 'api' && etf.asOf ? formatRelative(etf.asOf, locale) : t('t212.manual')}</dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState compact title={t('dashboard.noInvestments')} hint={t('dashboard.noInvestmentsHint')} action={{ href: '/settings', label: t('t212.connect') }} />
          )}
        </Card>
      </div>

      {/* 6 — recent activity */}
      <Card
        title={t('dashboard.recent')}
        className="mt-4"
        actions={
          txs.length > 0 && (
            <Link href={`/transactions?month=${month}`} className="link">
              {t('dashboard.seeAll')}
            </Link>
          )
        }
      >
        <TransactionList transactions={txs.slice(0, 6)} categories={categories} locale={locale} compact />
      </Card>
    </>
  );
}
