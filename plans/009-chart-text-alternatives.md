# Plan 009: Give every chart a text summary and a data table for keyboard and screen-reader users

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ca9a94..HEAD -- src/components/charts src/app/portfolio/page.tsx src/app/reports/page.tsx src/components/reports/HistoryView.tsx src/components/simulators`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: accessibility
- **Planned at**: commit `3ca9a94`, 2026-11-14

## Why this matters

The app's charts (Recharts SVGs) expose their numbers only through a mouse-hover tooltip. Keyboard users, screen-reader
users and touch users without hover get nothing, and the chart has no accessible name (WCAG 1.1.1 Non-text Content,
2.1.1 Keyboard). After this plan each chart is announced with a name and a one-sentence summary per series (start, end,
lowest, highest), and a collapsed "Show data table" under it gives the exact values.

## Current state

- `src/components/charts/Charts.tsx` (client) exports `DonutChart`, `BarsChart`, `LinesChart`, `GrowthChart`. Each takes
  `data: Record<string, string | number>[]`, `xKey`, `series: Series[]` (`{ key, name, color }`) and returns a bare
  `<ResponsiveContainer>`; the empty case returns `<ChartEmpty height />`. Helper `useMoney()` returns `{ full, compact }`
  money formatters bound to the locale. Example:

```tsx
export function LinesChart({ data, xKey, series, height = 260 }: { data: Record<string, string | number>[]; xKey: string; series: Series[]; height?: number }) {
  const m = useMoney();
  if (!hasValues(data, series.map((s) => s.key))) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}> … </LineChart>
    </ResponsiveContainer>
  );
}
```
  `DonutChart` takes `data: { name; value; color }[]`.
- `src/components/charts/LazyCharts.tsx` re-exports all four through `next/dynamic` with `ssr: false`, typed with
  `React.ComponentProps<Mod['…']>`, so new props flow through automatically.
- Call sites (line numbers at planned commit; re-find with `grep -rn "<LinesChart\|<BarsChart\|<DonutChart\|<GrowthChart" src`):
  - `src/app/portfolio/page.tsx:113` (Trading 212 evolution), `:153` (Trade Republic)
  - `src/app/reports/page.tsx:125` (donut by category), `:206` (contributions bars), `:221` (T212 value), `:234` (Trade Republic)
  - `src/components/reports/HistoryView.tsx:91, 105, 109, 122, 125` (each sits in a `<Card title={t('history.…')}>`)
  - `src/components/simulators/EtfSimulator.tsx:55`, `src/components/simulators/HouseSimulator.tsx:119` (`GrowthChart`)
- i18n: `useI18n()` (client) returns `{ t, locale }`; keys live in `src/i18n/locales/en-US.json` and `pt-PT.json`
  (nested JSON, same structure in both; add every new key to **both**). `common.noDataYet` exists.
- Pure helpers go in `src/lib/` and are unit-tested in `tests/` (Vitest, node environment, `@/` alias). Pattern: `tests/report-calc.test.ts`.

Conventions: 2-space indent, single quotes, short English comments explaining *why*. Keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| New test | `npx vitest run tests/chart-summary.test.ts` | pass |

## Scope

**In scope**:
- `src/lib/chart-summary.ts` (create), `tests/chart-summary.test.ts` (create)
- `src/components/charts/Charts.tsx`
- the call-site files listed above (add a `label` prop only)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json` (add a `charts` group — the key `charts.notEnough`/`charts.noMonths` already exist there; add the new keys next to them)

**Out of scope**:
- Colours, sizes, tooltips, axes, data shaping, the empty-state messages.
- `LazyCharts.tsx` (no change needed).
- Any other i18n key.

## Git workflow

- Branch: `advisor/009-chart-text`
- Commit after Step 2 and after Step 5; repo-style messages, e.g. `Add text summaries and data tables to charts`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure summary helper with tests

Create `src/lib/chart-summary.ts`:

```ts
export interface SummarySeries {
  key: string;
  name: string;
}
export interface SeriesPoint {
  x: string;
  value: number;
}
export interface SeriesStats {
  name: string;
  first: SeriesPoint;
  last: SeriesPoint;
  min: SeriesPoint;
  max: SeriesPoint;
}

/** Start, end, lowest and highest value of each series, skipping rows where the series has no number. */
export function seriesStats(data: Record<string, string | number>[], xKey: string, series: SummarySeries[]): SeriesStats[] {
  const out: SeriesStats[] = [];
  for (const s of series) {
    const pts: SeriesPoint[] = data
      .filter((row) => typeof row[s.key] === 'number' && Number.isFinite(row[s.key] as number))
      .map((row) => ({ x: String(row[xKey]), value: row[s.key] as number }));
    if (!pts.length) continue;
    const by = (pick: (a: number, b: number) => boolean) => pts.reduce((best, p) => (pick(p.value, best.value) ? p : best));
    out.push({ name: s.name, first: pts[0], last: pts[pts.length - 1], min: by((a, b) => a < b), max: by((a, b) => a > b) });
  }
  return out;
}

/** The largest positive slices of a donut, biggest first. */
export function topSlices(data: { name: string; value: number }[], n = 5) {
  return data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}
```

Create `tests/chart-summary.test.ts` covering: (1) a two-series data set returns first/last/min/max per series with the
right `x` labels; (2) a series with no numeric values is skipped; (3) rows where a series is missing are ignored for that
series only; (4) `topSlices` drops zero/negative values, sorts descending and caps at `n`.

**Verify**: `npx vitest run tests/chart-summary.test.ts` → all pass.

### Step 2: Add translation keys (both locales)

Add to the `charts` object in each locale file:

| key | en-US | pt-PT |
|---|---|---|
| `charts.summary` | `{name}: {first} ({from}) to {last} ({to}); lowest {min}, highest {max}.` | `{name}: {first} ({from}) até {last} ({to}); mínimo {min}, máximo {max}.` |
| `charts.donutSummary` | `Largest shares: {items}.` | `Maiores parcelas: {items}.` |
| `charts.showTable` | `Show data table` | `Mostrar tabela de dados` |
| `charts.tableCapped` | `Showing the latest {n} of {total} points.` | `A mostrar os últimos {n} de {total} pontos.` |
| `charts.period` | `Period` | `Período` |

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) { const o=require('./src/i18n/locales/'+f+'.json'); for (const k of ['summary','donutSummary','showTable','tableCapped','period']) if(!o.charts[k]) throw new Error(f+' missing '+k) }"` → exit 0, no output.

### Step 3: Wrap the charts

In `Charts.tsx`:
1. Add a required `label: string` prop to `DonutChart`, `BarsChart`, `LinesChart` and `GrowthChart`.
2. Add a shared `ChartFrame` component and a `DataTable` component:

```tsx
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
```
3. In each of `BarsChart`, `LinesChart`, `GrowthChart`: compute
   `const summary = seriesStats(data, xKey, series).map((s) => t('charts.summary', { name: s.name, first: m.full(s.first.value), from: s.first.x, last: m.full(s.last.value), to: s.last.x, min: m.full(s.min.value), max: m.full(s.max.value) })).join(' ');`
   (get `t` from `useI18n()`), wrap the existing `<ResponsiveContainer>` in `<ChartFrame label={label} summary={summary}>`, and render
   `<DataTable data={data} xKey={xKey} series={series} format={m.full} />` after it (wrap both in a fragment).
4. In `DonutChart`: `summary = t('charts.donutSummary', { items: topSlices(data).map((d) => `${d.name} ${m.full(d.value)}`).join(', ') })`, wrap in `ChartFrame`; no data table (the Reports page already lists every slice next to it).
5. Do not change `ChartEmpty`; the early returns stay before any new code that needs data (hooks stay unconditional — call `useI18n()` and `useMoney()` at the top of each component, as `useMoney` already is).

**Verify**: `npx tsc --noEmit` → fails only at the call sites that lack `label` (expected until Step 4); then continue.

### Step 4: Pass a label at every call site

Add `label={…}` (the same translated title the surrounding card uses) at each call site:

| Call site | `label` |
|---|---|
| `portfolio/page.tsx:113` | `t('portfolio.evolution')` |
| `portfolio/page.tsx:153` | `"Trade Republic"` |
| `reports/page.tsx:125` | `t('reports.byCategory')` |
| `reports/page.tsx:206` | `t('reports.contributions')` |
| `reports/page.tsx:221` | `t('reports.t212Value')` |
| `reports/page.tsx:234` | `t('reports.trValue')` |
| `HistoryView.tsx:91` | `t('history.savingsEvolution')` |
| `HistoryView.tsx:105` | `t('history.cumulativeSavings')` |
| `HistoryView.tsx:109` | `t('history.etfEvolution')` |
| `HistoryView.tsx:122` | `t('history.houseEvolution')` |
| `HistoryView.tsx:125` | `t('history.spendingByCategory')` |
| `EtfSimulator.tsx:55` | `t('sim.projectedValue')` |
| `HouseSimulator.tsx:119` | `t('sim.projection')` |

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Manual check

Run `npm run dev`; open `/reports/over-time` after adding a couple of balances (or use any page with a chart). With the browser
accessibility tree (devtools → Accessibility) each chart shows as an image with a name and summary, and "Show data table"
opens a table. If you cannot run a browser, say so and rely on the Done criteria.

## Test plan

- `tests/chart-summary.test.ts` (Step 1): four cases listed there. Pattern: `tests/report-calc.test.ts`.
- Component rendering cannot be tested in the node environment; Step 5 covers it manually.
- `npx vitest run` → all pass including the new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0 (the `label` prop is required, so every call site is covered)
- [ ] `npx vitest run` exits 0 and includes `tests/chart-summary.test.ts`
- [ ] the key-check command in Step 2 exits 0
- [ ] `grep -rn "<LinesChart\|<BarsChart\|<DonutChart\|<GrowthChart" src --include=*.tsx | grep -v "label="` shows only lines whose element continues on the next lines (multi-line JSX) — confirm each by eye that `label=` appears within that element
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `Charts.tsx` no longer has the four chart components described, or `useI18n` is not usable there.
- Wrapping in `role="img"` makes Recharts' tooltip stop working with the mouse (it should not — if it does, report instead of removing the role).
- A required key already exists in a locale file with a different meaning.

## Maintenance notes

- Every new chart needs a `label`; TypeScript enforces it. Keep the label equal to the card title.
- The data table is capped at 36 rows so a year of daily Trading 212 history does not produce a huge table; the summary still covers the full range.
- Reviewer: read one chart's summary in Portuguese and English to check the wording; confirm the table is collapsed by default.
