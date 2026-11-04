import 'server-only';
import { getDb } from './db';

// Results of read queries are kept until the database changes. The version key combines SQLite's
// total_changes() (every write made through this connection, including inside transactions) with
// PRAGMA data_version (writes by any other connection), so a cached value can never outlive a change.
// That makes "open the dashboard again" free, while the first read after any edit is always fresh.

type Entry = { version: string; value: unknown };
const store = ((globalThis as { __nestfundMemo?: Map<string, Entry> }).__nestfundMemo ??= new Map<string, Entry>());
const MAX_ENTRIES = 80;

export function dataVersion(): string {
  const db = getDb();
  const changes = (db.prepare('SELECT total_changes() AS c').get() as { c: number }).c;
  return `${changes}:${db.pragma('data_version', { simple: true })}`;
}

/** Runs `fn` once per database version for the given key. Arrays are frozen so a caller cannot corrupt the shared value. */
export function memo<T>(key: string, fn: () => T): T {
  const version = dataVersion();
  const hit = store.get(key);
  if (hit && hit.version === version) return hit.value as T;
  const value = fn();
  if (Array.isArray(value)) Object.freeze(value);
  store.delete(key);
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  store.set(key, { version, value });
  return value;
}
