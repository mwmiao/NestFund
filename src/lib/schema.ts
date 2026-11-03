import type Database from 'better-sqlite3';

// SQLite schema in its latest shape. Changes to existing databases go through MIGRATIONS below.
export const SCHEMA = `
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
  notes TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_snap_date ON snapshots(account, date);

-- Daily Trading 212 history from the API (one row per day, last sync of the day wins). Amounts in cents.
CREATE TABLE IF NOT EXISTS t212_history (
  date TEXT PRIMARY KEY,
  total_value INTEGER NOT NULL,
  invested INTEGER NOT NULL,
  cash INTEGER NOT NULL,
  unrealized INTEGER NOT NULL,
  growth_pct REAL NOT NULL,
  currency TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
`;

/**
 * Changes applied to databases created by older versions, in order. Each runs once and
 * PRAGMA user_version records progress, so a Watchtower update never needs a manual step.
 * v1.0.0 databases are at user_version 1.
 */
export const MIGRATIONS: string[] = [
  // v1.1.0: when a balance was recorded, so same-day movements logged afterwards still count.
  'ALTER TABLE snapshots ADD COLUMN created_at TEXT',
];

export function migrate(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true }) as number;
  // version 0 = database just created from SCHEMA, which is already the latest shape.
  if (version > 0) {
    db.transaction(() => {
      for (let v = version; v <= MIGRATIONS.length; v++) db.exec(MIGRATIONS[v - 1]);
    })();
  }
  db.pragma(`user_version = ${MIGRATIONS.length + 1}`);
}
