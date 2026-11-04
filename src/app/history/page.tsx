import Link from 'next/link';
import { BarsChart, LinesChart } from '@/components/charts/LazyCharts';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { computeMonthSummary } from '@/lib/calc';
import { addMonths, currentMonth, formatDate, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent, round2 } from '@/lib/format';
import { categoryName } from '@/lib/labels';
import { listCategories, listMonthBudgets, listSnapshots, listTransactions, spendingByMonthAndCategory } from '@/lib/repo';

export default async function HistoryPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const categories = listCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));

  const months = listMonthBudgets().filter((b) => b.month <= currentMonth());
  // One read of all transactions (shared with the other pages through the cache), grouped by month here,
  // instead of one query per month.
  const txsByMonth = new Map<string, ReturnType<typeof listTransactions>>();
  for (const tx of listTransactions()) {
    const key = tx.date.slice(0, 7);
    const list = txsByMonth.get(key);
    if (list) list.push(tx);
    else txsByMonth.set(key, [tx]);
  }
  const rows = months.map((b) => ({ budget: b, s: computeMonthSummary(b, txsByMonth.get(b.month) ?? [], categories) }));

  let cumulative = 0;
  const savingsChart = rows.map(({ budget, s }) => {
    cumulative += s.savingsTotal;
    return { label: monthLabel(budget.month, locale, 'short'), etf: s.etf, savings: s.savings, cumulative: round2(cumulative) };
  });

  const etfChart = listSnapshots('trading212').map((s) => ({ label: formatDate(s.date).slice(3), value: s.value, invested: s.invested }));
  const cashChart = listSnapshots('traderepublic').map((s) => ({ label: formatDate(s.date).slice(3), value: s.value }));

  // Stacked monthly spending for the last 12 months, top 6 categories + "other".
  const from = addMonths(currentMonth(), -11);
  const spend = spendingByMonthAndCategory(from);
  const totals = new Map<number | null, number>();
  for (const r of spend) totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.total);
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  const seriesKey = (id: number | null) => (top.includes(id) ? `c${id ?? 'none'}` : 'rest');
  const byMonth = new Map<string, Record<string, string | number>>();
  for (const r of spend) {
    const row = byMonth.get(r.month) ?? { label: monthLabel(r.month, locale, 'short') };
    const k = seriesKey(r.categoryId);
    row[k] = round2(((row[k] as number) ?? 0) + r.total);
    byMonth.set(r.month, row);
  }
  const spendSeries = [
    ...top.map((id) => {
      const cat = id != null ? catById.get(id) : undefined;
      return { key: `c${id ?? 'none'}`, name: categoryName(cat, t), color: cat?.color ?? '#71717a' };
    }),
    ...(totals.size > top.length ? [{ key: 'rest', name: t('categories.other'), color: '#52525b' }] : []),
  ];

  return (
    <>
      <PageHeader title={t('history.title')} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('history.savingsEvolution')}>
          <BarsChart
            data={savingsChart}
            xKey="label"
            stacked
            series={[
              { key: 'etf', name: t('budget.kinds.etf'), color: '#10b981' },
              { key: 'savings', name: t('budget.kinds.savings'), color: '#0ea5e9' },
            ]}
          />
        </Card>
        <Card title={t('history.cumulativeSavings')}>
          <LinesChart data={savingsChart} xKey="label" series={[{ key: 'cumulative', name: t('history.cumulativeSavings'), color: '#10b981' }]} />
        </Card>
        <Card title={t('history.etfEvolution')}>
          <LinesChart
            data={etfChart}
            xKey="label"
            series={[
              { key: 'value', name: t('portfolio.value'), color: '#10b981' },
              { key: 'invested', name: t('portfolio.invested'), color: '#6366f1' },
            ]}
          />
        </Card>
        <Card title={t('history.houseEvolution')}>
          <LinesChart data={cashChart} xKey="label" series={[{ key: 'value', name: 'Trade Republic', color: '#a855f7' }]} />
        </Card>
        <Card title={t('history.spendingByCategory')} className="lg:col-span-2">
          <BarsChart data={[...byMonth.values()]} xKey="label" stacked series={spendSeries} height={300} />
        </Card>
      </div>

      <Card title={t('history.months')} className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="muted text-left text-xs">
                <th className="pb-2 font-medium">{t('common.month')}</th>
                <th className="pb-2 text-right font-medium">{t('history.income')}</th>
                <th className="pb-2 text-right font-medium">{t('history.fixed')}</th>
                <th className="pb-2 text-right font-medium">{t('history.spent')}</th>
                <th className="pb-2 text-right font-medium">{t('history.saved')}</th>
                <th className="pb-2 text-right font-medium">{t('history.rate')}</th>
                <th className="pb-2 text-right font-medium">{t('dashboard.realAvailable')}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(({ budget, s }) => (
                <tr key={budget.month} className="table-row">
                  <td className="py-2">
                    <Link href={`/budget?m=${budget.month}`} className="hover:text-brand-500">
                      {monthLabel(budget.month, locale)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(s.income)}</td>
                  <td className="py-2 text-right tabular-nums">{money(s.fixed)}</td>
                  <td className="py-2 text-right tabular-nums">{money(s.manualSpent)}</td>
                  <td className="py-2 text-right tabular-nums text-positive">{money(s.savingsTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPercent(s.savingsRate, locale)}</td>
                  <td className={`py-2 text-right tabular-nums ${s.realAvailable < 0 ? 'text-negative' : ''}`}>{money(s.realAvailable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
