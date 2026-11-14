import Link from 'next/link';
import { AccountsPanel, type AccountRow, type RecentTransfer } from '@/components/dashboard/AccountsPanel';
import { GoalsCard } from '@/components/dashboard/GoalsCard';
import { InvestmentsCard } from '@/components/dashboard/InvestmentsCard';
import { MonthBudgetCard } from '@/components/dashboard/MonthBudgetCard';
import { SetupPanel } from '@/components/dashboard/SetupPanel';
import { IncomeCard } from '@/components/income/IncomeCard';
import { MonthPicker } from '@/components/MonthPicker';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Card, Hint } from '@/components/ui';
import { getI18n, pageTitle } from '@/i18n/server';
import { computeMonthSummary } from '@/lib/calc';
import { currentMonth, formatDate, isMonth, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import {
  ONBOARDING_STEPS,
  accountBalances,
  balanceMap,
  ensureMonthBudget,
  getMonthIncome,
  getOnboarding,
  getProfile,
  listMonthIncomes,
  hasSampleData,
  listCategories,
  listGoals,
  listTransactions,
  materializeRecurring,
  visibleAccounts,
} from '@/lib/repo';
import { etfSummary } from '@/lib/portfolio';
import { getT212Status, listT212History } from '@/lib/t212';
import type { AccountId } from '@/lib/types';

const ACCOUNT_ROWS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'];
const NET_WORTH_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'trading212', 'traderepublic', 'cash', 'other'];

export const generateMetadata = pageTitle('dashboard.title');
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string; saved?: string }> }) {
  const { m, saved: justSaved } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);

  materializeRecurring();
  const budget = ensureMonthBudget(month);
  const monthIncome = getMonthIncome(month);
  const incomes = new Map(listMonthIncomes().map((i) => [i.month, i]));
  const profile = getProfile();
  const categories = listCategories();
  const txs = listTransactions({ month });
  const s = computeMonthSummary(budget, txs, categories);
  const balances = accountBalances();
  const goals = listGoals(balanceMap(balances));
  const onboarding = getOnboarding();
  // While setup is unfinished the page shows one "start here" panel instead of a wall of empty cards.
  const setupMode = onboarding.done.length < ONBOARDING_STEPS.length && !onboarding.dismissed;
  const visible = visibleAccounts();
  const t212 = getT212Status();
  const t212Trend = listT212History(30).map((h) => h.totalValue);

  const netWorth = NET_WORTH_ACCOUNTS.reduce((sum, a) => sum + balances[a].balance, 0);
  const spent = s.manualSpent + s.mealCardSpent;
  const saved = s.etfTransferred + s.savingsTransferred;
  // No salary is ever assumed: until the month's income is entered by hand, the budget shows "not defined".
  const hasIncome = monthIncome != null || s.income > 0;
  const etf = etfSummary(balances.trading212, t212);
  // In setup mode a card is shown only once it has something to show.
  const show = {
    incomeCard: !setupMode || monthIncome != null,
    goals: !setupMode || goals.length > 0,
    budget: !setupMode || hasIncome,
    investments: !setupMode || etf.source !== 'none',
  };

  const accountRows: AccountRow[] = ACCOUNT_ROWS.filter((id) => visible.includes(id)).map((id) => {
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

      {setupMode && <SetupPanel onboarding={onboarding} t={t} />}

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
            <dt className="eyebrow">
              {t('dashboard.canSpend')}
              <Hint text={t('dashboard.canSpendHint')} />
            </dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${hasIncome && s.realAvailable < 0 ? 'text-negative' : ''}`}>{hasIncome ? money(s.realAvailable) : '—'}</dd>
            {!hasIncome && !setupMode && (
              <dd className="mt-0.5 text-[11px]">
                <Link href={`/budget?m=${month}#income`} className="link !text-[11px]">
                  {t('dashboard.setIncome')}
                </Link>
              </dd>
            )}
          </div>
        </dl>
      </section>

      {show.incomeCard && <IncomeCard month={month} budget={budget} income={monthIncome} incomes={incomes} profile={profile} salaryTotal={s.salary} t={t} locale={locale} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 2 — balances per account, with inline balance updates and quick transfers */}
        <AccountsPanel rows={accountRows} recentTransfers={recentTransfers} today={todayISO()} wide={setupMode} />
        {/* 3 — goals, 4 — this month's budget, 5 — Trading 212 at a glance */}
        {show.goals && <GoalsCard goals={goals} t={t} locale={locale} />}
        {show.budget && <MonthBudgetCard month={month} summary={s} hasIncome={hasIncome} categories={categories} t={t} locale={locale} />}
        {show.investments && <InvestmentsCard etf={etf} t212={t212} trend={t212Trend} t={t} locale={locale} />}
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
