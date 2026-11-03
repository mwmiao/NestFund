import Link from 'next/link';
import { AccountCards, type AccountCardData } from '@/components/AccountCards';
import { BarsChart, DonutChart } from '@/components/charts/Charts';
import { MonthPicker } from '@/components/MonthPicker';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Card, Dot, Empty, PageHeader, ProgressBar, Stat } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { computeMonthSummary, goalProgress, monthMovements } from '@/lib/calc';
import { currentMonth, isMonth } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { categoryName } from '@/lib/labels';
import { accountBalances, balanceMap, ensureMonthBudget, listCategories, listGoals, listTransactions, materializeRecurring } from '@/lib/repo';
import type { AccountId } from '@/lib/types';

const DASHBOARD_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'];

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
  const house = goals.find((g) => g.kind === 'house');

  const plannedIn = (a: AccountId) =>
    budget.items.filter((i) => i.account === a && (i.kind === 'leisure' || i.kind === 'etf' || i.kind === 'savings')).reduce((sum, i) => sum + i.amount, 0);
  const accounts: AccountCardData[] = DASHBOARD_ACCOUNTS.map((id) => ({
    id,
    balance: balances[id],
    month: monthMovements(id, txs),
    plannedIn: plannedIn(id),
    transferredIn: txs.filter((x) => x.type === 'transfer' && x.toAccount === id).reduce((sum, x) => sum + x.amount, 0),
    progress:
      id === 'revolut'
        ? { spent: s.leisureSpent, budget: s.leisure, label: t('accounts.leisureLeft', { spent: money(s.leisureSpent), budget: money(s.leisure) }) }
        : id === 'meal_card'
          ? { spent: s.mealCardSpent, budget: s.mealCard, label: t('dashboard.mealCardSpent', { spent: money(s.mealCardSpent), left: money(s.mealCardLeft) }) }
          : undefined,
  }));

  const donut = s.byCategory.map((r) => {
    const cat = r.categoryId != null ? catById.get(r.categoryId) : undefined;
    return { name: categoryName(cat, t), value: r.total, color: cat?.color ?? '#71717a' };
  });
  const spentByCat = new Map(s.byCategory.map((r) => [r.categoryId, r.total]));
  const budgetBars = categories
    .filter((c) => c.monthlyBudget != null && c.monthlyBudget > 0)
    .map((c) => ({ name: categoryName(c, t), budget: c.monthlyBudget ?? 0, actual: spentByCat.get(c.id) ?? 0 }));
  const etf = balances.trading212;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        actions={<MonthPicker month={month} basePath="/" locale={locale} labels={{ prev: t('common.previous'), next: t('common.next'), today: t('common.today') }} />}
      />

      <div className="mb-4 space-y-2 empty:hidden">
        {s.negativePlanned && <Alert tone="danger">{t('dashboard.alertPlanned', { amount: money(Math.abs(s.plannedAvailable)) })}</Alert>}
        {s.negativeReal && <Alert tone="warning">{t('dashboard.alertReal', { amount: money(Math.abs(s.realAvailable)) })}</Alert>}
      </div>

      {/* The four answers the user looks for first. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('dashboard.canSpend')} value={money(s.realAvailable)} hint={t('dashboard.canSpendHint')} tone={s.realAvailable < 0 ? 'negative' : 'positive'} />
        <Stat
          label={t('dashboard.totalSavings')}
          value={money(s.savingsTotal)}
          hint={`${formatPercent(s.savingsRate, locale)} · ${t('dashboard.transferred', { amount: money(s.etfTransferred + s.savingsTransferred) })}`}
          tone="positive"
        />
        <Stat
          label={t('dashboard.houseFund')}
          value={money(house?.current ?? 0)}
          hint={
            house
              ? t('dashboard.houseFundHint', { pct: formatPercent(goalProgress(house, currentMonth()).pct, locale, 0), target: money(house.target) })
              : undefined
          }
        />
        <Stat
          label={t('dashboard.etfValue')}
          value={money(etf.balance)}
          hint={formatMoney(etf.balance - etf.invested, locale, { sign: true })}
          tone={etf.balance >= etf.invested ? 'default' : 'negative'}
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('accounts.title')}</h2>
      <AccountCards accounts={accounts} month={month} locale={locale} t={t} />

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('budget.summary')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={s.salaryReceived != null ? t('dashboard.salaryReceived') : t('dashboard.salaryPlanned')}
          value={money(s.income)}
          hint={t('dashboard.netIncomeHint')}
        />
        <Stat label={t('dashboard.mealCard')} value={money(s.mealCard)} hint={t('dashboard.mealCardHint')} tone="muted" />
        <Stat label={t('dashboard.fixedExpenses')} value={money(s.fixed)} />
        <Stat label={t('dashboard.manualExpenses')} value={money(s.manualSpent)} hint={t('dashboard.manualExpensesHint')} />
        <Stat
          label={t('dashboard.availableToAssign')}
          value={money(s.plannedAvailable)}
          hint={t('dashboard.availableToAssignHint')}
          tone={s.plannedAvailable < 0 ? 'negative' : 'default'}
        />
        <Stat label={t('dashboard.savingsRate')} value={formatPercent(s.savingsRate, locale)} tone="positive" />
        <Stat label={t('dashboard.netWorth')} value={money(balances.ctt.balance + balances.revolut.balance + etf.balance + balances.traderepublic.balance)} hint={t('dashboard.netWorthHint')} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('dashboard.byCategory')}>
          {donut.length ? (
            <>
              <DonutChart data={donut} />
              <p className="muted mb-1 mt-2 text-xs">{t('dashboard.topCategories')}</p>
              <ul className="space-y-1.5 text-sm">
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
            </>
          ) : (
            <Empty>{t('common.noData')}</Empty>
          )}
        </Card>

        <Card title={t('dashboard.budgetVsActual')} className="lg:col-span-2">
          {budgetBars.length ? (
            <BarsChart
              data={budgetBars}
              xKey="name"
              series={[
                { key: 'budget', name: t('dashboard.budget'), color: '#71717a' },
                { key: 'actual', name: t('dashboard.spent'), color: '#10b981' },
              ]}
            />
          ) : (
            <Empty>{t('common.noData')}</Empty>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={t('dashboard.recent')}
          className="lg:col-span-2"
          actions={
            <Link href={`/transactions?month=${month}`} className="text-xs text-brand-500 hover:underline">
              {t('dashboard.seeAll')}
            </Link>
          }
        >
          <TransactionList transactions={txs.slice(0, 6)} categories={categories} locale={locale} compact />
        </Card>

        <Card
          title={t('dashboard.goals')}
          actions={
            <Link href="/goals" className="text-xs text-brand-500 hover:underline">
              {t('dashboard.seeAll')}
            </Link>
          }
        >
          <ul className="space-y-3">
            {goals.map((g) => {
              const p = goalProgress(g, currentMonth());
              return (
                <li key={g.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{g.name}</span>
                    <span className="muted tabular-nums">
                      {money(g.current)} · {formatPercent(p.pct, locale, 0)}
                    </span>
                  </div>
                  <ProgressBar value={p.pct} color={g.color} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
