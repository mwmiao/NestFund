'use client';

import { useMemo, useState } from 'react';
import { GrowthChart } from '@/components/charts/Charts';
import { Alert } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { simulateEtf } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { NumberField } from './NumberField';

export function EtfSimulator({ defaults }: { defaults: { monthlyContribution: number; currentValue: number } }) {
  const { t, locale } = useI18n();
  const money = (v: number) => formatMoney(v, locale);
  const [v, setV] = useState({ ...defaults, annualReturn: 6, years: 20 });
  const set = (k: keyof typeof v) => (n: number) => setV((p) => ({ ...p, [k]: n }));
  const years = Math.min(Math.max(Math.round(v.years), 1), 50);

  const points = useMemo(
    () => simulateEtf({ monthlyContribution: v.monthlyContribution, currentValue: v.currentValue, annualReturn: v.annualReturn / 100, years }),
    [v, years],
  );
  const last = points[points.length - 1];
  const yearly = points.filter((p) => p.month % 12 === 0).map((p) => ({ label: `${p.month / 12}`, contributed: p.contributed, value: p.value }));

  return (
    <div className="space-y-5">
      <Alert tone="warning">{t('sim.etfWarning')}</Alert>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NumberField label={t('sim.monthlyContribution')} value={v.monthlyContribution} onChange={set('monthlyContribution')} suffix="€" />
        <NumberField label={t('sim.currentValue')} value={v.currentValue} onChange={set('currentValue')} suffix="€" />
        <NumberField label={t('sim.annualReturn')} value={v.annualReturn} onChange={set('annualReturn')} suffix="%" />
        <NumberField label={t('sim.horizon')} value={v.years} onChange={set('years')} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          [t('sim.contributed'), last.contributed, ''],
          [t('sim.projectedValue'), last.value, 'text-positive'],
          [t('sim.gain'), last.value - last.contributed, ''],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="rounded-xl bg-raised p-3">
            <div className="muted text-xs">{label}</div>
            <div className={`mt-1 font-semibold tabular-nums ${cls}`}>{money(value as number)}</div>
          </div>
        ))}
      </div>
      <GrowthChart
        data={yearly}
        xKey="label"
        series={[
          { key: 'contributed', name: t('sim.contributed'), color: '#6366f1' },
          { key: 'value', name: t('sim.projectedValue'), color: '#10b981' },
        ]}
      />
    </div>
  );
}
