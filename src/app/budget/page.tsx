import { deleteBudgetItemAction, saveBudgetItemAction, saveProfileAction } from '@/app/actions';
import { IncomeForm } from '@/components/income/IncomeForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { MonthPicker } from '@/components/MonthPicker';
import Link from 'next/link';
import { Alert, Card, Dot, Empty, EmptyState, Field, PageHeader, ProgressBar, budgetTone, toneText } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/config';
import { computeMonthSummary } from '@/lib/calc';
import { incomeDifference, payNote } from '@/lib/income-view';
import { expectedPayDate } from '@/lib/payday';
import { currentMonth, formatDate, isActiveInMonth, isMonth, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent, toInputDecimal } from '@/lib/format';
import { AccountBadge } from '@/components/AccountBadge';
import { accountName, categoryName } from '@/lib/labels';
import { ensureMonthBudget, getMonthIncome, getProfile, lastDailyRates, listBudgetItems, listCategories, listTransactions } from '@/lib/repo';
import { ACCOUNT_IDS, BUDGET_ITEM_KINDS, type BudgetItem, type Category } from '@/lib/types';

function ItemForm({ item, categories, t }: { item?: BudgetItem; categories: Category[]; t: TFunction }) {
  return (
    <form action={saveBudgetItemAction} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label={t('common.name')} className="col-span-2">
        <input name="name" required defaultValue={item?.name ?? ''} className="input" />
      </Field>
      <Field label={t('common.kind')}>
        <select name="kind" defaultValue={item?.kind ?? 'fixed'} className="input">
          {BUDGET_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`budget.kinds.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${t('common.amount')} (€)`}>
        <input name="amount" required inputMode="decimal" defaultValue={item ? toInputDecimal(item.amount) : ''} className="input tabular-nums" />
      </Field>
      <Field label={t('budget.category')}>
        <select name="categoryId" defaultValue={item?.categoryId ?? ''} className="input">
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('budget.account')}>
        <select name="account" defaultValue={item?.account ?? ''} className="input">
          <option value="">—</option>
          {ACCOUNT_IDS.map((a) => (
            <option key={a} value={a}>
              {accountName(a, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('budget.startMonth')}>
        <input type="month" name="startMonth" defaultValue={item?.startMonth ?? ''} className="input" />
      </Field>
      <Field label={t('budget.endMonth')}>
        <input type="month" name="endMonth" defaultValue={item?.endMonth ?? ''} className="input" />
      </Field>
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className={item ? 'btn-secondary' : 'btn-primary'}>{item ? t('common.save') : t('common.add')}</button>
        {item && <ConfirmButton formAction={deleteBudgetItemAction}>{t('common.delete')}</ConfirmButton>}
      </div>
    </form>
  );
}

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);

  const budget = ensureMonthBudget(month);
  const categories = listCategories();
  const txs = listTransactions({ month });
  const s = computeMonthSummary(budget, txs, categories);
  const profile = getProfile();
  const isPast = month < currentMonth();
  const template = listBudgetItems();

  const monthIncome = getMonthIncome(month);
  // No salary is assumed: the budget is "not defined" until the income of this month is entered.
  const hasIncome = monthIncome != null || s.income > 0;
  const salaryPay = expectedPayDate(month, profile.salaryPayDay);
  const mealPay = expectedPayDate(month, profile.mealPayDay);
  const diff = incomeDifference(monthIncome, budget.income, budget.mealCard);
  const rates = lastDailyRates(month);
  const payText = (label: string, pd: ReturnType<typeof expectedPayDate>) => {
    const note = payNote(pd, t);
    return `${label}: ${formatDate(pd.date)}${note ? ` — ${note}` : ''}`;
  };

  const spentByCat = new Map(s.byCategory.map((r) => [r.categoryId, r.total]));
  const planned = budget.items.reduce((sum, i) => sum + i.amount, 0);
  // Same "what's left to spend" as the dashboard: income minus fixed costs, ETF and savings.
  const spendable = Math.max(s.income - s.fixed - s.etf - s.savings, 0);
  const planRows = categories
    .filter((c) => c.kind === 'expense' && ((c.monthlyBudget ?? 0) > 0 || spentByCat.has(c.id)))
    .map((c) => ({ c, limit: c.monthlyBudget ?? 0, spent: spentByCat.get(c.id) ?? 0 }))
    .sort((a, b) => Number(b.limit > 0) - Number(a.limit > 0) || b.spent / (b.limit || 1) - a.spent / (a.limit || 1));
  const breakdown: [string, number][] = [
    [t('budget.kinds.fixed'), s.fixed],
    [t('budget.kinds.etf'), s.etf],
    [t('budget.kinds.savings'), s.savings],
    [t('budget.kinds.leisure'), s.leisure],
    [t('budget.kinds.variable'), s.variablePlanned],
  ];

  return (
    <>
      <PageHeader
        title={t('budget.title')}
        actions={<MonthPicker month={month} basePath="/budget" locale={locale} labels={{ prev: t('common.previous'), next: t('common.next'), today: t('common.today') }} />}
      />

      {hasIncome && s.negativePlanned && (
        <div className="mb-4">
          <Alert tone="danger">{t('dashboard.alertPlanned', { amount: money(Math.abs(s.plannedAvailable)) })}</Alert>
        </div>
      )}

      {/* 1 — the month at a glance */}
      <section className="card mb-4">
        {hasIncome ? (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="eyebrow">{s.salaryReceived != null ? t('dashboard.salaryReceived') : t('dashboard.income')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{money(s.income)}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('budget.planned')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{money(planned)}</dd>
              </div>
              <div>
                <dt className="eyebrow">{t('dashboard.availableToAssign')}</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${s.plannedAvailable < 0 ? 'text-negative' : 'text-positive'}`}>{money(s.plannedAvailable)}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="muted">{t('budget.spentVsAvailable')}</span>
                <span className="tabular-nums">
                  {money(s.variableSpent)} <span className="muted">/ {money(spendable)}</span>
                </span>
              </div>
              <ProgressBar value={spendable > 0 ? s.variableSpent / spendable : 0} tone="auto" label={t('budget.spentVsAvailable')} />
            </div>
            <details className="mt-4 border-t border-line pt-3">
              <summary className="link inline-flex cursor-pointer select-none">{t('budget.breakdown')}</summary>
              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                {breakdown
                  .filter(([, v]) => v > 0)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="muted">{label}</dt>
                      <dd className="tabular-nums">{money(value)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between">
                  <dt className="muted">{t('dashboard.savingsRate')}</dt>
                  <dd className="tabular-nums">{formatPercent(s.savingsRate, locale)}</dd>
                </div>
              </dl>
            </details>
          </>
        ) : (
          <EmptyState compact title={t('income.notDefined')} hint={t('income.notDefinedHint')} action={{ href: '#income', label: t('income.define') }} />
        )}
      </section>

      {/* 2 — planned vs spent, per category */}
      <Card
        title={t('budget.byCategory')}
        subtitle={t('budget.byCategoryHint')}
        className="mb-4"
        actions={
          <Link href="/transactions/categories" className="link">
            {t('budget.setLimits')}
          </Link>
        }
      >
        {planRows.length === 0 ? (
          <Empty>{t('budget.noCategoryData')}</Empty>
        ) : (
          <ul className="space-y-4">
            {planRows.map(({ c, limit, spent }) => {
              const ratio = limit > 0 ? spent / limit : 0;
              const tone = budgetTone(ratio);
              return (
                <li key={c.id}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <Dot color={c.color} />
                    <span className="flex-1 truncate font-medium">{categoryName(c, t)}</span>
                    <span className="tabular-nums">
                      {money(spent)}
                      {limit > 0 && <span className="muted"> / {money(limit)}</span>}
                    </span>
                  </div>
                  {limit > 0 ? (
                    <>
                      <ProgressBar size="sm" value={ratio} tone="auto" label={categoryName(c, t)} />
                      <div className={`mt-1 text-xs ${tone === 'positive' ? 'text-subtle' : toneText[tone]}`}>
                        {spent > limit ? t('budget.over', { amount: money(spent - limit) }) : t('budget.left', { amount: money(limit - spent) })}
                      </div>
                    </>
                  ) : (
                    <div className="muted text-xs">{t('budget.noLimit')}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 3 — budget lines */}
      <Card title={t('budget.template')} subtitle={isPast ? t('budget.pastMonthHint') : t('budget.templateHint')} className="mb-4">
        {isPast ? (
          <ul className="divide-y divide-line/70 text-sm">
            {budget.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{i.name}</span>
                  <span className="muted text-xs">{t(`budget.kinds.${i.kind}`)}</span>
                  {i.account && <AccountBadge id={i.account} label={accountName(i.account, t)} size="xs" />}
                </span>
                <span className="tabular-nums">{money(i.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="divide-y divide-line/70">
              {template.map((item) => {
                const active = isActiveInMonth(item, month);
                return (
                  <li key={item.id} className={active ? '' : 'opacity-60'}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{item.name}</span>
                          <span className="muted mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                            {t(`budget.kinds.${item.kind}`)}
                            {item.account && <AccountBadge id={item.account} label={accountName(item.account, t)} size="xs" />}
                            {!active && item.startMonth && item.startMonth > month && (
                              <span className="text-caution">{t('budget.startsIn', { month: monthLabel(item.startMonth, locale) })}</span>
                            )}
                            {!active && item.endMonth && item.endMonth < month && <span>{t('budget.endsIn', { month: monthLabel(item.endMonth, locale) })}</span>}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{money(item.amount)}</span>
                        <span className="muted text-xs transition group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                      </summary>
                      <div className="pb-4">
                        <ItemForm item={item} categories={categories} t={t} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            {template.length === 0 && <Empty>{t('budget.emptyItems')}</Empty>}
            <details className="mt-3 rounded-control border border-dashed border-line px-3 py-2" open={template.length === 0}>
              <summary className="link inline-flex cursor-pointer select-none py-1">+ {t('budget.addItem')}</summary>
              <div className="pb-1 pt-3">
                <ItemForm categories={categories} t={t} />
              </div>
            </details>
          </>
        )}
        <p className="muted mt-4 text-xs">{t('budget.fixedNote')}</p>
      </Card>

      {/* 4 — the month's income, entered by hand every month */}
      <section className="card mb-4 scroll-mt-4" id="income">
        <h2 className="section-title">{t('income.title')}</h2>
        <p className="muted mb-4 mt-1 text-xs">{t('income.formHint')}</p>
        {diff.total != null && (
          <p className="mb-3 text-sm">
            <span className="muted">{t('income.difference')}: </span>
            <span className={`font-medium tabular-nums ${diff.total < 0 ? 'text-negative' : 'text-positive'}`}>{formatMoney(diff.total, locale, { sign: true })}</span>
            <span className="muted text-xs">
              {' '}
              ({t('income.expectedWas', { salary: monthIncome?.expectedSalary != null ? money(monthIncome.expectedSalary) : '—', meal: monthIncome?.expectedMeal != null ? money(monthIncome.expectedMeal) : '—' })})
            </span>
          </p>
        )}
        <IncomeForm
          key={`${month}-${budget.income}-${budget.mealCard}-${monthIncome?.salaryConfirmed}-${monthIncome?.mealConfirmed}`}
          init={{
            month,
            salary: budget.income,
            meal: budget.mealCard,
            extraIncome: budget.extraIncome,
            notes: budget.notes ?? '',
            normalDays: monthIncome?.normalDays ?? 0,
            holidayDays: monthIncome?.holidayDays ?? 0,
            salaryPerDay: monthIncome?.salaryPerDay ?? rates.salaryPerDay,
            mealPerDay: monthIncome?.mealPerDay ?? rates.mealPerDay,
            salaryConfirmed: monthIncome?.salaryConfirmed ?? false,
            mealConfirmed: monthIncome?.mealConfirmed ?? false,
            salaryPaidDate: monthIncome?.salaryPaidDate ?? '',
            mealPaidDate: monthIncome?.mealPaidDate ?? '',
            defined: monthIncome != null,
            ratesFromPast: monthIncome == null && (rates.salaryPerDay != null || rates.mealPerDay != null),
          }}
          expectedSalaryText={payText(t('income.expectedDate'), salaryPay)}
          expectedMealText={payText(t('income.expectedDate'), mealPay)}
        />
      </section>

      <details className="card">
        <summary className="section-title cursor-pointer select-none">{t('budget.profile')}</summary>
        <p className="muted mt-2 text-xs">{t('budget.profileHint')}</p>
        <form action={saveProfileAction} className="mt-4 grid grid-cols-2 items-end gap-3 md:grid-cols-3">
          {(
            [
              ['salaryPayDay', t('income.salaryPayDay'), profile.salaryPayDay],
              ['mealPayDay', t('income.mealPayDay'), profile.mealPayDay],
            ] as const
          ).map(([name, label, value]) => (
            <Field key={name} label={label}>
              <input name={name} type="number" min={1} max={31} defaultValue={value} className="input tabular-nums" />
            </Field>
          ))}
          {(
            [
              ['transportAllowance', t('budget.transportAllowance'), profile.transportAllowance],
              ['annualBonus', t('budget.annualBonus'), profile.annualBonus],
            ] as const
          ).map(([name, label, value]) => (
            <Field key={name} label={`${label} (€)`}>
              <input name={name} inputMode="decimal" defaultValue={toInputDecimal(value)} className="input tabular-nums" />
            </Field>
          ))}
          <div className="col-span-2 md:col-span-3">
            <button className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </details>
    </>
  );
}
