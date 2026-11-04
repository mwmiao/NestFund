import { rateLimited } from '@/lib/rate-limit';
import type { NextRequest } from 'next/server';
import { appVersion, buildBackupFile, readBackupData } from '@/lib/backup';
import { toCsv } from '@/lib/csv';
import { isISODate } from '@/lib/dates';
import { accountBalances } from '@/lib/repo';
import { CSV_COLUMNS } from '@/lib/tx-csv';
import { ACCOUNT_IDS, ACCOUNTS } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LIMIT = { name: 'export-backup', max: 30, windowMs: 60_000 };

/** Prevents spreadsheet formula injection when a CSV is opened in Excel/LibreOffice. */
import { neutralizeFormula } from '@/lib/security';
const safe = (v: string | null | undefined) => (v ? neutralizeFormula(v) : '');
const num = (v: number | null | undefined) => (v == null ? '' : v.toFixed(2));

const DATASETS = ['transactions', 'accounts', 'snapshots', 'categories', 'budgets', 'goals', 't212'] as const;
type Dataset = (typeof DATASETS)[number];

/**
 * GET /api/backup/export?format=json                       complete backup (JSON)
 *     &from=YYYY-MM-DD&to=YYYY-MM-DD                        limits dated records (transactions, balance check-ins, month budgets, Trading 212 days)
 *     ?format=csv&dataset=transactions|accounts|snapshots|categories|budgets|goals|t212
 * Trading 212 API keys are never included.
 */
export function GET(req: NextRequest) {
  const limited = rateLimited(req, LIMIT.name, LIMIT.max, LIMIT.windowMs);
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const period = { from: isISODate(from) ? from : null, to: isISODate(to) ? to : null };
  const hasPeriod = !!(period.from || period.to);
  const suffix = hasPeriod ? `${period.from ?? 'start'}_${period.to ?? 'now'}` : 'complete';
  const file = (body: string, type: string, name: string) =>
    new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });

  if (sp.get('format') !== 'csv') {
    return file(JSON.stringify(buildBackupFile(period, appVersion()), null, 2), 'application/json', `nestfund-backup-${suffix}.json`);
  }

  const dataset = (DATASETS as readonly string[]).includes(sp.get('dataset') ?? '') ? (sp.get('dataset') as Dataset) : 'transactions';
  const data = readBackupData(hasPeriod ? period : null);
  const catName = new Map(data.categories.map((c) => [c.ref, c.key ?? c.name]));
  const cat = (ref: string | null) => (ref ? safe(catName.get(ref) ?? ref) : '');
  let rows: (string | number)[][] = [];

  switch (dataset) {
    case 'transactions':
      // Same columns the CSV import reads, so an export can be imported again.
      rows = [
        [...CSV_COLUMNS],
        ...data.transactions.map((t) => [t.date, t.type, num(t.amount), safe(t.description), cat(t.category), safe(t.subcategory), t.account, t.toAccount ?? '', t.paymentMethod, safe(t.merchant), safe(t.notes), t.recurring ? '1' : '0', t.recurrence ?? '']),
      ];
      break;
    case 'accounts': {
      const balances = accountBalances();
      rows = [['account', 'name', 'balance', 'invested', 'last_check_in'], ...ACCOUNT_IDS.map((id) => [id, ACCOUNTS[id].name, num(balances[id].balance), num(balances[id].invested), balances[id].since ?? ''])];
      break;
    }
    case 'snapshots':
      rows = [['date', 'account', 'value', 'invested', 'notes'], ...data.snapshots.map((s) => [s.date, s.account, num(s.value), num(s.invested), safe(s.notes)])];
      break;
    case 'categories':
      rows = [['key', 'name', 'kind', 'color', 'monthly_budget', 'builtin'], ...data.categories.map((c) => [c.key ?? '', safe(c.name), c.kind, c.color, num(c.monthlyBudget), c.builtin ? '1' : '0'])];
      break;
    case 'budgets': {
      const line = (scope: string, i: { name: string; kind: string; amount: number; category: string | null; account: string | null }) => [scope, safe(i.name), i.kind, num(i.amount), cat(i.category), i.account ?? ''];
      rows = [
        ['scope', 'name', 'kind', 'amount', 'category', 'account', 'income', 'extra_income', 'meal_card'],
        ...data.budgetItems.map((i) => [...line('template', i), '', '', '']),
        ...data.monthBudgets.flatMap((m) => [
          ['month:' + m.month, 'TOTALS', '', '', '', '', num(m.income), num(m.extraIncome), num(m.mealCard)],
          ...m.items.map((i) => [...line('month:' + m.month, i), '', '', '']),
        ]),
      ];
      break;
    }
    case 'goals':
      rows = [['kind', 'name', 'target', 'current_manual', 'monthly', 'target_date', 'account'], ...data.goals.map((g) => [g.kind, safe(g.name), num(g.target), num(g.current), num(g.monthly), g.targetDate ?? '', g.account ?? ''])];
      break;
    case 't212':
      rows = [['date', 'total_value', 'invested', 'cash', 'unrealized', 'growth_pct', 'currency'], ...data.t212History.map((d) => [d.date, num(d.totalValue), num(d.invested), num(d.cash), num(d.unrealized), d.growthPct, d.currency])];
      break;
  }
  // BOM so Excel opens UTF-8 (accents) correctly.
  return file('﻿' + toCsv(rows), 'text/csv', `nestfund-${dataset}-${suffix}.csv`);
}
