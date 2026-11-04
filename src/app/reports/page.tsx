import Link from 'next/link';
import { BarsChart, DonutChart, LinesChart } from '@/components/charts/LazyCharts';
import { IncomeHistory } from '@/components/income/IncomeHistory';
import { Card, EmptyState, PageHeader, ProgressBar, Stat } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { currentMonth, formatDate, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { listCategories, listMonthBudgets, listMonthIncomes } from '@/lib/repo';
import { changeRatio } from '@/lib/report-calc';
import { buildReport, parseReportFilters } from '@/lib/reports';
import { ACCOUNT_IDS } from '@/lib/types';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const filters = parseReportFilters(sp);
  const r = buildReport(filters);
  const categories = listCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const nameOf = (id: number | null) => (id != null && catById.has(id) ? categoryName(catById.get(id), t) : t('categories.other'));
  const colorOf = (id: number | null) => (id != null ? (catById.get(id)?.color ?? '#71717a') : '#71717a');

  const qs = new URLSearchParams(Object.entries({ month: filters.month, year: filters.year, account: filters.account, category: filters.categoryId?.toString() }).filter((e): e is [string, string] => !!e[1])).toString();
  const isYear = !!filters.year;
  const hasSpending = r.totals.count > 0;

  const delta = (now: number, before: number) => {
    const ch = changeRatio(now, before);
    if (ch == null) return t('reports.noPrevious');
    return t(isYear ? 'reports.vsYear' : 'reports.vsMonth', { pct: `${ch > 0 ? '+' : ''}${formatPercent(ch, locale, 0)}` });
  };

  const portfolioEmpty = (
    <EmptyState compact title={t('reports.noPortfolioTitle')} hint={t('reports.noPortfolioHint')} action={{ href: '/portfolio', label: t('reports.toPortfolio') }} />
  );
  const curve = (pts: { date: string; value: number; invested: number }[]) => pts.map((p) => ({ label: formatDate(p.date), value: p.value, invested: p.invested }));
  const hasContrib = r.contributions.some((c) => c.trading212 > 0 || c.traderepublic > 0);
  const spentTotal = r.totals.spent || 1;
  const maxTop = r.topCategories[0]?.total || 1;

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        subtitle={isYear ? filters.year : monthLabel(filters.month as string, locale)}
        actions={
          <a href={`/api/reports/export${qs ? `?${qs}` : ''}`} className="btn-secondary" download>
            {t('reports.exportCsv')}
          </a>
        }
      />

      <Card className="mb-4">
        <form method="get" className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="label">{t('reports.month')}</span>
            <input type="month" name="month" defaultValue={filters.month ?? currentMonth()} className="input" />
          </label>
          <label className="block">
            <span className="label">{t('reports.year')}</span>
            <select name="year" defaultValue={filters.year ?? ''} className="input">
              <option value="">{t('reports.allYears')}</option>
              {r.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('reports.account')}</span>
            <select name="account" defaultValue={filters.account ?? ''} className="input">
              <option value="">{t('reports.allAccounts')}</option>
              {ACCOUNT_IDS.map((a) => (
                <option key={a} value={a}>
                  {accountName(a, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('reports.category')}</span>
            <select name="category" defaultValue={filters.categoryId ?? ''} className="input">
              <option value="">{t('reports.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, t)}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 flex gap-2 lg:col-span-1">
            <button className="btn-primary flex-1">{t('reports.apply')}</button>
            <Link href="/reports" className="btn-ghost">
              {t('reports.reset')}
            </Link>
          </div>
        </form>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('reports.spent')} value={money(r.totals.spent)} hint={`${t('reports.purchases', { n: r.totals.count })} · ${delta(r.totals.spent, r.previousTotals.spent)}`} />
        <Stat label={t('reports.income')} value={money(r.totals.income)} hint={delta(r.totals.income, r.previousTotals.income)} tone="positive" />
        <Stat label={t('reports.bank')} value={money(r.totals.bank)} hint={`${formatPercent(r.totals.bank / spentTotal, locale, 0)} ${t('reports.share').toLowerCase()}`} />
        <Stat label={t('reports.meal')} value={money(r.totals.meal)} hint={`${formatPercent(r.totals.meal / spentTotal, locale, 0)} ${t('reports.share').toLowerCase()}`} />
      </div>
      {r.totals.meal > 0 && <p className="muted -mt-2 mb-4 text-xs">{t('reports.mealNote')}</p>}

      {!hasSpending ? (
        <Card className="mb-4">
          <EmptyState title={t('reports.noSpendingTitle')} hint={t('reports.noSpendingHint')} action={{ href: '/transactions/new', label: t('reports.addTx') }} />
        </Card>
      ) : (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title={t('reports.byCategory')}>
            <DonutChart data={r.byCategory.map((c) => ({ name: nameOf(c.categoryId), value: c.total, color: colorOf(c.categoryId) }))} />
            <ul className="mt-2 divide-y divide-line/70">
              {r.byCategory.map((c) => (
                <li key={String(c.categoryId)} className="flex items-center gap-2 py-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(c.categoryId) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{nameOf(c.categoryId)}</span>
                  <span className="muted text-xs tabular-nums">{formatPercent(c.total / spentTotal, locale, 0)}</span>
                  <span className="w-24 text-right tabular-nums">{money(c.total)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid content-start gap-4">
            <Card title={t('reports.topCategories')}>
              <ol className="space-y-3">
                {r.topCategories.map((c, i) => (
                  <li key={String(c.categoryId)}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="muted mr-2 tabular-nums">{i + 1}</span>
                        {nameOf(c.categoryId)}
                      </span>
                      <span className="tabular-nums">{money(c.total)}</span>
                    </div>
                    <ProgressBar value={c.total / maxTop} color={colorOf(c.categoryId)} label={nameOf(c.categoryId)} size="sm" />
                  </li>
                ))}
              </ol>
            </Card>
            <Card title={t('reports.topStores')}>
              <ol className="divide-y divide-line/70">
                {r.topStores.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-3 py-2 text-sm">
                    <span className="muted w-4 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="muted text-xs">{t('reports.times', { n: s.count })}</span>
                    <span className="w-20 text-right tabular-nums">{money(s.total)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}

      <Card title={t('reports.planned')} className="mb-4">
        {r.budget.length === 0 ? (
          <EmptyState compact title={t('reports.noBudgetsTitle')} hint={t('reports.noBudgetsHint')} action={{ href: '/transactions/categories', label: t('reports.setBudgets') }} />
        ) : (
          <>
            <ul className="space-y-4">
              {r.budget.map((b) => {
                const diff = b.planned - b.spent;
                return (
                  <li key={b.categoryId}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{nameOf(b.categoryId)}</span>
                      <span className="muted text-xs tabular-nums">
                        {t('reports.actualLabel')} {money(b.spent)} / {t('reports.plannedLabel')} {money(b.planned)}
                      </span>
                    </div>
                    <ProgressBar value={b.ratio} tone="auto" label={nameOf(b.categoryId)} />
                    <p className={`mt-1 text-xs ${diff < 0 ? 'text-negative' : 'muted'}`}>{diff < 0 ? t('reports.over', { amount: money(-diff) }) : t('reports.left', { amount: money(diff) })}</p>
                  </li>
                );
              })}
            </ul>
            <p className="muted mt-4 border-t border-line/70 pt-3 text-xs tabular-nums">
              {t('reports.totalBudgeted')}: {money(r.budgetTotals.spent)} / {money(r.budgetTotals.planned)}
            </p>
          </>
        )}
      </Card>

      <h2 className="section-title mb-3 mt-6">
        {t('reports.investing')} <span className="muted font-normal">· {t('reports.last12')}</span>
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('reports.contributions')}>
          {hasContrib ? (
            <BarsChart
              data={r.contributions.map((c) => ({ label: monthLabel(c.month, locale, 'short'), trading212: c.trading212, traderepublic: c.traderepublic }))}
              xKey="label"
              stacked
              series={[
                { key: 'trading212', name: accountName('trading212', t), color: '#10b981' },
                { key: 'traderepublic', name: accountName('traderepublic', t), color: '#0ea5e9' },
              ]}
            />
          ) : (
            <EmptyState compact title={t('reports.noContributionsTitle')} hint={t('reports.noContributionsHint')} />
          )}
        </Card>
        <Card title={t('reports.t212Value')}>
          {r.trading212.length >= 2 ? (
            <LinesChart
              data={curve(r.trading212)}
              xKey="label"
              series={[
                { key: 'value', name: t('portfolio.value'), color: '#10b981' },
                { key: 'invested', name: t('portfolio.invested'), color: '#6366f1' },
              ]}
            />
          ) : (
            portfolioEmpty
          )}
        </Card>
        <Card title={t('reports.trValue')} className="lg:col-span-2">
          {r.traderepublic.length >= 2 ? <LinesChart data={curve(r.traderepublic)} xKey="label" series={[{ key: 'value', name: accountName('traderepublic', t), color: '#0ea5e9' }]} /> : portfolioEmpty}
        </Card>
      </div>

      <IncomeHistory budgets={listMonthBudgets()} incomes={listMonthIncomes()} months={r.window} t={t} locale={locale} title={t('income.compareTitle')} />
    </>
  );
}
