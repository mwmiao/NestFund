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
import { seriesStats, topSlices } from '@/lib/chart-summary';

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

const MAX_TABLE_ROWS = 36;

/** Names the chart for assistive technology (role="img"); the SVG itself is not navigable. */
function ChartFrame({ label, summary, children }: { label: string; summary: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={summary ? `${label}. ${summary}` : label}>
      {children}
    </div>
  );
}

/** Exact values under a collapsed disclosure, for keyboard and screen-reader users. */
function DataTable({ data, xKey, series, format }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; format: (v: number) => string }) {
  const { t } = useI18n();
  const rows = data.slice(-MAX_TABLE_ROWS);
  return (
    <details className="mt-2 text-sm">
      <summary className="link inline-flex cursor-pointer select-none">{t('charts.showTable')}</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead>
            <tr className="muted">
              <th scope="col" className="pb-1 pr-3 font-medium">{t('charts.period')}</th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="pb-1 pr-3 text-right font-medium">{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="table-row">
                <th scope="row" className="py-1 pr-3 font-normal">{String(row[xKey])}</th>
                {series.map((s) => (
                  <td key={s.key} className="py-1 pr-3 text-right">{typeof row[s.key] === 'number' ? format(row[s.key] as number) : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > rows.length && <p className="muted mt-1 text-xs">{t('charts.tableCapped', { n: rows.length, total: data.length })}</p>}
      </div>
    </details>
  );
}

/** One sentence per series: start, end, lowest and highest. */
function useSummary(data: Record<string, string | number>[], xKey: string, series: Series[]) {
  const { t } = useI18n();
  const m = useMoney();
  return seriesStats(data, xKey, series)
    .map((s) => t('charts.summary', { name: s.name, first: m.full(s.first.value), from: s.first.x, last: m.full(s.last.value), to: s.last.x, min: m.full(s.min.value), max: m.full(s.max.value) }))
    .join(' ');
}

export function DonutChart({ data, label, height = 220 }: { data: { name: string; value: number; color: string }[]; label: string; height?: number }) {
  const m = useMoney();
  const { t } = useI18n();
  if (!data.some((d) => d.value > 0)) return <ChartEmpty height={height} />;
  const summary = t('charts.donutSummary', { items: topSlices(data).map((d) => `${d.name} ${m.full(d.value)}`).join(', ') });
  return (
    <ChartFrame label={label} summary={summary}>
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
    </ChartFrame>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  label,
  stacked = false,
  height = 260,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  label: string;
  stacked?: boolean;
  height?: number;
}) {
  const m = useMoney();
  const summary = useSummary(data, xKey, series);
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <>
      <ChartFrame label={label} summary={summary}>
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
      </ChartFrame>
      <DataTable data={data} xKey={xKey} series={series} format={m.full} />
    </>
  );
}

export function LinesChart({ data, xKey, series, label, height = 260 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; label: string; height?: number }) {
  const m = useMoney();
  const summary = useSummary(data, xKey, series);
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <>
      <ChartFrame label={label} summary={summary}>
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
      </ChartFrame>
      <DataTable data={data} xKey={xKey} series={series} format={m.full} />
    </>
  );
}

export function GrowthChart({ data, xKey, series, label, height = 280 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; label: string; height?: number }) {
  const m = useMoney();
  const summary = useSummary(data, xKey, series);
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <>
      <ChartFrame label={label} summary={summary}>
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
      </ChartFrame>
      <DataTable data={data} xKey={xKey} series={series} format={m.full} />
    </>
  );
}

