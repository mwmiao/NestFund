import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { seedDatabase } from './seed';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense',
  monthly_budget INTEGER,
  builtin INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account TEXT,
  start_month TEXT,
  end_month TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS month_budgets (
  month TEXT PRIMARY KEY,
  income INTEGER NOT NULL,
  extra_income INTEGER NOT NULL DEFAULT 0,
  meal_card INTEGER NOT NULL,
  items TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  subcategory TEXT,
  account TEXT NOT NULL DEFAULT 'ctt',
  to_account TEXT,
  payment_method TEXT NOT NULL,
  merchant TEXT,
  notes TEXT,
  attachment TEXT,
  recurring INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT,
  last_generated TEXT,
  parent_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  target INTEGER NOT NULL,
  current INTEGER NOT NULL DEFAULT 0,
  monthly INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  color TEXT NOT NULL,
  account TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  account TEXT NOT NULL,
  value INTEGER NOT NULL,
  invested INTEGER NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_snap_date ON snapshots(account, date);
`;

/**
 * Schema changes after v1 go here, in order. Each runs once and bumps PRAGMA user_version,
 * so a Watchtower update never needs a manual step. Example: 'ALTER TABLE goals ADD COLUMN icon TEXT'.
 */
const MIGRATIONS: string[] = [];

function migrate(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true }) as number;
  // version 0 = database just created from SCHEMA, which is already the latest shape.
  if (version > 0) {
    db.transaction(() => {
      for (let v = version; v <= MIGRATIONS.length; v++) db.exec(MIGRATIONS[v - 1]);
    })();
  }
  db.pragma(`user_version = ${MIGRATIONS.length + 1}`);
}

const globalForDb = globalThis as unknown as { __nestfundDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__nestfundDb) return globalForDb.__nestfundDb;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, 'nestfund.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'seeded'").get();
  if (!seeded) {
    // Categories, profile and the budget template are always created; sample history is optional.
    db.transaction(() => seedDatabase(db, { sample: process.env.SEED_SAMPLE_DATA !== 'false' }))();
  }
  globalForDb.__nestfundDb = db;
  return db;
}

export const toCents = (euros: number) => Math.round(euros * 100);
export const fromCents = (cents: number) => cents / 100;
