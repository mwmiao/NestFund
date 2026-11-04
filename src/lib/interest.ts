// Interest on the Trade Republic cash account. Pure functions (no I/O), so every rule below is covered by tests.
//
// How the real account works, as modelled here:
//  - A gross annual rate (3 %, not net) applied DAILY on the balance, with a 365-day year.
//  - IRS (28 %) is withheld from the interest, so the net daily interest is gross × (1 − 0.28).
//  - Interest is only CREDITED once a month (on the 1st of the next month). Until then it is not part of the balance,
//    so there is no interest on interest inside a month.
//  - A deposit starts earning the day after (configurable); money leaving stops earning on the day it leaves (configurable).
import { accountDelta } from './calc';
import { round2 } from './format';
import type { AccountId, Transaction } from './types';

export interface InterestConfig {
  enabled: boolean;
  /** Gross annual rate as a decimal: 0.03 = 3 %. */
  annualRate: number;
  /** IRS withheld on the interest: 0.28 = 28 %. */
  taxRate: number;
  /** Days after a deposit before it earns (1 = from the next day). */
  depositLagDays: number;
  /** Days after a withdrawal until the money stops earning (0 = it stops the day it leaves). */
  withdrawalLagDays: number;
}

export const DEFAULT_INTEREST_CONFIG: InterestConfig = { enabled: true, annualRate: 0.03, taxRate: 0.28, depositLagDays: 1, withdrawalLagDays: 0 };

/** Day-count basis used by Trade Republic. */
export const DAYS_IN_YEAR = 365;

export interface BalanceDelta {
  /** YYYY-MM-DD */
  date: string;
  /** Signed change of the balance. */
  amount: number;
  /** 'credit' = interest credited by the app/bank; it earns from its own date, without a deposit lag. */
  kind: 'move' | 'credit';
}

// ---------------------------------------------------------------- dates

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
export const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
/** The day interest earned in `month` is credited: the 1st of the following month. */
export const creditDateFor = (month: string) => monthStart(nextMonth(month));

// ---------------------------------------------------------------- daily interest

/** Gross interest for one day on `balance`. */
export const dailyGross = (balance: number, cfg: Pick<InterestConfig, 'annualRate'>) => (balance > 0 ? (balance * cfg.annualRate) / DAYS_IN_YEAR : 0);
/** Net of IRS. */
export const netOfTax = (gross: number, cfg: Pick<InterestConfig, 'taxRate'>) => gross * (1 - cfg.taxRate);

/**
 * Several movements on the same day count as one: what matters is whether the day ended with more or less money.
 * (Depositing and withdrawing the same amount on one day changes nothing; it is not "a withdrawal that stops earning
 * today plus a deposit that starts tomorrow".) Credits are kept apart.
 */
function normalize(deltas: BalanceDelta[]): BalanceDelta[] {
  const moves = new Map<string, number>();
  const out: BalanceDelta[] = [];
  for (const d of deltas) {
    if (d.kind === 'credit') out.push(d);
    else moves.set(d.date, (moves.get(d.date) ?? 0) + d.amount);
  }
  for (const [date, amount] of moves) if (Math.abs(amount) >= 0.005) out.push({ date, amount, kind: 'move' });
  return out;
}

/** The date from which a movement counts towards the interest base. */
function effectiveDate(d: BalanceDelta, cfg: InterestConfig): string {
  const lag = d.kind === 'credit' ? 0 : d.amount >= 0 ? cfg.depositLagDays : cfg.withdrawalLagDays;
  return addDays(d.date, lag);
}

export interface DayAccrual {
  date: string;
  /** Money that earns interest on this day. */
  base: number;
  gross: number;
}

/** Interest earned on each day of [from, to] (inclusive), from the movements known so far. Not rounded. */
export function dailyAccruals(deltas: BalanceDelta[], from: string, to: string, cfg: InterestConfig): DayAccrual[] {
  const effective = normalize(deltas)
    .map((d) => ({ at: effectiveDate(d, cfg), amount: d.amount }))
    .sort((a, b) => a.at.localeCompare(b.at));
  let i = 0;
  let base = 0;
  const out: DayAccrual[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    while (i < effective.length && effective[i].at <= day) base += effective[i++].amount;
    // Earlier days (before `from`) are folded into the base by the loop above on the first iteration.
    out.push({ date: day, base: Math.max(base, 0), gross: dailyGross(base, cfg) });
  }
  return out;
}

/** Money earning interest on `date`. */
export function baseOn(deltas: BalanceDelta[], date: string, cfg: InterestConfig): number {
  return dailyAccruals(deltas, date, date, cfg)[0].base;
}

// ---------------------------------------------------------------- monthly statement

export interface MonthStatement {
  month: string;
  /** When the net interest is credited. */
  creditDate: string;
  days: number;
  /** Balance at the start of the month (including interest credited that day for the month before). */
  opening: number;
  deposits: number;
  withdrawals: number;
  gross: number;
  /** IRS withheld. */
  tax: number;
  net: number;
  /** Opening + deposits − withdrawals + net interest. */
  closing: number;
}

/**
 * The statement of one month: interest accrued daily on the balance, rounded once at the end of the month
 * (gross to the cent, tax to the cent, net = gross − tax), as it would be credited on `creditDate`.
 */
export function monthStatement(deltas: BalanceDelta[], month: string, cfg: InterestConfig): MonthStatement {
  const start = monthStart(month);
  const end = monthEnd(month);
  const days = dailyAccruals(deltas, start, end, cfg);
  const gross = round2(days.reduce((s, d) => s + d.gross, 0));
  const tax = round2(gross * cfg.taxRate);
  const net = round2(gross - tax);

  let opening = 0;
  let deposits = 0;
  let withdrawals = 0;
  // The statement lists every real movement (the day-netting above is only for the interest base).
  for (const d of deltas) {
    if (d.kind === 'credit') {
      if (d.date <= start) opening += d.amount; // credited on the 1st: it closes the previous month
    } else if (d.date < start) opening += d.amount;
    else if (d.date <= end) {
      if (d.amount >= 0) deposits += d.amount;
      else withdrawals += -d.amount;
    }
  }
  opening = round2(opening);
  deposits = round2(deposits);
  withdrawals = round2(withdrawals);
  return { month, creditDate: creditDateFor(month), days: days.length, opening, deposits, withdrawals, gross, tax, net, closing: round2(opening + deposits - withdrawals + net) };
}

// ---------------------------------------------------------------- what the app shows

export interface InterestOverview {
  today: string;
  /** Money earning today / from tomorrow (a deposit made today only earns from tomorrow). */
  baseToday: number;
  baseTomorrow: number;
  dailyGrossToday: number;
  dailyNetToday: number;
  dailyGrossTomorrow: number;
  dailyNetTomorrow: number;
  /** This month's interest from the 1st up to and including today. */
  accruedGross: number;
  accruedNet: number;
  /** The whole month if nothing else changes: what will be credited. */
  monthGross: number;
  monthTax: number;
  monthNet: number;
  creditDate: string;
  /** Days from today to the credit date. */
  daysToCredit: number;
  /** Days of interest still to accrue this month, today included. */
  remainingDays: number;
  /** Net interest still to accrue from today to the end of the month. */
  remainingNet: number;
}

export function interestOverview(deltas: BalanceDelta[], today: string, cfg: InterestConfig): InterestOverview {
  const month = today.slice(0, 7);
  const start = monthStart(month);
  const end = monthEnd(month);
  const tomorrow = addDays(today, 1);
  const baseToday = baseOn(deltas, today, cfg);
  const baseTomorrow = baseOn(deltas, tomorrow, cfg);

  const upToToday = dailyAccruals(deltas, start, today, cfg);
  const accruedGross = round2(upToToday.reduce((s, d) => s + d.gross, 0));
  const accruedNet = round2(accruedGross - round2(accruedGross * cfg.taxRate));
  const statement = monthStatement(deltas, month, cfg);
  const remaining = dailyAccruals(deltas, today, end, cfg);
  const remainingGross = round2(remaining.reduce((s, d) => s + d.gross, 0));

  return {
    today,
    baseToday,
    baseTomorrow,
    dailyGrossToday: dailyGross(baseToday, cfg),
    dailyNetToday: netOfTax(dailyGross(baseToday, cfg), cfg),
    dailyGrossTomorrow: dailyGross(baseTomorrow, cfg),
    dailyNetTomorrow: netOfTax(dailyGross(baseTomorrow, cfg), cfg),
    accruedGross,
    accruedNet,
    monthGross: statement.gross,
    monthTax: statement.tax,
    monthNet: statement.net,
    creditDate: statement.creditDate,
    daysToCredit: daysBetween(today, statement.creditDate),
    remainingDays: remaining.length,
    remainingNet: round2(remainingGross - round2(remainingGross * cfg.taxRate)),
  };
}

// ---------------------------------------------------------------- building the movement history

type SnapshotLike = { account: string; date: string; value: number; createdAt?: string | null };
type TxLike = Pick<Transaction, 'amount' | 'type' | 'account' | 'toAccount' | 'date' | 'createdAt'>;
export interface CreditLike {
  creditDate: string;
  net: number;
}

/**
 * Turns the account's history into balance changes. A balance check-in (what the Trade Republic app shows) is treated
 * as a correction to whatever the app had worked out, so real figures always win and nothing is double counted.
 * Same-day ordering mirrors accountBalance(): a movement logged after a check-in on the same day comes after it.
 */
export function buildDeltas(account: AccountId, snapshots: SnapshotLike[], txs: TxLike[], credits: CreditLike[]): BalanceDelta[] {
  type Ev = { date: string; key: string; kind: 'snap' | 'tx' | 'credit'; value: number };
  const events: Ev[] = [];
  for (const s of snapshots) if (s.account === account) events.push({ date: s.date, key: s.createdAt ?? '￿', kind: 'snap', value: s.value });
  for (const t of txs) {
    const d = accountDelta(t, account);
    if (d !== 0) events.push({ date: t.date, key: t.createdAt ?? '', kind: 'tx', value: d });
  }
  for (const c of credits) events.push({ date: c.creditDate, key: '', kind: 'credit', value: c.net });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

  const out: BalanceDelta[] = [];
  let balance = 0;
  for (const e of events) {
    if (e.kind === 'snap') {
      const diff = round2(e.value - balance);
      if (Math.abs(diff) >= 0.005) out.push({ date: e.date, amount: diff, kind: 'move' });
      balance = e.value;
    } else {
      out.push({ date: e.date, amount: e.value, kind: e.kind === 'credit' ? 'credit' : 'move' });
      balance += e.value;
    }
  }
  return out;
}
