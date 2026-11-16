import type Database from 'better-sqlite3';

/** A description the user logs often, with the category and account it had the last time. */
export interface RecentEntry {
  description: string;
  categoryId: number | null;
  account: string;
}

/**
 * The spending descriptions used most in the last 180 days (most used first), each with the category and account of its
 * latest use. Upper/lower case is ignored when grouping. With a single MAX() SQLite takes the other columns from that row.
 */
export function recentEntries(db: Database.Database, limit = 30): RecentEntry[] {
  return db
    .prepare(
      `SELECT description, category_id AS categoryId, account, COUNT(*) AS n, MAX(date || '#' || printf('%012d', id)) AS latest
       FROM transactions
       WHERE type IN ('purchase','expense','payment') AND TRIM(description) != '' AND date >= date('now', '-180 days')
       GROUP BY description COLLATE NOCASE
       ORDER BY n DESC, latest DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((r) => {
      const row = r as { description: string; categoryId: number | null; account: string };
      return { description: row.description, categoryId: row.categoryId, account: row.account };
    });
}
