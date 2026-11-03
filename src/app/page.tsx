import Link from 'next/link';
import { dismissOnboardingAction } from '@/app/actions';
import { AccountCards, type AccountCardData } from '@/components/AccountCards';
import { DonutChart } from '@/components/charts/Charts';
import { Icon } from '@/components/layout/Icon';
import { MonthPicker } from '@/components/MonthPicker';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Card, Dot, EmptyState, ProgressBar } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { computeMonthSummary, goalProgress, monthMovements } from '@/lib/calc';
import { currentMonth, isMonth } from '@/lib/dates';
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
import type { AccountId } from '@/lib/types';

const DASHBOARD_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'];
const NET_WORTH_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'cash', 'other'];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
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

  const netWorth = NET_WORTH_ACCOUNTS.reduce((sum, a) => sum + balances[a].balance, 0);
  const plannedIn = (a: AccountId) =>
    budget.items.filter((i) => i.account === a && (i.kind === 'leisure' || i.kind === 'etf' || i.kind === 'savings')).reduce((sum, i) => sum + i.amount, 0);
  const accounts: AccountCardData[] = DASHBOARD_ACCOUNTS.map((id) => ({
    id,
    balance: balances[id],
    month: monthMovements(id, txs),
    plannedIn: plannedIn(id),
    transferredIn: txs.filter((x) => x.type === 'transfer' && x.toAccount === id).reduce((sum, x) => sum + x.amount, 0),
  }));

  // What salary money is left for day-to-day spending once fixed costs, ETF and savings are set aside.
  const spendable = Math.max(s.income - s.fixed - s.etf - s.savings, 0);
  const hasBudget = s.income > 0;
  const donut = s.byCategory.map((r) => {
    const cat = r.categoryId != null ? catById.get(r.categoryId) : undefined;
    return { name: categoryName(cat, t), value: r.total, color: cat?.color ?? '#71717a' };
  });

  const quickActions = [
    { href: '/transactions/new', label: t('dashboard.actions.expense'), icon: 'M12 5v14M5 12h14', primary: true },
    { href: '/transactions/new?type=transfer', label: t('dashboard.actions.transfer'), icon: 'M7 7h13l-3-3M17 17H4l3 3' },
    { href: '/portfolio#check-in', label: t('dashboard.actions.balance'), icon: 'M4 19h16M6 15V9m4 6V5m4 10v-4m4 4V8' },
    { href: '/budget', label: t('dashboard.actions.budget'), icon: 'M4 6h16M4 12h10M4 18h6' },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <MonthPicker month={month} basePath="/" locale={locale} labels={{ prev: t('common.previous'), next: t('common.next'), today: t('common.today') }} />
      </div>

      <div className="mb-4 space-y-2 empty:hidden">
        {hasSampleData() && (
          <Alert tone="warning">
            {t('setup.sampleDetected')}{' '}
            <Link href="/setup#reset" className="font-medium underline">
              {t('setup.resetButton')}
            </Link>
          </Alert>
        )}
        {/* Budget alerts only make sense once there is income to compare against. */}
        {s.income > 0 && s.negativePlanned && <Alert tone="danger">{t('dashboard.alertPlanned', { amount: money(Math.abs(s.plannedAvailable)) })}</Alert>}
        {s.income > 0 && s.negativeReal && <Alert tone="warning">{t('dashboard.alertReal', { amount: money(Math.abs(s.realAvailable)) })}</Alert>}
      </div>

      {setupLeft > 0 && !onboarding.dismissed && (
        <section className="card mb-4 flex flex-col gap-3 border-brand-500/40 bg-gradient-to-br from-brand-500/10 to-transparent sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="font-semibold">{t('setup.cardTitle')}</h2>
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

      {/* Main balance + quick actions */}
      <section className="card mb-4 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="muted text-sm">{t('dashboard.netWorth')}</div>
          <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{money(netWorth)}</div>
          <div className="muted mt-1 text-xs">{t('dashboard.netWorthHint')}</div>
        </div>
        <nav aria-label={t('dashboard.quickActions')} className="grid grid-cols-4 gap-2 md:flex">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs font-medium transition md:min-w-[5.5rem] ${
                a.primary ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon d={a.icon} />
              {a.label}
            </Link>
          ))}
        </nav>
      </section>

      <AccountCards accounts={accounts} month={month} locale={locale} t={t} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={t('dashboard.thisMonth')}
          className="lg:col-span-2"
          actions={
            <Link href={`/budget?m=${month}`} className="text-xs text-brand-500 hover:underline">
              {t('nav.budget')}
            </Link>
          }
        >
          {hasBudget ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="muted text-sm">{t('dashboard.canSpend')}</div>
                  <div className={`text-3xl font-semibold tabular-nums ${s.realAvailable < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{money(s.realAvailable)}</div>
                </div>
                <div className="muted text-right text-xs">
                  {t('dashboard.spentOf', { spent: money(s.variableSpent), total: money(spendable) })}
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={spendable > 0 ? s.variableSpent / spendable : 0} over={s.variableSpent > spendable} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  [s.salaryReceived != null ? t('dashboard.salaryReceived') : t('dashboard.income'), s.income],
                  [t('dashboard.fixedExpenses'), s.fixed],
                  [t('dashboard.totalSavings'), s.savingsTotal],
                  [t('dashboard.savingsRate'), null],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="muted text-xs">{label}</dt>
                    <dd className="font-medium tabular-nums">{value == null ? formatPercent(s.savingsRate, locale) : money(value as number)}</dd>
                  </div>
                ))}
              </dl>
              {(s.mealCard > 0 || s.leisure > 0) && (
                <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:grid-cols-2">
                  {s.leisure > 0 && (
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{t('dashboard.leisureRevolut')}</span>
                        <span className="tabular-nums">
                          {money(s.leisureSpent)} / {money(s.leisure)}
                        </span>
                      </div>
                      <ProgressBar value={s.leisureSpent / s.leisure} color="#3b82f6" over={s.leisureSpent > s.leisure} />
                    </div>
                  )}
                  {s.mealCard > 0 && (
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{t('dashboard.mealCard')}</span>
                        <span className="tabular-nums">
                          {money(s.mealCardSpent)} / {money(s.mealCard)}
                        </span>
                      </div>
                      <ProgressBar value={s.mealCardSpent / s.mealCard} color="#f59e0b" over={s.mealCardSpent > s.mealCard} />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmptyState title={t('dashboard.emptyBudgetTitle')} hint={t('dashboard.emptyBudgetHint')} action={{ href: '/setup?step=income', label: t('dashboard.emptyBudgetAction') }} />
          )}
        </Card>

        <Card
          title={t('dashboard.goals')}
          actions={
            goals.length > 0 && (
              <Link href="/goals" className="text-xs text-brand-500 hover:underline">
                {t('dashboard.seeAll')}
              </Link>
            )
          }
        >
          {goals.length ? (
            <ul className="space-y-4">
              {goals.map((g) => {
                const p = goalProgress(g, currentMonth());
                return (
                  <li key={g.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{g.name}</span>
                      <span className="muted tabular-nums">{formatPercent(p.pct, locale, 0)}</span>
                    </div>
                    <ProgressBar value={p.pct} color={g.color} />
                    <div className="muted mt-1 text-xs tabular-nums">
                      {money(g.current)} / {money(g.target)}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t('goals.emptyTitle')} hint={t('goals.emptyHint')} action={{ href: '/setup?step=goals', label: t('goals.emptyAction') }} />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={t('dashboard.recent')}
          className={donut.length ? 'lg:col-span-2' : 'lg:col-span-3'}
          actions={
            txs.length > 0 && (
              <Link href={`/transactions?month=${month}`} className="text-xs text-brand-500 hover:underline">
                {t('dashboard.seeAll')}
              </Link>
            )
          }
        >
          {txs.length ? (
            <TransactionList transactions={txs.slice(0, 6)} categories={categories} locale={locale} compact />
          ) : (
            <EmptyState title={t('tx.emptyTitle')} hint={t('tx.emptyHint')} action={{ href: '/transactions/new', label: t('common.quickAdd') }} />
          )}
        </Card>

        {donut.length > 0 && (
          <Card title={t('dashboard.byCategory')}>
            <DonutChart data={donut} height={180} />
            <ul className="mt-3 space-y-1.5 text-sm">
              {s.byCategory.slice(0, 5).map((r) => {
                const cat = r.categoryId != null ? catById.get(r.categoryId) : undefined;
                return (
                  <li key={String(r.categoryId)} className="flex items-center gap-2">
                    <Dot color={cat?.color ?? '#71717a'} />
                    <span className="flex-1 truncate">{categoryName(cat, t)}</span>
                    <span className="tabular-nums">{money(r.total)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
