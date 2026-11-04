import 'server-only';
import { dictionaries } from '@/i18n/config';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, fromCents as e, getDb, toCents as c } from './db';
import { addMonthsToDate, currentMonth, isActiveInMonth, todayISO } from './dates';
import { DEFAULT_PROFILE, hasLegacySampleData, resetAllData } from './seed';
import { expectedPayDate } from './payday';
import { accountBalance, allocateGoals, type AccountBalance } from './calc';
import { memo } from './cache';
import { INTEREST_ACCOUNT, materializeInterest } from './interest-repo';
import { ACCOUNT_IDS } from './types';
import type {
  AccountId,
  BudgetItem,
  BudgetItemKind,
  Category,
  CategoryKind,
  Goal,
  GoalKind,
  MonthBudget,
  MonthIncome,
  PaymentMethod,
  Profile,
  Recurrence,
  Snapshot,
  Transaction,
  TxType,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

// ---------------------------------------------------------------- settings

export function getProfile(): Profile {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'profile'").get() as Row | undefined;
  return { ...DEFAULT_PROFILE, ...(row ? JSON.parse(row.value) : {}) };
}

export function saveProfile(p: Profile) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('profile', ?)").run(JSON.stringify(p));
}

// ---------------------------------------------------------------- onboarding / fresh start

export const ONBOARDING_STEPS = ['balances', 'income', 'fixed', 'goals'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  done: OnboardingStep[];
  dismissed: boolean;
}

export function getOnboarding(): OnboardingState {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'onboarding'").get() as Row | undefined;
  const parsed = row ? (JSON.parse(row.value) as Partial<OnboardingState>) : {};
  return { done: (parsed.done ?? []).filter((s) => ONBOARDING_STEPS.includes(s)), dismissed: !!parsed.dismissed };
}

export function updateOnboarding(patch: { complete?: OnboardingStep; dismissed?: boolean }) {
  const state = getOnboarding();
  if (patch.complete && !state.done.includes(patch.complete)) state.done.push(patch.complete);
  if (patch.dismissed !== undefined) state.dismissed = patch.dismissed;
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding', ?)").run(JSON.stringify(state));
}

/** Wipes every record and returns to the fresh-start state (schema and built-in categories are kept). */
export function resetData(): string {
  // Full copy first, so even a mistaken reset can be undone (restore = replace nestfund.db with this file).
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `nestfund-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  getDb().prepare('VACUUM INTO ?').run(backup);
  resetAllData(getDb());
  return backup;
}

export function hasSampleData(): boolean {
  return hasLegacySampleData(getDb());
}

// ---------------------------------------------------------------- categories

const mapCategory = (r: Row): Category => ({
  id: r.id,
  key: r.key,
  name: r.name,
  color: r.color,
  kind: r.kind as CategoryKind,
  monthlyBudget: r.monthly_budget == null ? null : e(r.monthly_budget),
  builtin: !!r.builtin,
});

export function listCategories(): Category[] {
  return memo('categories', () => (getDb().prepare('SELECT * FROM categories ORDER BY sort, name').all() as Row[]).map(mapCategory));
}

/** `name: null` on update keeps the stored name. */
export function upsertCategory(cat: Omit<Category, 'id' | 'key' | 'builtin' | 'name'> & { id?: number; name: string | null }) {
  const db = getDb();
  const budget = cat.monthlyBudget == null ? null : c(cat.monthlyBudget);
  if (cat.id) {
    if (cat.name == null) {
      db.prepare('UPDATE categories SET color = ?, kind = ?, monthly_budget = ? WHERE id = ?').run(cat.color, cat.kind, budget, cat.id);
    } else {
      // Renaming a built-in category detaches it from its translation key so the custom name is shown.
      db.prepare('UPDATE categories SET name = ?, key = NULL, color = ?, kind = ?, monthly_budget = ? WHERE id = ?').run(
        cat.name,
        cat.color,
        cat.kind,
        budget,
        cat.id,
      );
    }
  } else {
    if (!cat.name) return;
    const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories').get() as Row).s;
    db.prepare('INSERT INTO categories (key, name, color, kind, monthly_budget, builtin, sort) VALUES (NULL, ?, ?, ?, ?, 0, ?)').run(
      cat.name,
      cat.color,
      cat.kind,
      budget,
      sort,
    );
  }
}

export function deleteCategory(id: number) {
  // Only custom categories can be removed; their transactions fall back to "no category".
  getDb().prepare('DELETE FROM categories WHERE id = ? AND builtin = 0').run(id);
}

export function findOrCreateCategory(name: string): number | null {
  const n = name.trim();
  if (!n) return null;
  const db = getDb();
  // Built-in categories also match their translated names ("Alimentação", "Groceries" → food).
  const lower = n.toLocaleLowerCase('pt-PT');
  const key =
    Object.values(dictionaries)
      .flatMap((d) => Object.entries(d.categories))
      .find(([, label]) => typeof label === 'string' && label.toLocaleLowerCase('pt-PT') === lower)?.[0] ?? n;
  const row = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?) OR lower(key) = lower(?)').get(n, key) as Row | undefined;
  if (row) return row.id;
  upsertCategory({ name: n, color: '#71717a', kind: 'expense', monthlyBudget: null });
  return (db.prepare('SELECT id FROM categories WHERE name = ?').get(n) as Row).id;
}

// ---------------------------------------------------------------- budget template

const mapItem = (r: Row): BudgetItem => ({
  id: r.id,
  name: r.name,
  kind: r.kind as BudgetItemKind,
  amount: e(r.amount),
  categoryId: r.category_id,
  account: r.account as AccountId | null,
  startMonth: r.start_month,
  endMonth: r.end_month,
});

export function listBudgetItems(): BudgetItem[] {
  return memo('budgetItems', () => (getDb().prepare('SELECT * FROM budget_items ORDER BY sort, id').all() as Row[]).map(mapItem));
}

export function upsertBudgetItem(item: Omit<BudgetItem, 'id'> & { id?: number }) {
  const db = getDb();
  const args = [item.name, item.kind, c(item.amount), item.categoryId, item.account, item.startMonth, item.endMonth];
  if (item.id) {
    db.prepare('UPDATE budget_items SET name=?, kind=?, amount=?, category_id=?, account=?, start_month=?, end_month=? WHERE id=?').run(...args, item.id);
  } else {
    const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM budget_items').get() as Row).s;
    db.prepare('INSERT INTO budget_items (name, kind, amount, category_id, account, start_month, end_month, sort) VALUES (?,?,?,?,?,?,?,?)').run(
      ...args,
      sort,
    );
  }
  refreshOpenMonths();
}

export function deleteBudgetItem(id: number) {
  getDb().prepare('DELETE FROM budget_items WHERE id = ?').run(id);
  refreshOpenMonths();
}

// ---------------------------------------------------------------- month budgets

const itemsForMonth = (month: string) => listBudgetItems().filter((i) => isActiveInMonth(i, month));

const mapMonth = (r: Row): MonthBudget => ({
  month: r.month,
  income: e(r.income),
  extraIncome: e(r.extra_income),
  mealCard: e(r.meal_card),
  items: JSON.parse(r.items),
  notes: r.notes,
});

/** Returns the stored budget for a month, creating it from the template on first access. */
export function ensureMonthBudget(month: string): MonthBudget {
  const db = getDb();
  const row = db.prepare('SELECT * FROM month_budgets WHERE month = ?').get(month) as Row | undefined;
  if (row) return mapMonth(row);
  const budget: MonthBudget = {
    month,
    // No assumed salary: the month's income is entered by hand (see month_income).
    income: 0,
    extraIncome: 0,
    mealCard: 0,
    items: itemsForMonth(month),
    notes: null,
  };
  db.prepare('INSERT INTO month_budgets (month, income, extra_income, meal_card, items, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    month,
    c(budget.income),
    0,
    c(budget.mealCard),
    JSON.stringify(budget.items),
    null,
  );
  return budget;
}

/** Template changes apply to the current and future months; past months keep their snapshot as history. */
function refreshOpenMonths() {
  const db = getDb();
  const months = db.prepare('SELECT month FROM month_budgets WHERE month >= ?').all(currentMonth()) as Row[];
  const update = db.prepare("UPDATE month_budgets SET items = ?, updated_at = datetime('now') WHERE month = ?");
  for (const { month } of months) update.run(JSON.stringify(itemsForMonth(month)), month);
}

export function updateMonthBudget(month: string, data: { income: number; extraIncome: number; mealCard: number; notes: string | null }) {
  ensureMonthBudget(month);
  getDb()
    .prepare("UPDATE month_budgets SET income = ?, extra_income = ?, meal_card = ?, notes = ?, updated_at = datetime('now') WHERE month = ?")
    .run(c(data.income), c(data.extraIncome), c(data.mealCard), data.notes, month);
}

export function listMonthBudgets(): MonthBudget[] {
  return memo('monthBudgets', () => (getDb().prepare('SELECT * FROM month_budgets ORDER BY month').all() as Row[]).map(mapMonth));
}

// ---------------------------------------------------------------- manual monthly income

const mapIncome = (r: Row): MonthIncome => ({
  month: r.month,
  normalDays: r.normal_days,
  holidayDays: r.holiday_days,
  salaryPerDay: r.salary_per_day == null ? null : e(r.salary_per_day),
  mealPerDay: r.meal_per_day == null ? null : e(r.meal_per_day),
  salaryConfirmed: !!r.salary_confirmed,
  mealConfirmed: !!r.meal_confirmed,
  expectedSalary: r.expected_salary == null ? null : e(r.expected_salary),
  expectedMeal: r.expected_meal == null ? null : e(r.expected_meal),
  salaryExpectedDate: r.salary_expected_date,
  salaryPaidDate: r.salary_paid_date,
  mealExpectedDate: r.meal_expected_date,
  mealPaidDate: r.meal_paid_date,
});

export function listMonthIncomes(): MonthIncome[] {
  return memo('monthIncomes', () => (getDb().prepare('SELECT * FROM month_income ORDER BY month').all() as Row[]).map(mapIncome));
}

/** null = the user has not defined this month's income yet. */
export function getMonthIncome(month: string): MonthIncome | null {
  const row = getDb().prepare('SELECT * FROM month_income WHERE month = ?').get(month) as Row | undefined;
  return row ? mapIncome(row) : null;
}

/** Daily rates from the latest earlier month that has them, used only to pre-fill the optional estimate. */
export function lastDailyRates(before: string): { salaryPerDay: number | null; mealPerDay: number | null } {
  const row = getDb()
    .prepare('SELECT salary_per_day, meal_per_day FROM month_income WHERE month < ? AND (salary_per_day IS NOT NULL OR meal_per_day IS NOT NULL) ORDER BY month DESC LIMIT 1')
    .get(before) as Row | undefined;
  return { salaryPerDay: row?.salary_per_day == null ? null : e(row.salary_per_day), mealPerDay: row?.meal_per_day == null ? null : e(row.meal_per_day) };
}

export interface MonthIncomeInput {
  salary: number;
  meal: number;
  extraIncome: number;
  normalDays: number;
  holidayDays: number;
  salaryPerDay: number | null;
  mealPerDay: number | null;
  salaryConfirmed: boolean;
  mealConfirmed: boolean;
  salaryPaidDate: string | null;
  mealPaidDate: string | null;
  notes: string | null;
}

/** Saves the month's manual income and mirrors it into the month budget. The forecast is kept when it is replaced by the real amount. */
export function saveMonthIncome(month: string, d: MonthIncomeInput) {
  const db = getDb();
  const profile = getProfile();
  const prev = getMonthIncome(month);
  const budget = ensureMonthBudget(month);
  const keepExpected = (old: number | null, was: number, wasConfirmed: boolean, confirmedNow: boolean, now: number) => {
    if (!confirmedNow) return null;
    if (old != null) return old;
    return prev && !wasConfirmed && was !== now ? was : null;
  };
  const expectedSalary = keepExpected(prev?.expectedSalary ?? null, budget.income, !!prev?.salaryConfirmed, d.salaryConfirmed, d.salary);
  const expectedMeal = keepExpected(prev?.expectedMeal ?? null, budget.mealCard, !!prev?.mealConfirmed, d.mealConfirmed, d.meal);
  const salaryDate = expectedPayDate(month, profile.salaryPayDay).date;
  const mealDate = expectedPayDate(month, profile.mealPayDay).date;
  const cn = (v: number | null) => (v == null ? null : c(v));
  db.transaction(() => {
    db.prepare(
      `INSERT INTO month_income (month, normal_days, holiday_days, salary_per_day, meal_per_day, salary_confirmed, meal_confirmed, expected_salary, expected_meal,
         salary_expected_date, salary_paid_date, meal_expected_date, meal_paid_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(month) DO UPDATE SET normal_days=excluded.normal_days, holiday_days=excluded.holiday_days, salary_per_day=excluded.salary_per_day,
         meal_per_day=excluded.meal_per_day, salary_confirmed=excluded.salary_confirmed, meal_confirmed=excluded.meal_confirmed,
         expected_salary=excluded.expected_salary, expected_meal=excluded.expected_meal, salary_expected_date=excluded.salary_expected_date,
         salary_paid_date=excluded.salary_paid_date, meal_expected_date=excluded.meal_expected_date, meal_paid_date=excluded.meal_paid_date,
         updated_at=datetime('now')`,
    ).run(
      month,
      d.normalDays,
      d.holidayDays,
      cn(d.salaryPerDay),
      cn(d.mealPerDay),
      d.salaryConfirmed ? 1 : 0,
      d.mealConfirmed ? 1 : 0,
      cn(expectedSalary),
      cn(expectedMeal),
      salaryDate,
      d.salaryPaidDate,
      mealDate,
      d.mealPaidDate,
    );
    updateMonthBudget(month, { income: d.salary, extraIncome: d.extraIncome, mealCard: d.meal, notes: d.notes });
  })();
}

// ---------------------------------------------------------------- transactions

const mapTx = (r: Row): Transaction => ({
  id: r.id,
  date: r.date,
  amount: e(r.amount),
  type: r.type as TxType,
  description: r.description,
  categoryId: r.category_id,
  subcategory: r.subcategory,
  account: r.account as AccountId,
  toAccount: r.to_account as AccountId | null,
  paymentMethod: r.payment_method as PaymentMethod,
  merchant: r.merchant,
  notes: r.notes,
  attachment: r.attachment,
  recurring: !!r.recurring,
  recurrence: r.recurrence as Recurrence | null,
  parentId: r.parent_id,
  createdAt: r.created_at,
});

export interface TxFilters {
  month?: string;
  year?: string;
  categoryId?: number;
  account?: string;
  paymentMethod?: string;
  type?: string;
  q?: string;
  limit?: number;
}

/**
 * WHERE clause for the filters. A month or year becomes a plain range on `date` ("YYYY-MM-DD" sorts as text),
 * so SQLite can use the date index instead of evaluating substr() on every row.
 */
function txWhere(f: TxFilters): { sql: string; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.month) {
    where.push('date >= ? AND date <= ?');
    args.push(`${f.month}-01`, `${f.month}-31`);
  } else if (f.year) {
    where.push('date >= ? AND date <= ?');
    args.push(`${f.year}-01-01`, `${f.year}-12-31`);
  }
  if (f.categoryId) {
    where.push('category_id = ?');
    args.push(f.categoryId);
  }
  if (f.account) {
    // A transfer belongs to both its source and its destination account.
    where.push('(account = ? OR to_account = ?)');
    args.push(f.account, f.account);
  }
  if (f.paymentMethod) {
    where.push('payment_method = ?');
    args.push(f.paymentMethod);
  }
  if (f.type) {
    where.push('type = ?');
    args.push(f.type);
  }
  if (f.q) {
    where.push('(description LIKE ? OR merchant LIKE ? OR notes LIKE ? OR subcategory LIKE ?)');
    const like = `%${f.q}%`;
    args.push(like, like, like, like);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

export function listTransactions(f: TxFilters = {}): Transaction[] {
  return memo(`tx:${JSON.stringify(f)}`, () => {
    const { sql, args } = txWhere(f);
    const limit = f.limit ? 'LIMIT ' + Number(f.limit) : '';
    return (getDb().prepare(`SELECT * FROM transactions ${sql} ORDER BY date DESC, id DESC ${limit}`).all(...args) as Row[]).map(mapTx);
  });
}

export const TX_PAGE_SIZE = 50;

/** One page of the filtered list (newest first) plus the total number of matches. */
export function listTransactionsPage(f: TxFilters, page: number, size = TX_PAGE_SIZE): { rows: Transaction[]; total: number; pages: number; page: number } {
  return memo(`txpage:${JSON.stringify(f)}:${page}:${size}`, () => {
    const db = getDb();
    const { sql, args } = txWhere(f);
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM transactions ${sql}`).get(...args) as Row).n as number;
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
    const rows = (db.prepare(`SELECT * FROM transactions ${sql} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...args, size, (current - 1) * size) as Row[]).map(mapTx);
    return { rows, total, pages, page: current };
  });
}

/** Totals of everything the filters match (not just the visible page), computed in SQL. Meal-card money is kept apart. */
export function transactionTotals(f: TxFilters): { outflow: number; inflow: number; meal: number } {
  return memo(`txtotals:${JSON.stringify(f)}`, () => {
    const { sql, args } = txWhere(f);
    const r = getDb()
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type IN ('purchase','expense','payment') AND account != 'meal_card' THEN amount END), 0) AS outflow,
           COALESCE(SUM(CASE WHEN type = 'income' AND account != 'meal_card' THEN amount END), 0) AS inflow,
           COALESCE(SUM(CASE WHEN type IN ('purchase','expense','payment') AND account = 'meal_card' THEN amount END), 0) AS meal
         FROM transactions ${sql}`,
      )
      .get(...args) as Row;
    return { outflow: e(r.outflow), inflow: e(r.inflow), meal: e(r.meal) };
  });
}

export function getTransaction(id: number): Transaction | null {
  const row = getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Row | undefined;
  return row ? mapTx(row) : null;
}

export type TxInput = Omit<Transaction, 'id' | 'parentId'> & { id?: number };

export function upsertTransaction(tx: TxInput): number {
  const db = getDb();
  const args = [
    tx.date,
    c(tx.amount),
    tx.type,
    tx.description,
    tx.categoryId,
    tx.subcategory,
    tx.account,
    tx.type === 'transfer' ? tx.toAccount : null,
    tx.paymentMethod,
    tx.merchant,
    tx.notes,
    tx.attachment,
    tx.recurring ? 1 : 0,
    tx.recurring ? tx.recurrence : null,
  ];
  if (tx.id) {
    db.prepare(
      `UPDATE transactions SET date=?, amount=?, type=?, description=?, category_id=?, subcategory=?, account=?, to_account=?,
       payment_method=?, merchant=?, notes=?, attachment=?, recurring=?, recurrence=?, last_generated=COALESCE(last_generated, date) WHERE id=?`,
    ).run(...args, tx.id);
    return tx.id;
  }
  const info = db
    .prepare(
      `INSERT INTO transactions (date, amount, type, description, category_id, subcategory, account, to_account, payment_method,
       merchant, notes, attachment, recurring, recurrence, last_generated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(...args, tx.date);
  return Number(info.lastInsertRowid);
}

export function deleteTransaction(id: number): string | null {
  const db = getDb();
  const row = db.prepare('SELECT attachment FROM transactions WHERE id = ?').get(id) as Row | undefined;
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  return row?.attachment ?? null;
}

const STEP: Record<Recurrence, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * Creates the occurrences of recurring transactions that are due up to today.
 * `last_generated` remembers progress, so deleting a generated occurrence does not bring it back.
 */
export function materializeRecurring(today = todayISO()) {
  const db = getDb();
  const series = db.prepare('SELECT * FROM transactions WHERE recurring = 1 AND parent_id IS NULL AND recurrence IS NOT NULL').all() as Row[];
  if (!series.length) return;
  const insert = db.prepare(
    `INSERT INTO transactions (date, amount, type, description, category_id, subcategory, account, to_account, payment_method, merchant, notes, recurring, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );
  const mark = db.prepare('UPDATE transactions SET last_generated = ? WHERE id = ?');
  db.transaction(() => {
    for (const s of series) {
      const step = STEP[s.recurrence as Recurrence];
      if (!step) continue;
      const anchorDay = Number(s.date.slice(8, 10));
      let last = s.last_generated || s.date;
      for (let i = 1; i < 600; i++) {
        const next = addMonthsToDate(s.date, step * i, anchorDay);
        if (next <= last) continue;
        if (next > today) break;
        insert.run(next, s.amount, s.type, s.description, s.category_id, s.subcategory, s.account, s.to_account, s.payment_method, s.merchant, s.notes, s.id);
        last = next;
      }
      if (last !== s.last_generated) mark.run(last, s.id);
    }
  })();
}

// ---------------------------------------------------------------- goals

const mapGoal = (r: Row): Goal => ({
  id: r.id,
  kind: r.kind as GoalKind,
  name: r.name,
  target: e(r.target),
  current: e(r.current),
  monthly: e(r.monthly),
  targetDate: r.target_date,
  color: r.color,
  account: r.account as AccountId | null,
});

/** Goals as stored: `current` is the manually entered amount (used when no account is linked). */
export function listGoalsStored(): Goal[] {
  return memo('goals', () => (getDb().prepare('SELECT * FROM goals ORDER BY sort, id').all() as Row[]).map(mapGoal));
}

/** Goals with `current` resolved: linked goals share their account balance in goal order. */
export function listGoals(balances: Partial<Record<AccountId, number>> = balanceMap()): Goal[] {
  return allocateGoals(listGoalsStored(), balances);
}

export function upsertGoal(g: Omit<Goal, 'id'> & { id?: number }) {
  const db = getDb();
  const args = [g.kind, g.name, c(g.target), c(g.current), c(g.monthly), g.targetDate, g.color, g.account];
  if (g.id) db.prepare('UPDATE goals SET kind=?, name=?, target=?, current=?, monthly=?, target_date=?, color=?, account=? WHERE id=?').run(...args, g.id);
  else {
    const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM goals').get() as Row).s;
    db.prepare('INSERT INTO goals (kind, name, target, current, monthly, target_date, color, account, sort) VALUES (?,?,?,?,?,?,?,?,?)').run(...args, sort);
  }
}

export function deleteGoal(id: number) {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id);
}

// ---------------------------------------------------------------- portfolio snapshots

const mapSnap = (r: Row): Snapshot => ({
  id: r.id,
  date: r.date,
  account: r.account as AccountId,
  value: e(r.value),
  invested: e(r.invested),
  notes: r.notes,
  createdAt: r.created_at,
});

export function listSnapshots(account?: AccountId): Snapshot[] {
  return memo(`snapshots:${account ?? 'all'}`, () => readSnapshots(account));
}

function readSnapshots(account?: AccountId): Snapshot[] {
  const db = getDb();
  const rows = account
    ? db.prepare('SELECT * FROM snapshots WHERE account = ? ORDER BY date, id').all(account)
    : db.prepare('SELECT * FROM snapshots ORDER BY date, id').all();
  return (rows as Row[]).map(mapSnap);
}

/** Current balance of every account: last check-in + movements logged after it. */
export function accountBalances(): Record<AccountId, AccountBalance> {
  // Finished months whose interest is not booked yet are booked first (idempotent), so the balance below includes them.
  materializeInterest();
  return memo('accountBalances', () => {
    const db = getDb();
    const snaps = listSnapshots();
    const involving = db.prepare('SELECT * FROM transactions WHERE (account = ? OR to_account = ?)');
    const involvingSince = db.prepare('SELECT * FROM transactions WHERE (account = ? OR to_account = ?) AND date >= ?');
    // A balance only needs the movements of that account from its last check-in onwards (same-day ones included, the
    // calculation decides which count), so the whole history is never loaded. Accounts without a check-in use all of theirs.
    return Object.fromEntries(
      ACCOUNT_IDS.map((a) => {
        const last = snaps.reduce<string | null>((max, sn) => (sn.account === a && (max === null || sn.date > max) ? sn.date : max), null);
        const rows = (last ? involvingSince.all(a, a, last) : involving.all(a, a)) as Row[];
        const bal = accountBalance(a, snaps, rows.map(mapTx));
        if (a === INTEREST_ACCOUNT) {
          // Interest credited after the last check-in is part of the balance (a check-in already contains older credits).
          // It is a gain, not money paid in, so the "invested" figure is unchanged.
          const credited = (db.prepare('SELECT credit_date, net FROM interest_credits WHERE account = ?').all(a) as Row[]).filter((r) => !last || r.credit_date > last).reduce((sum, r) => sum + e(r.net), 0);
          return [a, { ...bal, balance: Math.round((bal.balance + credited) * 100) / 100 }];
        }
        return [a, bal];
      }),
    ) as Record<AccountId, AccountBalance>;
  });
}

export function balanceMap(balances = accountBalances()): Partial<Record<AccountId, number>> {
  return Object.fromEntries(Object.values(balances).map((b) => [b.account, b.balance]));
}

export function addSnapshot(s: Omit<Snapshot, 'id' | 'createdAt'>) {
  getDb()
    .prepare("INSERT INTO snapshots (date, account, value, invested, notes, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
    .run(s.date, s.account, c(s.value), c(s.invested), s.notes);
}

export function deleteSnapshot(id: number) {
  getDb().prepare('DELETE FROM snapshots WHERE id = ?').run(id);
}

/** Monthly outflow totals per category, for history charts. */
export function spendingByMonthAndCategory(fromMonth: string): { month: string; categoryId: number | null; total: number }[] {
  return memo(`spending:${fromMonth}`, () => readSpendingByMonthAndCategory(fromMonth));
}

function readSpendingByMonthAndCategory(fromMonth: string): { month: string; categoryId: number | null; total: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(t.date, 1, 7) AS month, t.category_id AS categoryId, SUM(t.amount) AS total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type != 'income' AND t.date >= ? AND (c.kind IS NULL OR c.kind = 'expense')
       GROUP BY month, t.category_id ORDER BY month`,
    )
    .all(`${fromMonth}-01`) as Row[];
  return rows.map((r) => ({ month: r.month, categoryId: r.categoryId, total: e(r.total) }));
}
