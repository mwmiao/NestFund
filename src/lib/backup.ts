import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, DATA_DIR, getDb, fromCents as e, toCents as c } from './db';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  categoryRef,
  emptyData,
  goalKeyOf,
  itemKeyOf,
  txKey,
  type BackupData,
  type BackupFile,
  type BBudgetItem,
  type RestorePlan,
} from './backup-format';
import { currentMonth, isActiveInMonth } from './dates';
import { accountBalances, getProfile, listBudgetItems, listCategories, listGoalsStored, listMonthBudgets, listSnapshots, listTransactions } from './repo';
import { listRules } from './rules-repo';
import { ACCOUNT_IDS } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** Version from package.json, written into exports so a backup says which release made it. */
export function appVersion(): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
}

export interface Period {
  from: string | null;
  to: string | null;
}

const inRange = (date: string, p: Period | null) => !p || ((!p.from || date >= p.from) && (!p.to || date <= p.to));
const monthInRange = (month: string, p: Period | null) => !p || ((!p.from || month >= p.from.slice(0, 7)) && (!p.to || month <= p.to.slice(0, 7)));

/** Everything the app holds, in the portable format (optionally limited to a period for dated records). */
export function readBackupData(period: Period | null = null): BackupData {
  const categories = listCategories();
  const refById = new Map(categories.map((cat) => [cat.id, categoryRef(cat)]));
  const ref = (id: number | null) => (id != null ? (refById.get(id) ?? null) : null);
  const data = emptyData();

  data.categories = categories.map((cat) => ({ ref: categoryRef(cat), key: cat.key, name: cat.name, color: cat.color, kind: cat.kind, monthlyBudget: cat.monthlyBudget, builtin: cat.builtin }));
  data.transactions = listTransactions()
    .filter((t) => inRange(t.date, period))
    .reverse()
    .map((t) => ({
      date: t.date,
      amount: t.amount,
      type: t.type,
      description: t.description,
      category: ref(t.categoryId),
      subcategory: t.subcategory,
      account: t.account,
      toAccount: t.toAccount,
      paymentMethod: t.paymentMethod,
      merchant: t.merchant,
      notes: t.notes,
      recurring: t.recurring,
      recurrence: t.recurrence,
    }));
  data.snapshots = listSnapshots()
    .filter((s) => inRange(s.date, period))
    .map((s) => ({ date: s.date, account: s.account, value: s.value, invested: s.invested, notes: s.notes }));
  data.goals = listGoalsStored().map((g) => ({ kind: g.kind, name: g.name, target: g.target, current: g.current, monthly: g.monthly, targetDate: g.targetDate, color: g.color, account: g.account }));
  const toItem = (i: { name: string; kind: string; amount: number; categoryId: number | null; account: string | null; startMonth: string | null; endMonth: string | null }): BBudgetItem => ({
    name: i.name,
    kind: i.kind,
    amount: i.amount,
    category: ref(i.categoryId),
    account: i.account,
    startMonth: i.startMonth,
    endMonth: i.endMonth,
  });
  data.budgetItems = listBudgetItems().map(toItem);
  data.monthBudgets = listMonthBudgets()
    .filter((m) => monthInRange(m.month, period))
    .map((m) => ({ month: m.month, income: m.income, extraIncome: m.extraIncome, mealCard: m.mealCard, notes: m.notes, items: m.items.map(toItem) }));
  data.t212History = (getDb().prepare('SELECT * FROM t212_history ORDER BY date').all() as Row[])
    .filter((r) => inRange(r.date, period))
    .map((r) => ({ date: r.date, totalValue: e(r.total_value), invested: e(r.invested), cash: e(r.cash), unrealized: e(r.unrealized), growthPct: r.growth_pct, currency: r.currency }));
  data.rules = listRules().flatMap((r) => {
    const cat = ref(r.categoryId);
    return cat ? [{ text: r.text, account: r.account, category: cat }] : [];
  });
  data.profile = Object.fromEntries(Object.entries(getProfile()).filter(([, v]) => typeof v === 'number'));
  return data;
}

/** The Trading 212 API key and secret are never part of an export. */
export function buildBackupFile(period: Period | null, appVersion?: string): BackupFile {
  const balances = accountBalances();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    period: period && (period.from || period.to) ? period : null,
    accounts: ACCOUNT_IDS.map((id) => ({ id, balance: balances[id].balance })),
    data: readBackupData(period && (period.from || period.to) ? period : null),
  };
}

// ---------------------------------------------------------------- backup now

export interface BackupEntry {
  name: string;
  size: number;
  modified: string;
}

const BACKUP_NAME = /^nestfund-[A-Za-z0-9._-]+\.(db|json)$/;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** A full copy of the database (exact, includes every setting) plus a portable JSON export, both inside the data volume. */
export function createBackupNow(appVersion?: string): { db: string; json: string } {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const s = stamp();
  const db = `nestfund-backup-${s}.db`;
  const json = `nestfund-backup-${s}.json`;
  getDb().prepare('VACUUM INTO ?').run(path.join(BACKUP_DIR, db));
  fs.writeFileSync(path.join(BACKUP_DIR, json), JSON.stringify(buildBackupFile(null, appVersion), null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(path.join(BACKUP_DIR, db), 0o600);
  return { db, json };
}

export function listBackups(limit = 12): BackupEntry[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => BACKUP_NAME.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
}

/** Only the portable .json backups can be downloaded; the .db copies stay inside the data volume (they hold the encrypted Trading 212 key). */
export function backupJsonPath(name: string): string | null {
  if (!BACKUP_NAME.test(name) || !name.endsWith('.json')) return null;
  const file = path.join(BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------- staged imports

const STAGE_DIR = path.join(DATA_DIR, 'imports');
const TOKEN = /^[0-9a-f-]{36}$/;
export type StagedKind = 'json' | 'csv';

/** Keeps the uploaded file on the server so the preview and the confirmation work on exactly the same content. */
export function stageImport(kind: StagedKind, content: string): string {
  fs.mkdirSync(STAGE_DIR, { recursive: true, mode: 0o700 });
  for (const f of fs.readdirSync(STAGE_DIR)) {
    const p = path.join(STAGE_DIR, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.rmSync(p, { force: true });
  }
  const token = crypto.randomUUID();
  fs.writeFileSync(path.join(STAGE_DIR, `${token}.${kind}`), content, { encoding: 'utf8', mode: 0o600 });
  return token;
}

export function readStaged(token: string): { kind: StagedKind; content: string } | null {
  if (!TOKEN.test(token)) return null;
  for (const kind of ['json', 'csv'] as const) {
    const p = path.join(STAGE_DIR, `${token}.${kind}`);
    if (fs.existsSync(p)) return { kind, content: fs.readFileSync(p, 'utf8') };
  }
  return null;
}

export function discardStaged(token: string) {
  if (!TOKEN.test(token)) return;
  for (const kind of ['json', 'csv']) fs.rmSync(path.join(STAGE_DIR, `${token}.${kind}`), { force: true });
}

// ---------------------------------------------------------------- apply

/**
 * Applies a plan the user has confirmed: one transaction, after a full database copy. Creates and updates only; nothing is deleted.
 * `fileTransactions` are all transactions of the file, used to resume recurring series without duplicating occurrences that are already in it.
 */
export function applyRestore(plan: RestorePlan, fileTransactions: BackupData['transactions']): { backup: string; created: number; updated: number } {
  const db = getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = `nestfund-before-import-${stamp()}.db`;
  db.prepare('VACUUM INTO ?').run(path.join(BACKUP_DIR, backup));

  let created = 0;
  let updated = 0;
  db.transaction(() => {
    // categories
    const idByRef = new Map<string, number>((db.prepare('SELECT id, key, name FROM categories').all() as Row[]).map((r) => [categoryRef(r as { key: string | null; name: string }), r.id as number]));
    const nextSort = () => (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories').get() as Row).s as number;
    for (const cat of plan.categories.create) {
      const info = db
        .prepare('INSERT INTO categories (key, name, color, kind, monthly_budget, builtin, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(cat.key, cat.key ?? cat.name, cat.color, cat.kind, cat.monthlyBudget == null ? null : c(cat.monthlyBudget), cat.key ? 1 : 0, nextSort());
      idByRef.set(cat.ref, Number(info.lastInsertRowid));
      created++;
    }
    for (const { item: cat } of plan.categories.update) {
      db.prepare('UPDATE categories SET color = ?, kind = ?, monthly_budget = ? WHERE id = ?').run(cat.color, cat.kind, cat.monthlyBudget == null ? null : c(cat.monthlyBudget), idByRef.get(cat.ref));
      if (!cat.key) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(cat.name, idByRef.get(cat.ref));
      updated++;
    }
    const idOf = (ref: string | null) => (ref ? (idByRef.get(ref) ?? null) : null);

    // transactions
    const insertTx = db.prepare(
      `INSERT INTO transactions (date, amount, type, description, category_id, subcategory, account, to_account, payment_method, merchant, notes, recurring, recurrence, last_generated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of plan.transactions.create) {
      // A recurring series resumes after the latest occurrence already present in the file, so nothing is generated twice.
      let last: string | null = t.recurring ? t.date : null;
      if (t.recurring) for (const o of fileTransactions) if (o.date > (last as string) && txKey({ ...o, date: t.date }) === txKey(t)) last = o.date;
      insertTx.run(t.date, c(t.amount), t.type, t.description, idOf(t.category), t.subcategory, t.account, t.toAccount, t.paymentMethod, t.merchant, t.notes, t.recurring ? 1 : 0, t.recurring ? t.recurrence : null, last);
      created++;
    }

    // snapshots
    const insertSnap = db.prepare('INSERT INTO snapshots (date, account, value, invested, notes) VALUES (?, ?, ?, ?, ?)');
    for (const s of plan.snapshots.create) {
      insertSnap.run(s.date, s.account, c(s.value), c(s.invested), s.notes);
      created++;
    }

    // goals
    const goalIds = new Map((db.prepare('SELECT * FROM goals').all() as Row[]).map((r) => [goalKeyOf({ kind: r.kind, name: r.name }), r.id as number]));
    for (const g of plan.goals.create) {
      const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM goals').get() as Row).s;
      db.prepare('INSERT INTO goals (kind, name, target, current, monthly, target_date, color, account, sort) VALUES (?,?,?,?,?,?,?,?,?)').run(g.kind, g.name, c(g.target), c(g.current), c(g.monthly), g.targetDate, g.color, g.account, sort);
      created++;
    }
    for (const { item: g } of plan.goals.update) {
      db.prepare('UPDATE goals SET target=?, current=?, monthly=?, target_date=?, color=?, account=? WHERE id=?').run(c(g.target), c(g.current), c(g.monthly), g.targetDate, g.color, g.account, goalIds.get(goalKeyOf(g)));
      updated++;
    }

    // budget template lines
    const itemIds = new Map((db.prepare('SELECT * FROM budget_items').all() as Row[]).map((r) => [itemKeyOf({ kind: r.kind, name: r.name }), r.id as number]));
    for (const i of plan.budgetItems.create) {
      const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM budget_items').get() as Row).s;
      db.prepare('INSERT INTO budget_items (name, kind, amount, category_id, account, start_month, end_month, sort) VALUES (?,?,?,?,?,?,?,?)').run(i.name, i.kind, c(i.amount), idOf(i.category), i.account, i.startMonth, i.endMonth, sort);
      created++;
    }
    for (const { item: i } of plan.budgetItems.update) {
      db.prepare('UPDATE budget_items SET amount=?, category_id=?, account=?, start_month=?, end_month=? WHERE id=?').run(c(i.amount), idOf(i.category), i.account, i.startMonth, i.endMonth, itemIds.get(itemKeyOf(i)));
      updated++;
    }

    // month budgets
    const blob = (items: BBudgetItem[]) => JSON.stringify(items.map((i, n) => ({ id: n + 1, name: i.name, kind: i.kind, amount: i.amount, categoryId: idOf(i.category), account: i.account, startMonth: i.startMonth, endMonth: i.endMonth })));
    for (const m of plan.monthBudgets.create) {
      db.prepare('INSERT INTO month_budgets (month, income, extra_income, meal_card, items, notes) VALUES (?,?,?,?,?,?)').run(m.month, c(m.income), c(m.extraIncome), c(m.mealCard), blob(m.items), m.notes);
      created++;
    }
    for (const { item: m } of plan.monthBudgets.update) {
      db.prepare("UPDATE month_budgets SET income=?, extra_income=?, meal_card=?, items=?, notes=?, updated_at=datetime('now') WHERE month=?").run(c(m.income), c(m.extraIncome), c(m.mealCard), blob(m.items), m.notes, m.month);
      updated++;
    }
    // Template lines changed: open months that the file did not bring along follow the template, as they do after an edit in the app.
    if (plan.budgetItems.create.length + plan.budgetItems.update.length > 0) {
      const brought = new Set([...plan.monthBudgets.create, ...plan.monthBudgets.update.map((u) => u.item)].map((m) => m.month));
      const template = (db.prepare('SELECT * FROM budget_items ORDER BY sort, id').all() as Row[]).map((r) => ({ id: r.id, name: r.name, kind: r.kind, amount: e(r.amount), categoryId: r.category_id, account: r.account, startMonth: r.start_month, endMonth: r.end_month }));
      for (const { month } of db.prepare('SELECT month FROM month_budgets WHERE month >= ?').all(currentMonth()) as Row[]) {
        if (!brought.has(month)) db.prepare("UPDATE month_budgets SET items = ?, updated_at = datetime('now') WHERE month = ?").run(JSON.stringify(template.filter((i) => isActiveInMonth(i, month))), month);
      }
    }

    // Trading 212 days
    for (const d of plan.t212History.create) {
      db.prepare('INSERT OR IGNORE INTO t212_history (date, total_value, invested, cash, unrealized, growth_pct, currency, synced_at) VALUES (?,?,?,?,?,?,?,?)').run(d.date, c(d.totalValue), c(d.invested), c(d.cash), c(d.unrealized), d.growthPct, d.currency, new Date().toISOString());
      created++;
    }

    // rules
    for (const r of plan.rules.create) {
      const categoryId = idOf(r.category);
      if (!categoryId) continue;
      const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM category_rules').get() as Row).s;
      db.prepare('INSERT INTO category_rules (sort, enabled, match_text, account, category_id) VALUES (?, 1, ?, ?, ?)').run(sort, r.text, r.account, categoryId);
      created++;
    }

    // profile: only the fields the file differs on
    if (plan.profile) {
      const merged = { ...getProfile(), ...Object.fromEntries(plan.profile.changes.map((k) => [k, plan.profile!.value[k]])) };
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('profile', ?)").run(JSON.stringify(merged));
      updated++;
    }
  })();
  return { backup, created, updated };
}

