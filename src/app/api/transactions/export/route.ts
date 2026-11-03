import type { NextRequest } from 'next/server';
import { toCsv } from '@/lib/csv';
import { CSV_COLUMNS } from '@/lib/csv-import';
import { listCategories, listTransactions } from '@/lib/repo';
import { parseTxFilters } from '@/lib/tx-filters';

export const dynamic = 'force-dynamic';

/** Prevents spreadsheet formula injection when the CSV is opened in Excel/LibreOffice. */
const safe = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function GET(req: NextRequest) {
  const filters = parseTxFilters(Object.fromEntries(req.nextUrl.searchParams));
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const rows = listTransactions(filters).map((t) => {
    const cat = t.categoryId != null ? cats.get(t.categoryId) : undefined;
    return [
      t.date,
      t.type,
      t.amount.toFixed(2),
      safe(t.description),
      cat ? (cat.key ?? safe(cat.name)) : '',
      safe(t.subcategory),
      t.account,
      t.toAccount,
      t.paymentMethod,
      safe(t.merchant),
      safe(t.notes),
      t.recurring ? '1' : '0',
      t.recurrence,
    ];
  });
  // BOM so Excel opens UTF-8 (accents) correctly.
  const csv = '﻿' + toCsv([[...CSV_COLUMNS], ...rows]);
  const suffix = filters.month ?? filters.year ?? 'all';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nestfund-transactions-${suffix}.csv"`,
    },
  });
}
