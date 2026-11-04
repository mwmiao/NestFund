import 'server-only';
import { dataVersion } from './cache';
import { fromCents as e, getDb, toCents as c } from './db';
import { todayISO } from './dates';
import {
  DEFAULT_INTEREST_CONFIG,
  buildDeltas,
  creditDateFor,
  interestOverview,
  monthEnd,
  monthStatement,
  nextMonth,
  type BalanceDelta,
  type InterestConfig,
  type InterestOverview,
  type MonthStatement,
} from './interest';
import type { AccountId } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** The only account that earns interest. */
export const INTEREST_ACCOUNT: AccountId = 'traderepublic';

// ---------------------------------------------------------------- settings

const clamp = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);

export function getInterestConfig(): InterestConfig {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'interest'").get() as Row | undefined;
  let raw: Record<string, unknown> = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  const d = DEFAULT_INTEREST_CONFIG;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    annualRate: clamp(raw.annualRate, 0, 0.2, d.annualRate),
    taxRate: clamp(raw.taxRate, 0, 0.6, d.taxRate),
    depositLagDays: Math.round(clamp(raw.depositLagDays, 0, 3, d.depositLagDays)),
    withdrawalLagDays: Math.round(clamp(raw.withdrawalLagDays, 0, 3, d.withdrawalLagDays)),
  };
}

export function saveInterestConfig(cfg: InterestConfig) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('interest', ?)").run(JSON.stringify(cfg));
}

// ---------------------------------------------------------------- stored credits

export interface InterestCredit extends MonthStatement {
  annualRate: number;
  taxRate: number;
}

const mapCredit = (r: Row): InterestCredit => ({
  month: r.month,
  creditDate: r.credit_date,
  days: Number(monthEnd(r.month).slice(8)),
  opening: e(r.opening),
  deposits: e(r.deposits),
  withdrawals: e(r.withdrawals),
  gross: e(r.gross),
  tax: e(r.tax),
  net: e(r.net),
  closing: e(r.closing),
  annualRate: r.annual_rate,
  taxRate: r.tax_rate,
});

/** Monthly credits already booked, newest first. */
export function listInterestCredits(limit = 24): InterestCredit[] {
  return (getDb().prepare('SELECT * FROM interest_credits WHERE account = ? ORDER BY month DESC LIMIT ?').all(INTEREST_ACCOUNT, limit) as Row[]).map(mapCredit);
}

// ---------------------------------------------------------------- history -> deltas

/** Balance changes of the interest account built from its check-ins, transactions and booked credits. */
export function loadDeltas(): BalanceDelta[] {
  const db = getDb();
  const snaps = (db.prepare('SELECT account, date, value, created_at FROM snapshots WHERE account = ?').all(INTEREST_ACCOUNT) as Row[]).map((r) => ({
    account: r.account as string,
    date: r.date as string,
    value: e(r.value),
    createdAt: r.created_at as string | null,
  }));
  const txs = (db.prepare('SELECT date, amount, type, account, to_account, created_at FROM transactions WHERE account = ? OR to_account = ?').all(INTEREST_ACCOUNT, INTEREST_ACCOUNT) as Row[]).map((r) => ({
    date: r.date as string,
    amount: e(r.amount),
    type: r.type,
    account: r.account,
    toAccount: r.to_account,
    createdAt: r.created_at as string | null,
  }));
  const credits = (db.prepare('SELECT credit_date, net FROM interest_credits WHERE account = ?').all(INTEREST_ACCOUNT) as Row[]).map((r) => ({ creditDate: r.credit_date as string, net: e(r.net) }));
  return buildDeltas(INTEREST_ACCOUNT, snaps as never, txs as never, credits);
}

// ---------------------------------------------------------------- monthly credit

let lastChecked = '';

/**
 * Books the interest of every finished month that has no credit yet (one row per account and month, created at most once:
 * UNIQUE(account, month) + INSERT OR IGNORE make a refresh, a restart or a second request harmless).
 * Months are only ever added; existing credits, transactions and balances are never edited here.
 */
export function materializeInterest(today = todayISO()): number {
  const cfg = getInterestConfig();
  if (!cfg.enabled) return 0;
  const db = getDb();
  // Cheap guard: nothing can be due unless the data or the date changed since the last look.
  const stamp = `${dataVersion()}|${today}|${JSON.stringify(cfg)}`;
  if (stamp === lastChecked) return 0;

  const first = (db
    .prepare('SELECT MIN(d) AS d FROM (SELECT MIN(date) AS d FROM snapshots WHERE account = ? UNION ALL SELECT MIN(date) FROM transactions WHERE account = ? OR to_account = ?)')
    .get(INTEREST_ACCOUNT, INTEREST_ACCOUNT, INTEREST_ACCOUNT) as Row).d as string | null;
  let booked = 0;
  if (first) {
    const have = new Set((db.prepare('SELECT month FROM interest_credits WHERE account = ?').all(INTEREST_ACCOUNT) as Row[]).map((r) => r.month as string));
    const insert = db.prepare(
      `INSERT OR IGNORE INTO interest_credits (account, month, credit_date, opening, deposits, withdrawals, gross, tax, net, closing, annual_rate, tax_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      for (let month = first.slice(0, 7); creditDateFor(month) <= today; month = nextMonth(month)) {
        if (have.has(month)) continue;
        // Rebuilt every time so a credit booked a moment ago is part of the next month's balance.
        const st = monthStatement(loadDeltas(), month, cfg);
        const info = insert.run(INTEREST_ACCOUNT, month, st.creditDate, c(st.opening), c(st.deposits), c(st.withdrawals), c(st.gross), c(st.tax), c(st.net), c(st.closing), cfg.annualRate, cfg.taxRate);
        booked += info.changes;
      }
    })();
  }
  lastChecked = `${dataVersion()}|${today}|${JSON.stringify(cfg)}`;
  return booked;
}

// ---------------------------------------------------------------- what the page shows

export interface InterestView {
  config: InterestConfig;
  overview: InterestOverview | null;
  credits: InterestCredit[];
}

export function interestView(today = todayISO()): InterestView {
  const config = getInterestConfig();
  materializeInterest(today);
  return { config, overview: config.enabled ? interestOverview(loadDeltas(), today, config) : null, credits: listInterestCredits() };
}

