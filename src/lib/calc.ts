// Pure financial calculations. No I/O here so everything is unit-testable
// and can run both on the server and in client-side simulators.

import { addMonths, monthsBetween } from './dates';
import { round2 } from './format';
import type { AccountId, BudgetItem, Category, Goal, MonthBudget, Snapshot, Transaction } from './types';
import { CONTRIBUTION_ACCOUNTS, isSpending } from './types';

// ---------------------------------------------------------------------------
// Remunerated savings account (house down payment / emergency reserve)
// ---------------------------------------------------------------------------

export interface InterestTier {
  /** Upper bound of the balance slice in euros; null means "no limit". */
  upTo: number | null;
  /** Annual nominal rate (TANB) as a decimal, e.g. 0.03. */
  rate: number;
}

/** TANB escalonada: 3% até 50.000 €, 2,5% acima. */
export const DEFAULT_TIERS: InterestTier[] = [
  { upTo: 50_000, rate: 0.03 },
  { upTo: null, rate: 0.025 },
];

/** IRS withholding on interest (taxa liberatória). */
export const INTEREST_TAX_RATE = 0.28;

/** Gross interest for one month on `balance`, applying each tier to its slice of the balance. */
export function grossMonthlyInterest(balance: number, tiers: InterestTier[] = DEFAULT_TIERS): number {
  let remaining = Math.max(balance, 0);
  let lowerBound = 0;
  let interest = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const sliceSize = tier.upTo == null ? remaining : Math.max(tier.upTo - lowerBound, 0);
    const slice = Math.min(remaining, sliceSize);
    interest += (slice * tier.rate) / 12;
    remaining -= slice;
    if (tier.upTo != null) lowerBound = tier.upTo;
  }
  return interest;
}

export interface HouseSimInput {
  housePrice: number;
  downPaymentPct: number; // decimal, e.g. 0.10
  purchaseCostsPct: number; // decimal, IMT + Imposto do Selo + escritura/registos
  monthlyContribution: number;
  annualBonus: number; // added at the end of every 12th month
  initialBalance: number;
  tiers?: InterestTier[];
  taxRate?: number;
  years: number;
}

export interface SavingsPoint {
  month: number;
  deposited: number; // initial balance + contributions + bonuses
  interest: number; // cumulative net interest (after IRS)
  balance: number;
}

export interface HouseSimResult {
  downPayment: number;
  purchaseCosts: number;
  target: number;
  points: SavingsPoint[];
  /** First month in which the balance covers the target, or null if not reached in the horizon. */
  monthsToTarget: number | null;
}

/**
 * Monthly compounding: each month earns tiered interest on the opening balance,
 * 28% IRS is withheld, then the monthly contribution (and yearly bonus) is deposited.
 */
export function simulateHouseSavings(input: HouseSimInput): HouseSimResult {
  const tiers = input.tiers ?? DEFAULT_TIERS;
  const taxRate = input.taxRate ?? INTEREST_TAX_RATE;
  const downPayment = input.housePrice * input.downPaymentPct;
  const purchaseCosts = input.housePrice * input.purchaseCostsPct;
  const target = downPayment + purchaseCosts;

  let balance = input.initialBalance;
  let deposited = input.initialBalance;
  let interest = 0;
  let monthsToTarget: number | null = balance >= target && target > 0 ? 0 : null;
  const points: SavingsPoint[] = [{ month: 0, deposited, interest: 0, balance }];

  const months = Math.max(0, Math.round(input.years * 12));
  for (let m = 1; m <= months; m++) {
    const net = grossMonthlyInterest(balance, tiers) * (1 - taxRate);
    interest += net;
    balance += net;
    let deposit = input.monthlyContribution;
    if (m % 12 === 0) deposit += input.annualBonus;
    balance += deposit;
    deposited += deposit;
    if (monthsToTarget === null && target > 0 && balance >= target) monthsToTarget = m;
    points.push({ month: m, deposited: round2(deposited), interest: round2(interest), balance: round2(balance) });
  }

  return { downPayment: round2(downPayment), purchaseCosts: round2(purchaseCosts), target: round2(target), points, monthsToTarget };
}

export function milestones<T extends { month: number }>(points: T[], years: number[]): (T & { years: number })[] {
  return years
    .map((y) => {
      const p = points.find((pt) => pt.month === y * 12);
      return p ? { ...p, years: y } : null;
    })
    .filter((p): p is T & { years: number } => p !== null);
}

// ---------------------------------------------------------------------------
// ETF projection
// ---------------------------------------------------------------------------

export interface EtfSimInput {
  monthlyContribution: number;
  currentValue: number;
  annualReturn: number; // decimal, nominal expected (not guaranteed)
  years: number;
}

export interface EtfPoint {
  month: number;
  contributed: number;
  value: number;
}

/** Converts the annual return into an equivalent monthly rate and compounds monthly (contribution at month end). */
export function simulateEtf(input: EtfSimInput): EtfPoint[] {
  const r = Math.pow(1 + input.annualReturn, 1 / 12) - 1;
  let value = input.currentValue;
  let contributed = input.currentValue;
  const points: EtfPoint[] = [{ month: 0, contributed, value }];
  const months = Math.max(0, Math.round(input.years * 12));
  for (let m = 1; m <= months; m++) {
    value = value * (1 + r) + input.monthlyContribution;
    contributed += input.monthlyContribution;
    points.push({ month: m, contributed: round2(contributed), value: round2(value) });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Budget, savings rate, goals, category totals
// ---------------------------------------------------------------------------

export function savingsRate(saved: number, income: number): number {
  if (income <= 0) return 0;
  return saved / income;
}

export interface GoalProgress {
  pct: number; // 0..1
  remaining: number;
  monthsLeft: number | null; // null when there is no monthly contribution
  projectedMonth: string | null; // YYYY-MM
  requiredMonthly: number | null; // to hit targetDate
  onTrack: boolean | null;
}

export function goalProgress(goal: Pick<Goal, 'target' | 'current' | 'monthly' | 'targetDate'>, fromMonth: string): GoalProgress {
  const pct = goal.target > 0 ? Math.min(Math.max(goal.current / goal.target, 0), 1) : 0;
  const remaining = round2(Math.max(goal.target - goal.current, 0));
  const monthsLeft = remaining === 0 ? 0 : goal.monthly > 0 ? Math.ceil(remaining / goal.monthly) : null;
  const projectedMonth = monthsLeft === null ? null : addMonths(fromMonth, monthsLeft);
  let requiredMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.targetDate) {
    const span = monthsBetween(fromMonth, goal.targetDate);
    requiredMonthly = remaining === 0 ? 0 : span > 0 ? round2(remaining / span) : remaining;
    onTrack = remaining === 0 ? true : projectedMonth !== null && projectedMonth <= goal.targetDate;
  }
  return { pct, remaining, monthsLeft, projectedMonth, requiredMonthly, onTrack };
}

/**
 * Splits an account balance across the goals linked to it, in goal order (waterfall):
 * e.g. Trade Republic fills the emergency fund first, the remainder counts toward the house.
 * The last goal linked to an account receives any surplus, so no money disappears from view.
 */
export function allocateGoals<G extends Pick<Goal, 'target' | 'current' | 'account'>>(goals: G[], balances: Partial<Record<AccountId, number>>): G[] {
  const left: Partial<Record<AccountId, number>> = {};
  for (const [k, v] of Object.entries(balances)) left[k as AccountId] = Math.max(v ?? 0, 0);
  const lastLinked = new Map<AccountId, number>();
  goals.forEach((g, i) => g.account && lastLinked.set(g.account, i));
  return goals.map((g, i) => {
    const available = g.account ? left[g.account] : undefined;
    if (!g.account || available === undefined) return g;
    const take = lastLinked.get(g.account) === i ? available : Math.min(available, g.target);
    left[g.account] = round2(available - take);
    return { ...g, current: round2(take) };
  });
}

// ---------------------------------------------------------------------------
// Accounts: balances and monthly movements
// ---------------------------------------------------------------------------

type TxLike = Pick<Transaction, 'amount' | 'type' | 'account' | 'toAccount' | 'date'>;

/** Signed effect of a transaction on one account (positive = money in). */
export function accountDelta(tx: TxLike, account: AccountId): number {
  if (tx.type === 'transfer') {
    let d = 0;
    if (tx.account === account) d -= tx.amount;
    if (tx.toAccount === account) d += tx.amount;
    return d;
  }
  if (tx.account !== account) return 0;
  return tx.type === 'income' ? tx.amount : isSpending(tx.type) ? -tx.amount : 0;
}

export interface AccountBalance {
  account: AccountId;
  balance: number;
  /** Cost basis (Trading 212): last recorded invested amount + net transfers in since. */
  invested: number;
  /** Date of the balance check-in used as the starting point, if any. */
  since: string | null;
}

/**
 * Balance = last recorded balance (snapshot) + every movement dated after it.
 * Without a snapshot, the balance is the sum of all movements.
 */
export function accountBalance(account: AccountId, snapshots: Pick<Snapshot, 'account' | 'date' | 'value' | 'invested'>[], txs: TxLike[]): AccountBalance {
  const snap = snapshots
    .filter((s) => s.account === account)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const after = snap ? txs.filter((t) => t.date > snap.date) : txs;
  let balance = snap?.value ?? 0;
  let invested = snap?.invested ?? 0;
  for (const t of after) {
    balance += accountDelta(t, account);
    if (t.type === 'transfer') invested += accountDelta(t, account);
  }
  return { account, balance: round2(balance), invested: round2(Math.max(invested, 0)), since: snap?.date ?? null };
}

export interface AccountMovements {
  account: AccountId;
  inflow: number;
  outflow: number;
  net: number;
  count: number;
}

export function monthMovements(account: AccountId, monthTxs: TxLike[]): AccountMovements {
  let inflow = 0;
  let outflow = 0;
  let count = 0;
  for (const t of monthTxs) {
    const d = accountDelta(t, account);
    if (d === 0) continue;
    count++;
    if (d > 0) inflow += d;
    else outflow -= d;
  }
  return { account, inflow: round2(inflow), outflow: round2(outflow), net: round2(inflow - outflow), count };
}

// ---------------------------------------------------------------------------
// Category totals and the monthly summary
// ---------------------------------------------------------------------------

export interface CategoryTotal {
  categoryId: number | null;
  total: number;
  count: number;
}

/** Sums spending per category, sorted by total descending. Meal-card spending is included unless excluded. */
export function totalsByCategory(
  txs: Pick<Transaction, 'amount' | 'type' | 'categoryId' | 'account'>[],
  opts: { excludeMealCard?: boolean; excludeCategoryIds?: Set<number> } = {},
): CategoryTotal[] {
  const map = new Map<number | null, CategoryTotal>();
  for (const tx of txs) {
    if (!isSpending(tx.type)) continue;
    if (opts.excludeMealCard && tx.account === 'meal_card') continue;
    if (tx.categoryId != null && opts.excludeCategoryIds?.has(tx.categoryId)) continue;
    const row = map.get(tx.categoryId) ?? { categoryId: tx.categoryId, total: 0, count: 0 };
    row.total += tx.amount;
    row.count += 1;
    map.set(tx.categoryId, row);
  }
  return [...map.values()].map((r) => ({ ...r, total: round2(r.total) })).sort((a, b) => b.total - a.total);
}

const sumKind = (items: BudgetItem[], kind: BudgetItem['kind']) => round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0));
const sum = (txs: { amount: number }[]) => round2(txs.reduce((s, t) => s + t.amount, 0));

export interface MonthSummary {
  plannedSalary: number;
  salaryReceived: number | null; // sum of "salary" income actually logged, if any
  salary: number; // received if logged, planned otherwise
  extraIncome: number;
  otherIncome: number; // other income transactions (e.g. a Vinted sale)
  income: number; // salary + extra + other income (never meal card)
  mealCard: number;
  mealCardSpent: number;
  mealCardLeft: number;
  fixed: number;
  variablePlanned: number;
  leisure: number;
  etf: number;
  savings: number;
  plannedAvailable: number; // income − every planned line
  manualSpent: number; // logged spending paid with salary money (not meal card, not investment/savings)
  variableSpent: number; // manualSpent minus categories already covered by fixed lines
  leisureSpent: number; // variable spending paid from Revolut (the leisure account)
  realAvailable: number; // income − fixed − ETF − savings − variableSpent
  etfTransferred: number; // actual transfers into Trading 212 this month
  savingsTransferred: number; // actual transfers into Trade Republic this month
  savingsTotal: number; // planned ETF + savings
  savingsRate: number;
  byCategory: CategoryTotal[]; // all spending incl. meal card, excl. contributions
  negativePlanned: boolean;
  negativeReal: boolean;
}

/**
 * Month summary used by the dashboard, budget and history pages.
 * - Meal-card spending shows in statistics but never reduces salary money.
 * - Transfers move money between accounts and are never spending; transfers into
 *   Trading 212 / Trade Republic are tracked as actual contributions.
 * - Income in a "salary" category replaces the planned salary (real vs planned).
 */
export function computeMonthSummary(budget: MonthBudget, txs: Transaction[], categories: Category[]): MonthSummary {
  const kindById = new Map(categories.map((c) => [c.id, c.kind]));
  const kindOf = (t: Transaction) => (t.categoryId != null ? kindById.get(t.categoryId) : undefined);
  const fixedCats = new Set(budget.items.filter((i) => i.kind === 'fixed' && i.categoryId != null).map((i) => i.categoryId as number));
  const coveredByFixed = (t: Transaction) => t.categoryId != null && fixedCats.has(t.categoryId);

  const fixed = sumKind(budget.items, 'fixed');
  const variablePlanned = sumKind(budget.items, 'variable');
  const leisure = sumKind(budget.items, 'leisure');
  const etf = sumKind(budget.items, 'etf');
  const savings = sumKind(budget.items, 'savings');

  const incomeTx = txs.filter((t) => t.type === 'income' && t.account !== 'meal_card');
  const salaryTx = incomeTx.filter((t) => kindOf(t) === 'salary');
  const salaryReceived = salaryTx.length ? sum(salaryTx) : null;
  const salary = salaryReceived ?? budget.income;
  const otherIncome = sum(incomeTx.filter((t) => kindOf(t) !== 'salary'));
  const income = round2(salary + budget.extraIncome + otherIncome);

  const spending = txs.filter((t) => isSpending(t.type));
  const mealCardSpent = sum(spending.filter((t) => t.account === 'meal_card'));
  const isContribution = (t: Transaction) => {
    const k = kindOf(t);
    return k === 'investment' || k === 'savings' || CONTRIBUTION_ACCOUNTS.has(t.account);
  };
  const salarySpending = spending.filter((t) => t.account !== 'meal_card' && !isContribution(t));
  const manualSpent = sum(salarySpending);
  const variableSpending = salarySpending.filter((t) => !coveredByFixed(t));
  const variableSpent = sum(variableSpending);
  const leisureSpent = sum(variableSpending.filter((t) => t.account === 'revolut'));

  const transfersTo = (a: AccountId) => sum(txs.filter((t) => t.type === 'transfer' && t.toAccount === a && t.account !== a));

  const plannedAvailable = round2(income - fixed - variablePlanned - leisure - etf - savings);
  const realAvailable = round2(income - fixed - etf - savings - variableSpent);
  const savingsTotal = round2(etf + savings);

  return {
    plannedSalary: budget.income,
    salaryReceived,
    salary,
    extraIncome: budget.extraIncome,
    otherIncome,
    income,
    mealCard: budget.mealCard,
    mealCardSpent,
    mealCardLeft: round2(budget.mealCard - mealCardSpent),
    fixed,
    variablePlanned,
    leisure,
    etf,
    savings,
    plannedAvailable,
    manualSpent,
    variableSpent,
    leisureSpent,
    realAvailable,
    etfTransferred: transfersTo('trading212'),
    savingsTransferred: transfersTo('traderepublic'),
    savingsTotal,
    savingsRate: savingsRate(savingsTotal, income),
    byCategory: totalsByCategory(spending.filter((t) => !isContribution(t))),
    negativePlanned: plannedAvailable < 0,
    negativeReal: realAvailable < 0,
  };
}

/** "Available to assign" for a given salary with the same planned lines — used for the 1.750 € vs 1.800 € comparison. */
export function availableForIncome(income: number, items: BudgetItem[]): number {
  return round2(income - items.reduce((s, i) => s + i.amount, 0));
}
