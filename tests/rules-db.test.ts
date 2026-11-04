import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SCHEMA, migrate } from '@/lib/schema';

describe('category_rules migration', () => {
  it('upgrades a v1.2 database without touching its data', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // Pre-1.3 shape: the full schema minus the new table, at the previous user_version.
    db.exec(SCHEMA.replace(/CREATE TABLE IF NOT EXISTS category_rules[\s\S]*?\);\n/, ''));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'category_rules'").get()).toBeUndefined();
    db.prepare("INSERT INTO categories (key, name, color, kind, builtin) VALUES ('food', 'food', '#000', 'expense', 1)").run();
    db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, category_id) VALUES ('2026-11-01', 1250, 'purchase', 'Lidl', 'ctt', 'card', 1)").run();
    db.pragma('user_version = 2'); // a v1.2 database: only the rules migration (and later ones) are pending

    migrate(db);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'category_rules'").get()).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM categories').get()).toEqual({ n: 1 });
  });

  it('deleting a category removes its rules but never its transactions', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    db.prepare("INSERT INTO categories (id, key, name, color, kind, builtin) VALUES (9, NULL, 'Custom', '#000', 'expense', 0)").run();
    db.prepare("INSERT INTO category_rules (match_text, category_id) VALUES ('lidl', 9)").run();
    db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, category_id) VALUES ('2026-11-01', 100, 'purchase', 'x', 'ctt', 'card', 9)").run();
    db.prepare('DELETE FROM categories WHERE id = 9').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM category_rules').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n, MAX(category_id) AS c FROM transactions').get()).toEqual({ n: 1, c: null });
  });
});
