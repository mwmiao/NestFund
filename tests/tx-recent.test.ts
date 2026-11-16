import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SCHEMA } from '@/lib/schema';
import { recentEntries } from '@/lib/tx-recent';

function open() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  db.prepare("INSERT INTO categories (id, key, name, color, kind, builtin) VALUES (1, NULL, 'Groceries', '#000', 'expense', 0), (2, NULL, 'Coffee', '#000', 'expense', 0)").run();
  return db;
}
const add = (db: Database.Database, daysAgo: number, type: string, description: string, account: string, categoryId: number | null) =>
  db
    .prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, category_id) VALUES (date('now', ?), 100, ?, ?, ?, 'card', ?)")
    .run(`-${daysAgo} days`, type, description, account, categoryId);

describe('recent purchases offered for one-tap repeat', () => {
  it('orders by how often a description was used and ignores case', () => {
    const db = open();
    add(db, 3, 'purchase', 'Lidl', 'meal_card', 1);
    add(db, 2, 'purchase', 'lidl', 'meal_card', 1);
    add(db, 1, 'purchase', 'Cafe', 'revolut', 2);
    expect(recentEntries(db).map((r) => r.description.toLowerCase())).toEqual(['lidl', 'cafe']);
  });
  it('takes the category and account from the latest use', () => {
    const db = open();
    add(db, 9, 'purchase', 'Lidl', 'ctt', null);
    add(db, 1, 'purchase', 'Lidl', 'meal_card', 1);
    expect(recentEntries(db)).toEqual([{ description: 'Lidl', categoryId: 1, account: 'meal_card' }]);
  });
  it('leaves out income, transfers and anything older than 180 days', () => {
    const db = open();
    add(db, 1, 'income', 'Salary', 'ctt', null);
    add(db, 1, 'transfer', 'To savings', 'ctt', null);
    add(db, 200, 'purchase', 'Old shop', 'ctt', null);
    expect(recentEntries(db)).toEqual([]);
  });
  it('respects the limit', () => {
    const db = open();
    for (const d of ['a', 'b', 'c']) add(db, 1, 'purchase', d, 'ctt', null);
    expect(recentEntries(db, 2)).toHaveLength(2);
  });
});
