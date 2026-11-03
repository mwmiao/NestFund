import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA, migrate } from './schema';
import { seedDatabase } from './seed';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const globalForDb = globalThis as unknown as { __nestfundDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__nestfundDb) return globalForDb.__nestfundDb;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, 'nestfund.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db, { backupDir: BACKUP_DIR });
  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'seeded'").get();
  // First run: only the zeroed profile and the built-in categories; everything else is entered by the user.
  if (!seeded) db.transaction(() => seedDatabase(db))();
  globalForDb.__nestfundDb = db;
  return db;
}

export const toCents = (euros: number) => Math.round(euros * 100);
export const fromCents = (cents: number) => cents / 100;
