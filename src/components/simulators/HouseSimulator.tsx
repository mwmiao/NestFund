'use client';

import { useMemo, useState } from 'react';
import { GrowthChart } from '@/components/charts/Charts';
import { useI18n } from '@/i18n/client';
import { milestones, simulateHouseSavings, type HouseSimInput } from '@/lib/calc';
import { addMonths, currentMonth, monthLabel } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { NumberField } from './NumberField';

export interface HouseDefaults {
  housePrice: number;
  downPaymentPct: number;
  purchaseCostsPct: number;
  monthlyContribution: number;
  annualBonus: number;
  initialBalance: number;
}

export function HouseSimulator({ defaults }: { defaults: HouseDefaults }) {
  const { t, locale } = useI18n();
  const money = (v: number) => formatMoney(v, locale);
  const [v, setV] = useState({
    ...defaults,
    tier1Rate: 3,
    tier1Limit: 50_000,
    tier2Rate: 2.5,
    taxRate: 28,
    years: 10,
  });
  const set = (k: keyof typeof v) => (n: number) => setV((p) => ({ ...p, [k]: n }));

  const horizon = Math.min(Math.max(Math.round(v.years), 1), 40);
  // Always simulate at least 10 years so the 3/5/7/10-year table is complete; the chart follows the chosen horizon.
  const result = useMemo(() => simulateHouseSavings({ ...toInput(v), years: Math.max(horizon, 10) }), [v, horizon]);
  const tablePoints = milestones(result.points, [3, 5, 7, 10]);
  const monthsToTarget = result.monthsToTarget != null && result.monthsToTarget <= horizon * 12 ? result.monthsToTarget : null;
  const start = currentMonth();
  const chart = result.points
    .filter((p) => p.month <= horizon * 12 && p.month % 3 === 0)
    .map((p) => ({ label: monthLabel(addMonths(start, p.month), locale, 'short'), deposited: p.deposited, interest: p.interest, balance: p.balance }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NumberField label={t('sim.housePrice')} value={v.housePrice} onChange={set('housePrice')} suffix="€" />
        <NumberField label={t('sim.downPaymentPct')} value={v.downPaymentPct} onChange={set('downPaymentPct')} suffix="%" />
        <NumberField label={t('sim.purchaseCostsPct')} value={v.purchaseCostsPct} onChange={set('purchaseCostsPct')} suffix="%" hint={t('sim.purchaseCostsHint')} />
        <NumberField label={t('sim.monthlyContribution')} value={v.monthlyContribution} onChange={set('monthlyContribution')} suffix="€" />
        <NumberField label={t('sim.annualBonus')} value={v.annualBonus} onChange={set('annualBonus')} suffix="€" />
        <NumberField label={t('sim.initialBalance')} value={v.initialBalance} onChange={set('initialBalance')} suffix="€" />
        <NumberField label={t('sim.tier1Rate')} value={v.tier1Rate} onChange={set('tier1Rate')} suffix="%" />
        <NumberField label={t('sim.tier1Limit')} value={v.tier1Limit} onChange={set('tier1Limit')} suffix="€" />
        <NumberField label={t('sim.tier2Rate')} value={v.tier2Rate} onChange={set('tier2Rate')} suffix="%" />
        <NumberField label={t('sim.taxRate')} value={v.taxRate} onChange={set('taxRate')} suffix="%" />
        <NumberField label={t('sim.horizon')} value={v.years} onChange={set('years')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          [t('sim.downPayment'), result.downPayment],
          [t('sim.purchaseCosts'), result.purchaseCosts],
          [t('sim.target'), result.target],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/60">
            <div className="muted text-xs">{label}</div>
            <div className="mt-1 font-semibold tabular-nums">{money(value as number)}</div>
          </div>
        ))}
      </div>
      <p className={`text-sm font-medium ${monthsToTarget != null ? 'text-emerald-500' : 'text-amber-500'}`}>
        {monthsToTarget != null
          ? t('sim.reachedIn', { n: monthsToTarget, month: monthLabel(addMonths(start, monthsToTarget), locale) })
          : t('sim.notReached')}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="muted text-left text-xs">
              <th className="pb-2 font-medium">{t('sim.projection')}</th>
              <th className="pb-2 text-right font-medium">{t('sim.deposited')}</th>
              <th className="pb-2 text-right font-medium">{t('sim.netInterest')}</th>
              <th className="pb-2 text-right font-medium">{t('sim.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {tablePoints.map((p) => (
              <tr key={p.years} className="table-row">
                <td className="py-2">{t('sim.after', { n: p.years })}</td>
                <td className="py-2 text-right tabular-nums">{money(p.deposited)}</td>
                <td className="py-2 text-right tabular-nums text-emerald-500">{money(p.interest)}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{money(p.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GrowthChart
        data={chart}
        xKey="label"
        series={[
          { key: 'deposited', name: t('sim.deposited'), color: '#6366f1' },
          { key: 'balance', name: t('sim.balance'), color: '#10b981' },
        ]}
      />
      <p className="muted text-xs">{t('sim.netNote', { tax: formatPercent(v.taxRate / 100, locale, 0) })}</p>
    </div>
  );
}

function toInput(v: HouseDefaults & { tier1Rate: number; tier1Limit: number; tier2Rate: number; taxRate: number }): Omit<HouseSimInput, 'years'> {
  return {
    housePrice: v.housePrice,
    downPaymentPct: v.downPaymentPct / 100,
    purchaseCostsPct: v.purchaseCostsPct / 100,
    monthlyContribution: v.monthlyContribution,
    annualBonus: v.annualBonus,
    initialBalance: v.initialBalance,
    tiers: [
      { upTo: v.tier1Limit, rate: v.tier1Rate / 100 },
      { upTo: null, rate: v.tier2Rate / 100 },
    ],
    taxRate: v.taxRate / 100,
  };
}
