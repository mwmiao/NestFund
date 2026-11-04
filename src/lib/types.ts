// Domain types. All monetary values are euros (number) in the app layer;
// the database stores integer cents and the repository converts at the boundary.

export const TX_TYPES = ['purchase', 'expense', 'payment', 'income', 'transfer'] as const;
export type TxType = (typeof TX_TYPES)[number];

/**
 * Where the money lives. Each account has a single purpose:
 * Banco CTT = salary/day-to-day, Revolut = leisure, Trading 212 = ETF only,
 * Trade Republic = untouchable savings (emergency + house), meal card = food only.
 */
export const ACCOUNT_IDS = ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card', 'cash', 'other'] as const;
export type AccountId = (typeof ACCOUNT_IDS)[number];

export type AccountRole = 'salary' | 'leisure' | 'etf' | 'savings' | 'meal' | 'cash' | 'other';

export interface AccountMeta {
  id: AccountId;
  name: string; // product names are not translated
  role: AccountRole;
  color: string;
  /** Shown on the dashboard as a balance card. */
  primary: boolean;
}

export const ACCOUNTS: Record<AccountId, AccountMeta> = {
  ctt: { id: 'ctt', name: 'Banco CTT', role: 'salary', color: '#e11d48', primary: true },
  revolut: { id: 'revolut', name: 'Revolut', role: 'leisure', color: '#3b82f6', primary: true },
  trading212: { id: 'trading212', name: 'Trading 212', role: 'etf', color: '#06b6d4', primary: true },
  traderepublic: { id: 'traderepublic', name: 'Trade Republic', role: 'savings', color: '#a855f7', primary: true },
  meal_card: { id: 'meal_card', name: 'Cartão de refeição', role: 'meal', color: '#f59e0b', primary: true },
  cash: { id: 'cash', name: 'Dinheiro', role: 'cash', color: '#84cc16', primary: false },
  other: { id: 'other', name: 'Outro', role: 'other', color: '#71717a', primary: false },
};

/** Accounts whose money is a contribution (investment / long-term savings), never spending money. */
export const CONTRIBUTION_ACCOUNTS: ReadonlySet<AccountId> = new Set(['trading212', 'traderepublic']);

export const PAYMENT_METHODS = ['card', 'mbway', 'transfer', 'direct_debit', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECURRENCES = ['monthly', 'quarterly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** `salary` income replaces the month's planned salary with the real amount received. */
export const CATEGORY_KINDS = ['expense', 'investment', 'savings', 'income', 'salary'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const BUDGET_ITEM_KINDS = ['fixed', 'variable', 'leisure', 'etf', 'savings'] as const;
export type BudgetItemKind = (typeof BUDGET_ITEM_KINDS)[number];

export const GOAL_KINDS = ['emergency', 'house', 'fire', 'custom'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export interface Category {
  id: number;
  /** Stable key for built-in categories (translated in the UI); null for custom ones. */
  key: string | null;
  name: string;
  color: string;
  kind: CategoryKind;
  monthlyBudget: number | null;
  builtin: boolean;
}

export interface Transaction {
  id: number;
  date: string; // YYYY-MM-DD
  amount: number; // always positive; direction comes from `type`
  type: TxType;
  description: string;
  categoryId: number | null;
  subcategory: string | null;
  account: AccountId; // source account (destination for income)
  toAccount: AccountId | null; // destination, transfers only
  paymentMethod: PaymentMethod;
  merchant: string | null;
  notes: string | null;
  attachment: string | null;
  recurring: boolean;
  recurrence: Recurrence | null;
  parentId: number | null;
  /** When the record was logged (UTC, 'YYYY-MM-DD HH:MM:SS'). */
  createdAt?: string | null;
}

export interface BudgetItem {
  id: number;
  name: string;
  kind: BudgetItemKind;
  amount: number;
  categoryId: number | null;
  /** Account the line is paid from (fixed) or transferred to (leisure/ETF/savings). */
  account: AccountId | null;
  startMonth: string | null; // YYYY-MM
  endMonth: string | null; // YYYY-MM
}

export interface MonthBudget {
  month: string; // YYYY-MM
  income: number; // planned net salary (duodécimos, transport allowance included)
  extraIncome: number; // e.g. bonus
  mealCard: number; // separate, never counted as available cash
  items: BudgetItem[];
  notes: string | null;
}

export interface Goal {
  id: number;
  kind: GoalKind;
  name: string;
  target: number;
  current: number; // manual amount, used when no account is linked
  monthly: number;
  targetDate: string | null; // YYYY-MM
  color: string;
  /** When set, progress comes from this account's balance (shared in goal order). */
  account: AccountId | null;
}

/** A balance check-in for an account. For Trading 212, `invested` is the cost basis. */
export interface Snapshot {
  id: number;
  date: string;
  account: AccountId;
  value: number;
  invested: number;
  notes: string | null;
  /** When the balance was recorded; movements on the same day logged afterwards still count. */
  createdAt?: string | null;
}

export interface Profile {
  incomeMin: number;
  incomeMax: number;
  defaultIncome: number;
  mealCard: number;
  transportAllowance: number;
  annualBonus: number;
  /** Day of the month salary / meal card are paid (moved back to the previous business day when not one). */
  salaryPayDay: number;
  mealPayDay: number;
}

/** Manually entered income of one month. Its existence means "the user has defined this month's income". */
export interface MonthIncome {
  month: string;
  normalDays: number;
  holidayDays: number;
  salaryPerDay: number | null;
  mealPerDay: number | null;
  salaryConfirmed: boolean;
  mealConfirmed: boolean;
  /** The forecast that was replaced by the real amount (null when none was entered before confirming). */
  expectedSalary: number | null;
  expectedMeal: number | null;
  salaryExpectedDate: string | null;
  salaryPaidDate: string | null;
  mealExpectedDate: string | null;
  mealPaidDate: string | null;
}

/** Purchases, expenses and payments leave the account; income and transfers are handled separately. */
export const isSpending = (type: TxType) => type === 'purchase' || type === 'expense' || type === 'payment';
