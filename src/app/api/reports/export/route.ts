import { rateLimited } from '@/lib/rate-limit';
import type { NextRequest } from 'next/server';
import { toCsv } from '@/lib/csv';
import { listCategories } from '@/lib/repo';
import { buildReport, parseReportFilters } from '@/lib/reports';

export const dynamic = 'force-dynamic';

const LIMIT = { name: 'export-report', max: 30, windowMs: 60_000 };

/** Prevents spreadsheet formula injection when the CSV is opened in Excel/LibreOffice. */
import { neutralizeFormula } from '@/lib/security';
const safe = (v: string | null) => (v ? neutralizeFormula(v) : v);

/**
 * Report as one tidy CSV (section, label, amount, count, extra) so it opens cleanly in Excel or Numbers.
 * Uses exactly the same filters and numbers as the Reports page.
 */
export function GET(req: NextRequest) {
  const limited = rateLimited(req, LIMIT.name, LIMIT.max, LIMIT.windowMs);
  if (limited) return limited;
  const filters = parseReportFilters(Object.fromEntries(req.nextUrl.searchParams));
  const r = buildReport(filters);
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const catLabel = (id: number | null) => {
    const c = id != null ? cats.get(id) : undefined;
    return c ? (c.key ?? safe(c.name)) : '';
  };
  const period = filters.year ?? filters.month ?? '';
  const prevPeriod = r.previous.year ?? r.previous.month ?? '';
  const num = (v: number) => v.toFixed(2);

  const rows: (string | number | null)[][] = [['section', 'label', 'amount', 'count', 'extra']];
  const total = (label: string, p: string, t: typeof r.totals) => {
    rows.push(['summary', `${label}:spent`, num(t.spent), t.count, p]);
    rows.push(['summary', `${label}:bank`, num(t.bank), '', p]);
    rows.push(['summary', `${label}:meal_card`, num(t.meal), '', p]);
    rows.push(['summary', `${label}:income`, num(t.income), '', p]);
  };
  total('period', period, r.totals);
  total('previous', prevPeriod, r.previousTotals);

  const spentTotal = r.totals.spent || 1;
  for (const c of r.byCategory) rows.push(['category', catLabel(c.categoryId), num(c.total), c.count, `${((c.total / spentTotal) * 100).toFixed(1)}%`]);
  r.topCategories.forEach((c, i) => rows.push(['top_category', catLabel(c.categoryId), num(c.total), c.count, i + 1]));
  for (const b of r.budget) rows.push(['planned_vs_actual', catLabel(b.categoryId), num(b.spent), '', `planned=${num(b.planned)}`]);
  r.topStores.forEach((s, i) => rows.push(['top_store', safe(s.label), num(s.total), s.count, i + 1]));
  for (const c of r.contributions) {
    rows.push(['contribution', 'trading212', num(c.trading212), '', c.month]);
    rows.push(['contribution', 'traderepublic', num(c.traderepublic), '', c.month]);
  }
  for (const p of r.trading212) rows.push(['trading212_value', p.date, num(p.value), '', `invested=${num(p.invested)}`]);
  for (const p of r.traderepublic) rows.push(['traderepublic_balance', p.date, num(p.value), '', '']);

  // BOM so Excel opens UTF-8 (accents) correctly.
  const csv = '﻿' + toCsv(rows);
  const parts = [period || 'all', filters.account, filters.categoryId ? `cat${filters.categoryId}` : null].filter(Boolean).join('-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nestfund-report-${parts}.csv"`,
    },
  });
}
