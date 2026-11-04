import type Database from 'better-sqlite3';
import { todayISO } from './dates';
import type { Profile } from './types';

/** Fresh start: every amount is zero until the user enters their own values (see /setup). */
export const DEFAULT_PROFILE: Profile = {
  incomeMin: 0,
  incomeMax: 0,
  defaultIncome: 0,
  mealCard: 0,
  transportAllowance: 0,
  annualBonus: 0,
};

// key, color, kind — names are translated in the UI from `categories.<key>`. No budgets are preset.
export const DEFAULT_CATEGORIES: [string, string, string][] = [
  ['food', '#22c55e', 'expense'],
  ['restaurants', '#f97316', 'expense'],
  ['transport', '#0ea5e9', 'expense'],
  ['home', '#a855f7', 'expense'],
  ['health', '#ef4444', 'expense'],
  ['gym', '#14b8a6', 'expense'],
  ['muay_thai', '#dc2626', 'expense'],
  ['subscriptions', '#6366f1', 'expense'],
  ['tech', '#3b82f6', 'expense'],
  ['gaming', '#8b5cf6', 'expense'],
  ['collectibles', '#eab308', 'expense'],
  ['cosplay', '#ec4899', 'expense'],
  ['clothing', '#f43f5e', 'expense'],
  ['personal_care', '#06b6d4', 'expense'],
  ['travel', '#84cc16', 'expense'],
  ['leisure', '#f59e0b', 'expense'],
  ['investment', '#10b981', 'investment'],
  ['savings', '#059669', 'savings'],
  ['salary', '#16a34a', 'salary'],
  ['income', '#4ade80', 'income'],
  ['other', '#71717a', 'expense'],
];

/** Creates the essentials only: zeroed profile and the built-in categories. */
export function seedDatabase(db: Database.Database) {
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  setSetting.run('profile', JSON.stringify(DEFAULT_PROFILE));
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (key, name, color, kind, monthly_budget, builtin, sort) VALUES (?, ?, ?, ?, NULL, 1, ?)');
  DEFAULT_CATEGORIES.forEach(([key, color, kind], i) => insertCat.run(key, key, color, kind, i));
  setSetting.run('seeded', todayISO());
}

/**
 * Wipes every user record (transactions, balances, budgets, goals, custom categories, profile,
 * Trading 212 connection and history) and restores the fresh-start state.
 * The schema, built-in categories and language/theme preferences are kept.
 */
export function resetAllData(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
      DELETE FROM transactions;
      DELETE FROM snapshots;
      DELETE FROM month_budgets;
      DELETE FROM budget_items;
      DELETE FROM goals;
      DELETE FROM categories;
      DELETE FROM t212_history;
      DELETE FROM interest_credits;
      DELETE FROM settings WHERE key IN ('profile', 'onboarding', 't212');
    `);
    // Built-in categories come back with their original name, colour and kind, and no budget.
    seedDatabase(db);
  })();
}

/**
 * True when the database still holds the demo data shipped with v1.0.0
 * (identified by its exact Trading 212 sample balance of 9.242,30 € / 8.255,97 € invested).
 */
export function hasLegacySampleData(db: Database.Database): boolean {
  // The sample used the owner's real starting ETF values, so a balance alone proves nothing (it matched
  // real data). Only transactions that existed solely in the v1.0.0 sample identify it — all of them must be present.
  const markers: [string, string][] = [
    ['Venda no Vinted', 'Vinted'],
    ['Tecido e espuma EVA', 'Retrosaria'],
    ['Almoço', 'Tasca do Zé'],
    ['Café e bolos', 'Pastelaria'],
  ];
  const has = db.prepare('SELECT 1 FROM transactions WHERE description = ? AND merchant = ? LIMIT 1');
  return markers.every(([description, merchant]) => !!has.get(description, merchant));
}
