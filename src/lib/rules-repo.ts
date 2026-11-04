import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, getDb } from './db';
import { normalize, ruleMatches, type HistoryHints } from './categorize';
import { ACCOUNT_IDS, type AccountId } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface CategoryRule {
  id: number;
  sort: number;
  enabled: boolean;
  text: string;
  account: AccountId | null;
  categoryId: number;
}

const mapRule = (r: Row): CategoryRule => ({
  id: r.id,
  sort: r.sort,
  enabled: !!r.enabled,
  text: r.match_text,
  account: ACCOUNT_IDS.includes(r.account) ? r.account : null,
  categoryId: r.category_id,
});

export function listRules(): CategoryRule[] {
  return (getDb().prepare('SELECT * FROM category_rules ORDER BY sort, id').all() as Row[]).map(mapRule);
}

export function getRule(id: number): CategoryRule | null {
  const row = getDb().prepare('SELECT * FROM category_rules WHERE id = ?').get(id) as Row | undefined;
  return row ? mapRule(row) : null;
}

/** Creates (new rules go last, i.e. lowest priority) or updates a rule. Returns its id. */
export function saveRule(rule: { id?: number; text: string; account: AccountId | null; categoryId: number }): number {
  const db = getDb();
  const text = rule.text.trim();
  if (!text) throw new Error('Rule text is required');
  if (rule.id) {
    db.prepare('UPDATE category_rules SET match_text = ?, account = ?, category_id = ? WHERE id = ?').run(text, rule.account, rule.categoryId, rule.id);
    return rule.id;
  }
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM category_rules').get() as Row).s;
  return Number(db.prepare('INSERT INTO category_rules (sort, enabled, match_text, account, category_id) VALUES (?, 1, ?, ?, ?)').run(sort, text, rule.account, rule.categoryId).lastInsertRowid);
}

export function setRuleEnabled(id: number, enabled: boolean) {
  getDb().prepare('UPDATE category_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function deleteRule(id: number) {
  getDb().prepare('DELETE FROM category_rules WHERE id = ?').run(id);
}

/** Swaps a rule with its neighbour so the order is explicit and stable (renumbers 1..n). */
export function moveRule(id: number, direction: 'up' | 'down') {
  const db = getDb();
  const ids = (db.prepare('SELECT id FROM category_rules ORDER BY sort, id').all() as Row[]).map((r) => r.id as number);
  const i = ids.indexOf(id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const update = db.prepare('UPDATE category_rules SET sort = ? WHERE id = ?');
  db.transaction(() => ids.forEach((rid, n) => update.run(n + 1, rid)))();
}

/** What the user categorised before: for each merchant / description, the category used most often (last ~3000 categorised transactions). */
export function historyHints(): HistoryHints {
  const rows = getDb()
    .prepare("SELECT description, merchant, category_id FROM transactions WHERE category_id IS NOT NULL AND type != 'transfer' ORDER BY date DESC, id DESC LIMIT 3000")
    .all() as Row[];
  const tally = (pick: (r: Row) => string | null) => {
    const counts = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const key = normalize(pick(r) ?? '');
      if (key.length < 3) continue;
      const m = counts.get(key) ?? new Map<number, number>();
      m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
      counts.set(key, m);
    }
    const out: Record<string, number> = {};
    for (const [key, m] of counts) out[key] = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return out;
  };
  return { merchants: tally((r) => r.merchant), descriptions: tally((r) => r.description) };
}

export interface RuleMatch {
  id: number;
  date: string;
  description: string;
  merchant: string | null;
  account: AccountId;
  amount: number;
  type: string;
  currentCategoryId: number | null;
}

/**
 * Old transactions this rule would change. scope "empty" = only uncategorised ones (safe default),
 * "all" = also ones that already have a different category. Read-only: nothing is modified here.
 */
export function previewRule(rule: CategoryRule, scope: 'empty' | 'all'): RuleMatch[] {
  const rows = getDb().prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all() as Row[];
  return rows
    .filter((r) => (scope === 'empty' ? r.category_id == null : r.category_id !== rule.categoryId))
    .filter((r) => ruleMatches(rule, { description: r.description, merchant: r.merchant, account: r.account }))
    .map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      merchant: r.merchant,
      account: r.account,
      amount: r.amount / 100,
      type: r.type,
      currentCategoryId: r.category_id,
    }));
}

/**
 * Sets the rule's category on exactly the chosen transactions. Each id is re-checked against the rule,
 * so a stale or tampered form can never touch a transaction the rule does not match. Only category_id changes;
 * a full database copy is taken first.
 */
export function applyRule(rule: CategoryRule, ids: number[]): { changed: number; backup: string } {
  const db = getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `nestfund-before-rule-${rule.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.prepare('VACUUM INTO ?').run(backup);
  const get = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const set = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?');
  let changed = 0;
  db.transaction(() => {
    for (const id of new Set(ids)) {
      const r = get.get(id) as Row | undefined;
      if (r && ruleMatches(rule, { description: r.description, merchant: r.merchant, account: r.account }) && r.category_id !== rule.categoryId) {
        set.run(rule.categoryId, id);
        changed++;
      }
    }
  })();
  return { changed, backup };
}
