import { deleteBudgetItemAction, saveBudgetItemAction, saveMonthBudgetAction, saveProfileAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { MonthPicker } from '@/components/MonthPicker';
import { Alert, Card, Dot, Empty, Field, PageHeader, ProgressBar } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/config';
import { availableForIncome, computeMonthSummary } from '@/lib/calc';
import { currentMonth, isActiveInMonth, isMonth, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent, toInputDecimal } from '@/lib/format';
import { AccountBadge } from '@/components/AccountBadge';
import { accountName, categoryName } from '@/lib/labels';
import { ensureMonthBudget, getProfile, listBudgetItems, listCategories, listTransactions } from '@/lib/repo';
import { ACCOUNT_IDS, BUDGET_ITEM_KINDS, type BudgetItem, type Category } from '@/lib/types';


function ItemForm({ item, categories, t }: { item?: BudgetItem; categories: Category[]; t: TFunction }) {
  return (
    <form action={saveBudgetItemAction} className="grid grid-cols-2 items-end gap-2 lg:grid-cols-[1.4fr_1fr_6.5rem_1fr_1fr_8.5rem_8.5rem_auto_auto]">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label={t('common.name')} className="col-span-2 lg:col-span-1">
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
      <button className={item ? 'btn-secondary' : 'btn-primary'}>{item ? t('common.save') : t('common.add')}</button>
      {item ? <ConfirmButton formAction={deleteBudgetItemAction}>{t('common.delete')}</ConfirmButton> : <span />}
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
  const catById = new Map(categories.map((c) => [c.id, c]));

  const scenarioMin = availableForIncome(profile.incomeMin + budget.extraIncome, budget.items);
  const scenarioMax = availableForIncome(profile.incomeMax + budget.extraIncome, budget.items);

  const summaryRows: [string, number][] = [
    [s.salaryReceived != null ? t('dashboard.salaryReceived') : t('dashboard.salaryPlanned'), s.salary],
    [t('budget.extraIncome'), s.extraIncome + s.otherIncome],
    [t('budget.kinds.fixed'), -s.fixed],
    [t('budget.kinds.variable'), -s.variablePlanned],
    [t('budget.kinds.leisure'), -s.leisure],
    [t('budget.kinds.etf'), -s.etf],
    [t('budget.kinds.savings'), -s.savings],
  ];

  const spentByCat = new Map(s.byCategory.map((r) => [r.categoryId, r.total]));
  const envelope = s.leisure + s.variablePlanned;
  const planRows = categories.filter((c) => (c.monthlyBudget ?? 0) > 0 || spentByCat.has(c.id));

  return (
    <>
      <PageHeader
        title={t('budget.title')}
        actions={<MonthPicker month={month} basePath="/budget" locale={locale} labels={{ prev: t('common.previous'), next: t('common.next'), today: t('common.today') }} />}
      />

      {s.income > 0 && s.negativePlanned && (
        <div className="mb-4">
          <Alert tone="danger">{t('dashboard.alertPlanned', { amount: money(Math.abs(s.plannedAvailable)) })}</Alert>
        </div>
      )}

      <div className={`grid gap-4 ${profile.incomeMax > profile.incomeMin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <Card title={t('budget.monthSettings')}>
          <form action={saveMonthBudgetAction} className="space-y-3">
            <input type="hidden" name="month" value={month} />
            <Field label={`${t('budget.salary')} (€)`}>
              <input name="income" inputMode="decimal" defaultValue={toInputDecimal(budget.income)} className="input tabular-nums" />
            </Field>
            <Field label={`${t('budget.extraIncome')} (€)`}>
              <input name="extraIncome" inputMode="decimal" defaultValue={toInputDecimal(budget.extraIncome)} className="input tabular-nums" />
            </Field>
            <Field label={`${t('budget.mealCard')} (€)`}>
              <input name="mealCard" inputMode="decimal" defaultValue={toInputDecimal(budget.mealCard)} className="input tabular-nums" />
            </Field>
            <Field label={t('common.notes')}>
              <textarea name="notes" rows={2} defaultValue={budget.notes ?? ''} className="input" />
            </Field>
            <button className="btn-primary w-full">{t('common.save')}</button>
          </form>
        </Card>

        <Card title={t('budget.summary')}>
          <table className="w-full text-sm">
            <tbody>
              {summaryRows.map(([label, value]) => (
                <tr key={label} className="table-row">
                  <td className="py-1.5">{label}</td>
                  <td className={`py-1.5 text-right tabular-nums ${value < 0 ? 'muted' : ''}`}>{money(value)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 font-semibold">{t('dashboard.availableToAssign')}</td>
                <td className={`pt-3 text-right font-semibold tabular-nums ${s.plannedAvailable < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {money(s.plannedAvailable)}
                </td>
              </tr>
              <tr>
                <td className="muted pt-1 text-xs">{t('dashboard.savingsRate')}</td>
                <td className="muted pt-1 text-right text-xs tabular-nums">{formatPercent(s.savingsRate, locale)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted mt-3 text-xs">
            {t('dashboard.mealCard')}: {money(budget.mealCard)} — {t('dashboard.mealCardHint')}
          </p>
        </Card>

        {profile.incomeMax > profile.incomeMin && (
        <Card title={t('budget.scenarios')}>
          <p className="muted mb-3 text-xs">{t('budget.scenariosHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              [profile.incomeMin, scenarioMin],
              [profile.incomeMax, scenarioMax],
            ].map(([income, avail]) => (
              <div key={income} className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/60">
                <div className="muted text-xs">{money(income)}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${avail < 0 ? 'text-red-500' : ''}`}>{money(avail)}</div>
                <div className="muted text-xs">{t('dashboard.availableToAssign')}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span>{t('budget.difference')}</span>
            <span className="font-semibold tabular-nums text-emerald-500">{money(scenarioMax - scenarioMin)}</span>
          </div>
        </Card>
        )}
      </div>

      <Card title={t('budget.template')} className="mt-4">
        {isPast ? (
          <>
            <p className="muted mb-3 text-xs">{t('budget.pastMonthHint')}</p>
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {budget.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {i.name} <span className="muted text-xs">· {t(`budget.kinds.${i.kind}`)}</span>
                    {i.account && <AccountBadge id={i.account} label={accountName(i.account, t)} size="xs" />}
                  </span>
                  <span className="tabular-nums">{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="muted mb-3 text-xs">{t('budget.templateHint')}</p>
            {/* Compact rows; the full editor opens per line so the page stays readable. */}
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                              <span className="text-amber-500">{t('budget.startsIn', { month: monthLabel(item.startMonth, locale) })}</span>
                            )}
                            {!active && item.endMonth && item.endMonth < month && <span>{t('budget.endsIn', { month: monthLabel(item.endMonth, locale) })}</span>}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{money(item.amount)}</span>
                        <span className="muted text-xs group-open:rotate-90" aria-hidden>›</span>
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
            <details className="mt-3 rounded-xl border border-dashed border-zinc-300 px-3 py-2 dark:border-zinc-700" open={template.length === 0}>
              <summary className="cursor-pointer select-none py-1 text-sm font-medium text-brand-500">+ {t('budget.addItem')}</summary>
              <div className="pt-3 pb-1">
                <ItemForm categories={categories} t={t} />
              </div>
            </details>
          </>
        )}
        <p className="muted mt-4 text-xs">{t('budget.fixedNote')}</p>
      </Card>

      <Card title={t('budget.planVsActual')} className="mt-4">
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>{t('budget.leisureEnvelope')}</span>
            <span className="tabular-nums">
              {money(s.variableSpent)} / {money(envelope)}
            </span>
          </div>
          <ProgressBar value={envelope > 0 ? s.variableSpent / envelope : 0} over={s.variableSpent > envelope} />
        </div>
        {planRows.length === 0 ? (
          <Empty>{t('common.noDataYet')}</Empty>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="muted text-left text-xs">
              <th className="pb-2 font-medium">{t('budget.category')}</th>
              <th className="pb-2 text-right font-medium">{t('budget.planned')}</th>
              <th className="pb-2 text-right font-medium">{t('budget.actual')}</th>
              <th className="pb-2 text-right font-medium">{t('budget.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {planRows.map((c) => {
                const planned = c.monthlyBudget ?? 0;
                const actual = spentByCat.get(c.id) ?? 0;
                return (
                  <tr key={c.id} className="table-row">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <Dot color={catById.get(c.id)?.color ?? '#71717a'} />
                        {categoryName(c, t)}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{planned ? money(planned) : '—'}</td>
                    <td className="py-2 text-right tabular-nums">{money(actual)}</td>
                    <td className={`py-2 text-right tabular-nums ${planned && actual > planned ? 'text-red-500' : ''}`}>{planned ? money(planned - actual) : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        )}
      </Card>

      <Card title={t('budget.profile')} className="mt-4">
        <p className="muted mb-3 text-xs">{t('budget.profileHint')}</p>
        <form action={saveProfileAction} className="grid grid-cols-2 items-end gap-3 md:grid-cols-7">
          {(
            [
              ['incomeMin', t('budget.incomeMin'), profile.incomeMin],
              ['incomeMax', t('budget.incomeMax'), profile.incomeMax],
              ['defaultIncome', t('budget.defaultIncome'), profile.defaultIncome],
              ['mealCard', t('budget.mealCard'), profile.mealCard],
              ['transportAllowance', t('budget.transportAllowance'), profile.transportAllowance],
              ['annualBonus', t('budget.annualBonus'), profile.annualBonus],
            ] as const
          ).map(([name, label, value]) => (
            <Field key={name} label={`${label} (€)`}>
              <input name={name} inputMode="decimal" defaultValue={toInputDecimal(value)} className="input tabular-nums" />
            </Field>
          ))}
          <button className="btn-primary col-span-2 md:col-span-1">{t('common.save')}</button>
        </form>
      </Card>
    </>
  );
}
