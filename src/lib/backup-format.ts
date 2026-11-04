// Portable backup format + restore planner. Pure (no I/O): the same code validates a JSON backup, plans what an
// import would do, and is covered by tests. Nothing here writes; backup.ts applies a plan the user has confirmed.
import { isISODate, isMonth } from './dates';
import { normalize } from './categorize';
import { ACCOUNT_IDS, BUDGET_ITEM_KINDS, CATEGORY_KINDS, GOAL_KINDS, PAYMENT_METHODS, RECURRENCES, TX_TYPES } from './types';

export const BACKUP_FORMAT = 'nestfund-backup';
export const BACKUP_VERSION = 1;

/** Amounts are in euros (not cents). Categories are referenced by `ref` instead of a database id, so a backup restores into any database. */
export interface BCategory {
  ref: string;
  key: string | null;
  name: string;
  color: string;
  kind: string;
  monthlyBudget: number | null;
  builtin: boolean;
}
export interface BTransaction {
  date: string;
  amount: number;
  type: string;
  description: string;
  category: string | null;
  subcategory: string | null;
  account: string;
  toAccount: string | null;
  paymentMethod: string;
  merchant: string | null;
  notes: string | null;
  recurring: boolean;
  recurrence: string | null;
}
export interface BSnapshot {
  date: string;
  account: string;
  value: number;
  invested: number;
  notes: string | null;
}
export interface BGoal {
  kind: string;
  name: string;
  target: number;
  current: number;
  monthly: number;
  targetDate: string | null;
  color: string;
  account: string | null;
}
export interface BBudgetItem {
  name: string;
  kind: string;
  amount: number;
  category: string | null;
  account: string | null;
  startMonth: string | null;
  endMonth: string | null;
}
export interface BMonthBudget {
  month: string;
  income: number;
  extraIncome: number;
  mealCard: number;
  notes: string | null;
  items: BBudgetItem[];
}
export interface BT212Day {
  date: string;
  totalValue: number;
  invested: number;
  cash: number;
  unrealized: number;
  growthPct: number;
  currency: string;
}
export interface BRule {
  text: string;
  account: string | null;
  category: string;
}

export interface BackupData {
  categories: BCategory[];
  transactions: BTransaction[];
  snapshots: BSnapshot[];
  goals: BGoal[];
  budgetItems: BBudgetItem[];
  monthBudgets: BMonthBudget[];
  t212History: BT212Day[];
  rules: BRule[];
  profile: Record<string, number> | null;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion?: string;
  exportedAt: string;
  /** null = complete export */
  period: { from: string | null; to: string | null } | null;
  /** Informational only (balances at export time); never imported. */
  accounts?: { id: string; balance: number }[];
  data: BackupData;
}

export const emptyData = (): BackupData => ({ categories: [], transactions: [], snapshots: [], goals: [], budgetItems: [], monthBudgets: [], t212History: [], rules: [], profile: null });

export const categoryRef = (c: { key: string | null; name: string }) => c.key ?? `custom:${c.name.trim().toLowerCase()}`;

// ---------------------------------------------------------------- validation

export interface InvalidItem {
  section: keyof BackupData;
  index: number;
  reason: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const optText = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e12 ? Math.round(v * 100) / 100 : null);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#71717a');

type Cleaned<T> = { ok: true; value: T } | { ok: false; reason: string };
const bad = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function cleanCategory(r: unknown): Cleaned<BCategory> {
  if (!isObj(r)) return bad('not an object');
  const name = text(r.name);
  const kind = oneOf(CATEGORY_KINDS, r.kind);
  if (!name) return bad('missing name');
  if (!kind) return bad('invalid kind');
  const key = optText(r.key);
  const budget = r.monthlyBudget == null ? null : money(r.monthlyBudget);
  if (r.monthlyBudget != null && budget == null) return bad('invalid monthlyBudget');
  return { ok: true, value: { ref: categoryRef({ key, name }), key, name, color: color(r.color), kind, monthlyBudget: budget, builtin: r.builtin === true } };
}

function cleanTransaction(r: unknown): Cleaned<BTransaction> {
  if (!isObj(r)) return bad('not an object');
  if (typeof r.date !== 'string' || !isISODate(r.date)) return bad('invalid date');
  const amount = money(r.amount);
  if (amount == null || amount <= 0) return bad('invalid amount');
  const type = oneOf(TX_TYPES, r.type);
  if (!type) return bad('invalid type');
  const description = text(r.description);
  if (!description) return bad('missing description');
  const account = oneOf(ACCOUNT_IDS, r.account);
  if (!account) return bad('invalid account');
  const toAccount = r.toAccount == null || r.toAccount === '' ? null : oneOf(ACCOUNT_IDS, r.toAccount);
  if (r.toAccount != null && r.toAccount !== '' && !toAccount) return bad('invalid toAccount');
  if (type === 'transfer' && (!toAccount || toAccount === account)) return bad('transfer needs a different destination account');
  const recurrence = r.recurrence == null || r.recurrence === '' ? null : oneOf(RECURRENCES, r.recurrence);
  if (r.recurrence != null && r.recurrence !== '' && !recurrence) return bad('invalid recurrence');
  return {
    ok: true,
    value: {
      date: r.date,
      amount,
      type,
      description,
      category: optText(r.category),
      subcategory: optText(r.subcategory),
      account,
      toAccount: type === 'transfer' ? toAccount : null,
      paymentMethod: oneOf(PAYMENT_METHODS, r.paymentMethod) ?? 'other',
      merchant: optText(r.merchant),
      notes: optText(r.notes),
      recurring: r.recurring === true && recurrence != null,
      recurrence: r.recurring === true ? recurrence : null,
    },
  };
}

function cleanSnapshot(r: unknown): Cleaned<BSnapshot> {
  if (!isObj(r)) return bad('not an object');
  if (typeof r.date !== 'string' || !isISODate(r.date)) return bad('invalid date');
  const account = oneOf(ACCOUNT_IDS, r.account);
  const value = money(r.value);
  const invested = money(r.invested);
  if (!account) return bad('invalid account');
  if (value == null || invested == null) return bad('invalid value');
  return { ok: true, value: { date: r.date, account, value, invested, notes: optText(r.notes) } };
}

function cleanGoal(r: unknown): Cleaned<BGoal> {
  if (!isObj(r)) return bad('not an object');
  const kind = oneOf(GOAL_KINDS, r.kind);
  const name = text(r.name);
  const target = money(r.target);
  if (!kind || !name) return bad('missing kind or name');
  if (target == null || target < 0) return bad('invalid target');
  const account = r.account == null || r.account === '' ? null : oneOf(ACCOUNT_IDS, r.account);
  if (r.account != null && r.account !== '' && !account) return bad('invalid account');
  const targetDate = r.targetDate == null || r.targetDate === '' ? null : typeof r.targetDate === 'string' && isMonth(r.targetDate.slice(0, 7)) ? r.targetDate : undefined;
  if (targetDate === undefined) return bad('invalid targetDate');
  return { ok: true, value: { kind, name, target, current: money(r.current) ?? 0, monthly: money(r.monthly) ?? 0, targetDate, color: color(r.color), account } };
}

function cleanBudgetItem(r: unknown): Cleaned<BBudgetItem> {
  if (!isObj(r)) return bad('not an object');
  const name = text(r.name);
  const kind = oneOf(BUDGET_ITEM_KINDS, r.kind);
  const amount = money(r.amount);
  if (!name || !kind) return bad('missing name or kind');
  if (amount == null || amount < 0) return bad('invalid amount');
  const account = r.account == null || r.account === '' ? null : oneOf(ACCOUNT_IDS, r.account);
  if (r.account != null && r.account !== '' && !account) return bad('invalid account');
  const month = (v: unknown) => (v == null || v === '' ? null : typeof v === 'string' && isMonth(v) ? v : undefined);
  const start = month(r.startMonth);
  const end = month(r.endMonth);
  if (start === undefined || end === undefined) return bad('invalid month');
  return { ok: true, value: { name, kind, amount, category: optText(r.category), account, startMonth: start, endMonth: end } };
}

function cleanMonthBudget(r: unknown): Cleaned<BMonthBudget> {
  if (!isObj(r)) return bad('not an object');
  if (typeof r.month !== 'string' || !isMonth(r.month)) return bad('invalid month');
  const income = money(r.income);
  if (income == null) return bad('invalid income');
  const items: BBudgetItem[] = [];
  for (const raw of Array.isArray(r.items) ? r.items : []) {
    const c = cleanBudgetItem(raw);
    if (!c.ok) return bad(`item: ${c.reason}`);
    items.push(c.value);
  }
  return { ok: true, value: { month: r.month, income, extraIncome: money(r.extraIncome) ?? 0, mealCard: money(r.mealCard) ?? 0, notes: optText(r.notes), items } };
}

function cleanT212(r: unknown): Cleaned<BT212Day> {
  if (!isObj(r)) return bad('not an object');
  if (typeof r.date !== 'string' || !isISODate(r.date)) return bad('invalid date');
  const totalValue = money(r.totalValue);
  const invested = money(r.invested);
  if (totalValue == null || invested == null) return bad('invalid value');
  const growth = typeof r.growthPct === 'number' && Number.isFinite(r.growthPct) ? r.growthPct : 0;
  return { ok: true, value: { date: r.date, totalValue, invested, cash: money(r.cash) ?? 0, unrealized: money(r.unrealized) ?? 0, growthPct: growth, currency: text(r.currency) ?? 'EUR' } };
}

function cleanRule(r: unknown): Cleaned<BRule> {
  if (!isObj(r)) return bad('not an object');
  const t = text(r.text);
  const category = text(r.category);
  if (!t || !category) return bad('missing text or category');
  const account = r.account == null || r.account === '' ? null : oneOf(ACCOUNT_IDS, r.account);
  if (r.account != null && r.account !== '' && !account) return bad('invalid account');
  return { ok: true, value: { text: t, account, category } };
}

export type ValidationResult = { ok: true; file: BackupFile; invalid: InvalidItem[] } | { ok: false; error: 'notJson' | 'notBackup' | 'newerVersion' | 'empty' };

function cleanList<T>(section: keyof BackupData, raw: unknown, clean: (r: unknown) => Cleaned<T>, invalid: InvalidItem[]): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  raw.forEach((r, index) => {
    const c = clean(r);
    if (c.ok) out.push(c.value);
    else invalid.push({ section, index, reason: c.reason });
  });
  return out;
}

/** Reads the text of a .json backup. Bad entries are dropped (and reported), never repaired or guessed. */
export function validateBackup(jsonText: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.data)) return { ok: false, error: 'notBackup' };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) return { ok: false, error: 'newerVersion' };
  const d = raw.data;
  const invalid: InvalidItem[] = [];
  const data: BackupData = {
    categories: cleanList('categories', d.categories, cleanCategory, invalid),
    transactions: cleanList('transactions', d.transactions, cleanTransaction, invalid),
    snapshots: cleanList('snapshots', d.snapshots, cleanSnapshot, invalid),
    goals: cleanList('goals', d.goals, cleanGoal, invalid),
    budgetItems: cleanList('budgetItems', d.budgetItems, cleanBudgetItem, invalid),
    monthBudgets: cleanList('monthBudgets', d.monthBudgets, cleanMonthBudget, invalid),
    t212History: cleanList('t212History', d.t212History, cleanT212, invalid),
    rules: cleanList('rules', d.rules, cleanRule, invalid),
    profile: null,
  };
  if (isObj(d.profile)) {
    const entries = Object.entries(d.profile).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)) as [string, number][];
    data.profile = Object.fromEntries(entries);
  }
  const total = Object.values(data).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);
  if (total === 0 && invalid.length === 0) return { ok: false, error: 'empty' };
  return {
    ok: true,
    invalid,
    file: {
      format: BACKUP_FORMAT,
      version: raw.version,
      appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : undefined,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      period: isObj(raw.period) ? { from: optText(raw.period.from), to: optText(raw.period.to) } : null,
      data,
    },
  };
}

// ---------------------------------------------------------------- planning

export interface SectionPlan<T> {
  create: T[];
  update: { item: T; changes: string[] }[];
  /** Already there (same record) or not worth touching. Never modified. */
  ignore: T[];
}

export interface RestorePlan {
  categories: SectionPlan<BCategory>;
  transactions: SectionPlan<BTransaction>;
  snapshots: SectionPlan<BSnapshot>;
  goals: SectionPlan<BGoal>;
  budgetItems: SectionPlan<BBudgetItem>;
  monthBudgets: SectionPlan<BMonthBudget>;
  t212History: SectionPlan<BT212Day>;
  rules: SectionPlan<BRule>;
  profile: { changes: string[]; value: Record<string, number> } | null;
  /** Transactions/rules/items whose category is in neither the file nor the database: they are restored without a category. */
  unknownCategories: string[];
}

export const SECTIONS = ['categories', 'transactions', 'snapshots', 'goals', 'budgetItems', 'monthBudgets', 't212History', 'rules'] as const;
export type SectionName = (typeof SECTIONS)[number];

const empty = <T>(): SectionPlan<T> => ({ create: [], update: [], ignore: [] });
const nameKey = (s: string) => normalize(s);
const nullable = (v: unknown) => (v === '' || v === undefined ? null : v);
const diff = <T extends object>(a: T, b: T, fields: (keyof T)[]) => fields.filter((f) => nullable(a[f]) !== nullable(b[f])) as string[];

export const txKey = (t: Pick<BTransaction, 'date' | 'amount' | 'type' | 'description' | 'account' | 'toAccount'>) =>
  [t.date, t.amount.toFixed(2), t.type, nameKey(t.description), t.account, t.toAccount ?? ''].join('|');
const snapKey = (s: BSnapshot) => [s.date, s.account, s.value.toFixed(2), s.invested.toFixed(2)].join('|');
export const goalKeyOf = (g: { kind: string; name: string }) => `${g.kind}|${nameKey(g.name)}`;
export const itemKeyOf = (i: { kind: string; name: string }) => `${i.kind}|${nameKey(i.name)}`;
const ruleKey = (r: BRule) => [nameKey(r.text), r.account ?? '', r.category].join('|');

const canonicalItems = (items: BBudgetItem[]) =>
  JSON.stringify(
    [...items]
      .map((i) => [i.kind, nameKey(i.name), i.amount.toFixed(2), i.category ?? '', i.account ?? '', i.startMonth ?? '', i.endMonth ?? ''])
      .sort((a, b) => a.join('|').localeCompare(b.join('|'))),
  );

/**
 * What importing `file` into a database that currently holds `current` would do. Rules of the plan:
 * - A record is matched by what identifies it (date+amount+type+description+account for transactions, name+kind for goals, month for month budgets…), never by id.
 * - Identical records are ignored, so importing the same file twice changes nothing. Repeated identical lines are kept only as many times as the database lacks them.
 * - Transactions, snapshots, rules and Trading 212 days are only ever created or ignored; an existing one is never overwritten.
 * - Categories, goals, budget lines, month budgets and the profile can be updated where the file differs; the preview lists which fields.
 * - Nothing is ever deleted.
 */
export function planRestore(file: BackupData, current: BackupData): RestorePlan {
  const plan: RestorePlan = {
    categories: empty(),
    transactions: empty(),
    snapshots: empty(),
    goals: empty(),
    budgetItems: empty(),
    monthBudgets: empty(),
    t212History: empty(),
    rules: empty(),
    profile: null,
    unknownCategories: [],
  };

  // categories
  const cats = new Map(current.categories.map((c) => [c.ref, c]));
  const known = new Set(cats.keys());
  for (const c of file.categories) {
    const have = cats.get(c.ref);
    if (!have) {
      plan.categories.create.push(c);
      known.add(c.ref);
      continue;
    }
    const changes = diff(c, have, ['color', 'kind', 'monthlyBudget']);
    // Built-in names are translations of their key, so only custom names are compared.
    if (!c.key && c.name !== have.name) changes.unshift('name');
    if (changes.length) plan.categories.update.push({ item: c, changes });
    else plan.categories.ignore.push(c);
  }
  const unknown = new Set<string>();
  const known_ = (ref: string | null) => {
    if (ref && !known.has(ref)) unknown.add(ref);
  };

  // transactions: multiset match so genuine repeats survive but a re-import adds nothing
  const have = new Map<string, number>();
  for (const t of current.transactions) have.set(txKey(t), (have.get(txKey(t)) ?? 0) + 1);
  for (const t of file.transactions) {
    const k = txKey(t);
    const n = have.get(k) ?? 0;
    if (n > 0) {
      have.set(k, n - 1);
      plan.transactions.ignore.push(t);
    } else {
      plan.transactions.create.push(t);
      known_(t.category);
    }
  }

  // snapshots
  const snaps = new Map<string, number>();
  for (const s of current.snapshots) snaps.set(snapKey(s), (snaps.get(snapKey(s)) ?? 0) + 1);
  for (const s of file.snapshots) {
    const n = snaps.get(snapKey(s)) ?? 0;
    if (n > 0) {
      snaps.set(snapKey(s), n - 1);
      plan.snapshots.ignore.push(s);
    } else plan.snapshots.create.push(s);
  }

  // goals
  const goals = new Map(current.goals.map((g) => [goalKeyOf(g), g]));
  for (const g of file.goals) {
    const h = goals.get(goalKeyOf(g));
    if (!h) {
      plan.goals.create.push(g);
      goals.set(goalKeyOf(g), g);
      continue;
    }
    const changes = diff(g, h, ['target', 'current', 'monthly', 'targetDate', 'color', 'account']);
    if (changes.length) plan.goals.update.push({ item: g, changes });
    else plan.goals.ignore.push(g);
  }

  // budget template lines
  const items = new Map(current.budgetItems.map((i) => [itemKeyOf(i), i]));
  for (const i of file.budgetItems) {
    const h = items.get(itemKeyOf(i));
    if (!h) {
      plan.budgetItems.create.push(i);
      items.set(itemKeyOf(i), i);
      known_(i.category);
      continue;
    }
    const changes = diff(i, h, ['amount', 'category', 'account', 'startMonth', 'endMonth']);
    if (changes.length) {
      plan.budgetItems.update.push({ item: i, changes });
      known_(i.category);
    } else plan.budgetItems.ignore.push(i);
  }

  // month budgets
  const months = new Map(current.monthBudgets.map((m) => [m.month, m]));
  for (const m of file.monthBudgets) {
    const h = months.get(m.month);
    if (!h) {
      plan.monthBudgets.create.push(m);
      m.items.forEach((i) => known_(i.category));
      continue;
    }
    const changes = diff(m, h, ['income', 'extraIncome', 'mealCard', 'notes']);
    if (canonicalItems(m.items) !== canonicalItems(h.items)) changes.push('items');
    if (changes.length) {
      plan.monthBudgets.update.push({ item: m, changes });
      m.items.forEach((i) => known_(i.category));
    } else plan.monthBudgets.ignore.push(m);
  }

  // Trading 212 days are API records: only missing days are added.
  const days = new Set(current.t212History.map((d) => d.date));
  for (const d of file.t212History) {
    if (days.has(d.date)) plan.t212History.ignore.push(d);
    else {
      plan.t212History.create.push(d);
      days.add(d.date);
    }
  }

  // rules
  const rules = new Set(current.rules.map(ruleKey));
  for (const r of file.rules) {
    if (rules.has(ruleKey(r))) plan.rules.ignore.push(r);
    else {
      plan.rules.create.push(r);
      rules.add(ruleKey(r));
      known_(r.category);
    }
  }

  // profile
  if (file.profile) {
    const cur = current.profile ?? {};
    const changes = Object.keys(file.profile).filter((k) => file.profile![k] !== cur[k]);
    if (changes.length) plan.profile = { changes, value: file.profile };
  }

  plan.unknownCategories = [...unknown];
  return plan;
}

export function planTotals(plan: RestorePlan) {
  let create = 0;
  let update = 0;
  let ignore = 0;
  for (const s of SECTIONS) {
    create += plan[s].create.length;
    update += plan[s].update.length;
    ignore += plan[s].ignore.length;
  }
  if (plan.profile) update += 1;
  return { create, update, ignore };
}
