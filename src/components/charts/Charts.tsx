'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '@/i18n/client';
import { formatMoney } from '@/lib/format';

export interface Series {
  key: string;
  name: string;
  color: string;
}

const AXIS = { stroke: '#71717a', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid strokeDasharray="3 3" stroke="#71717a" strokeOpacity={0.2} vertical={false} />;

function useMoney() {
  const { locale } = useI18n();
  return {
    full: (v: number) => formatMoney(v, locale),
    compact: (v: number) =>
      new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'EUR' }).format(v),
  };
}

const tooltipStyle = {
  // Theme-aware: follows the light/dark design tokens.
  contentStyle: { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12, color: 'rgb(var(--ink))', boxShadow: '0 10px 30px -10px rgb(16 24 40 / 0.25)' },
  itemStyle: { color: 'rgb(var(--ink))' },
  labelStyle: { color: 'rgb(var(--subtle))', marginBottom: 4 },
};


// Animations are off: with React 19 Recharts 2 can leave shapes unrendered, and instant charts feel snappier.

/** Empty or all-zero series render a calm placeholder instead of a broken, axis-only chart. */
function hasValues(data: Record<string, string | number>[], keys: string[]) {
  return data.some((row) => keys.some((k) => typeof row[k] === 'number' && Number.isFinite(row[k] as number) && row[k] !== 0));
}

function ChartEmpty({ height }: { height: number }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-subtle" style={{ height }}>
      {t('common.noDataYet')}
    </div>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const m = useMoney();
  if (!data.some((d) => d.value > 0)) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" isAnimationActive={false} innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v: number) => m.full(v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  stacked = false,
  height = 260,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  stacked?: boolean;
  height?: number;
}) {
  const m = useMoney();
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {GRID}
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={56} tickFormatter={m.compact} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => m.full(v)} cursor={{ fill: '#71717a', fillOpacity: 0.1 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            isAnimationActive={false}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
            maxBarSize={36}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, xKey, series, height = 260 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number }) {
  const m = useMoney();
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {GRID}
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        {/* Balances: scale to the data range so movement is visible (not anchored at 0 €). */}
        <YAxis {...AXIS} width={60} tickFormatter={m.compact} domain={['auto', 'auto']} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => m.full(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length < 16} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GrowthChart({ data, xKey, series, height = 280 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number }) {
  const m = useMoney();
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {GRID}
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...AXIS} width={60} tickFormatter={m.compact} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => m.full(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Area key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
