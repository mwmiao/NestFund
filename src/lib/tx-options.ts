import 'server-only';
import type { TFunction } from '@/i18n/config';
import { getDb } from './db';
import { categoryName } from './labels';
import { listCategories } from './repo';
import { historyHints, listRules } from './rules-repo';
import { ACCOUNT_IDS, type AccountId } from './types';

/** Data the transaction form needs: translated categories, autocomplete suggestions and the most-used recent account. */
export function transactionFormOptions(t: TFunction) {
  const db = getDb();
  const categories = listCategories().map((c) => ({ id: c.id, key: c.key, label: categoryName(c, t), color: c.color, kind: c.kind }));
  const column = (col: 'merchant' | 'subcategory') =>
    (db.prepare(`SELECT ${col} AS v FROM transactions WHERE ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY COUNT(*) DESC LIMIT 50`).all() as { v: string }[]).map(
      (r) => r.v,
    );
  const recent = db
    .prepare("SELECT account FROM transactions WHERE type IN ('purchase','expense','payment') AND date >= date('now', '-30 days') GROUP BY account ORDER BY COUNT(*) DESC LIMIT 1")
    .get() as { account: string } | undefined;
  const defaultAccount: AccountId = recent && ACCOUNT_IDS.includes(recent.account as AccountId) ? (recent.account as AccountId) : 'ctt';
  // One-tap chips: the six categories used most for spending in the last 90 days.
  const topCategoryIds = (
    db
      .prepare(
        `SELECT t.category_id AS id FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.type IN ('purchase','expense','payment') AND c.kind = 'expense' AND t.date >= date('now', '-90 days')
         GROUP BY t.category_id ORDER BY COUNT(*) DESC LIMIT 6`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
  const suggest = { rules: listRules().map((r) => ({ id: r.id, enabled: r.enabled, text: r.text, account: r.account, categoryId: r.categoryId })), history: historyHints() };
  return { categories, suggest, merchants: column('merchant'), subcategories: column('subcategory'), defaultAccount, topCategoryIds };
}
