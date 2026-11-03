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
  contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12, color: '#f4f4f5' },
  itemStyle: { color: '#f4f4f5' },
  labelStyle: { color: '#a1a1aa', marginBottom: 4 },
};

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const m = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {GRID}
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...AXIS} width={56} tickFormatter={m.compact} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => m.full(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length < 16} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GrowthChart({ data, xKey, series, height = 280 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number }) {
  const m = useMoney();
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
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
