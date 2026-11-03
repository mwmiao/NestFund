import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, fromCents, getDb, toCents } from './db';
import { todayISO } from './dates';
import { decryptSecret, encryptSecret, keyFromPassphrase } from './secret-box';
import { T212Error, fetchT212, type T212Credentials, type T212Env, type T212ErrorCode, type T212Metrics, type T212Position } from './t212-core';

export const T212_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MIN_MANUAL_INTERVAL_MS = 10_000; // the summary endpoint allows 1 request / 5 s
const RETRY_AFTER_ERROR_MS = 30 * 60 * 1000;
/** Notes marker for balance check-ins written by the integration (one per day). */
export const T212_SNAPSHOT_NOTE = 'auto:trading212';

interface StoredState {
  env: T212Env;
  apiKey?: string; // encrypted
  apiSecret?: string; // encrypted
  keyHint?: string; // last 4 characters, to recognise the key
  lastSyncAt?: string; // ISO, last successful sync
  lastAttemptAt?: string; // ISO, last attempt (success or failure)
  lastError?: { code: T212ErrorCode; status?: number; at: string } | null;
  positionsError?: T212ErrorCode | null;
  metrics?: T212Metrics;
  positions?: T212Position[];
}

/** What the UI may see: never the key or secret. */
export interface T212Status {
  connected: boolean;
  env: T212Env;
  keyHint: string | null;
  hasSecret: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: StoredState['lastError'];
  positionsError: T212ErrorCode | null;
  metrics: T212Metrics | null;
  positions: T212Position[];
}

// ---------------------------------------------------------------- encryption key

let cachedKey: Buffer | null = null;

/**
 * Encryption key for stored API credentials: NESTFUND_SECRET if set (recommended),
 * otherwise a random key generated once in DATA_DIR/secret.key (readable by the app user only).
 */
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (process.env.NESTFUND_SECRET) return (cachedKey = keyFromPassphrase(process.env.NESTFUND_SECRET));
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  cachedKey = fs.readFileSync(file);
  if (cachedKey.length !== 32) throw new Error('Invalid secret.key');
  return cachedKey;
}

// ---------------------------------------------------------------- state

function readState(): StoredState {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 't212'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as StoredState) : { env: 'live' };
}

function writeState(state: StoredState) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('t212', ?)").run(JSON.stringify(state));
}

function credentials(state: StoredState): T212Credentials | null {
  if (!state.apiKey) return null;
  try {
    const key = encryptionKey();
    return { env: state.env, apiKey: decryptSecret(state.apiKey, key), apiSecret: state.apiSecret ? decryptSecret(state.apiSecret, key) : undefined };
  } catch {
    // e.g. NESTFUND_SECRET changed: the stored key can no longer be read and must be entered again.
    return null;
  }
}

export function getT212Status(): T212Status {
  const s = readState();
  const connected = !!s.apiKey;
  return {
    connected,
    env: s.env,
    keyHint: s.keyHint ?? null,
    hasSecret: !!s.apiSecret,
    lastSyncAt: s.lastSyncAt ?? null,
    nextSyncAt: connected && s.lastSyncAt ? new Date(Date.parse(s.lastSyncAt) + T212_SYNC_INTERVAL_MS).toISOString() : null,
    lastError: s.lastError ?? null,
    positionsError: s.positionsError ?? null,
    metrics: s.metrics ?? null,
    positions: s.positions ?? [],
  };
}

export interface T212HistoryRow {
  date: string;
  totalValue: number;
  invested: number;
  cash: number;
  unrealized: number;
  growthPct: number;
}

export function listT212History(limit = 90): T212HistoryRow[] {
  const rows = getDb().prepare('SELECT * FROM t212_history ORDER BY date DESC LIMIT ?').all(limit) as Record<string, number & string>[];
  return rows
    .map((r) => ({
      date: r.date,
      totalValue: fromCents(r.total_value),
      invested: fromCents(r.invested),
      cash: fromCents(r.cash),
      unrealized: fromCents(r.unrealized),
      growthPct: r.growth_pct,
    }))
    .reverse();
}

// ---------------------------------------------------------------- sync

/** Stores one successful sync: daily history row + today's Trading 212 balance check-in. */
function recordSync(m: T212Metrics, at: string) {
  const db = getDb();
  const date = todayISO();
  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO t212_history (date, total_value, invested, cash, unrealized, growth_pct, currency, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(date, toCents(m.totalValue), toCents(m.invested), toCents(m.cash), toCents(m.unrealized), m.growthPct, m.currency, at);
    // The account balance used across the app: value = total; "invested" = total − unrealised P/L,
    // so the app's gain (value − invested) equals Trading 212's unrealised P/L.
    db.prepare("DELETE FROM snapshots WHERE account = 'trading212' AND date = ? AND notes = ?").run(date, T212_SNAPSHOT_NOTE);
    db.prepare("INSERT INTO snapshots (date, account, value, invested, notes, created_at) VALUES (?, 'trading212', ?, ?, ?, datetime('now'))").run(
      date,
      toCents(m.totalValue),
      toCents(m.totalValue - m.unrealized),
      T212_SNAPSHOT_NOTE,
    );
  })();
}

let syncing: Promise<T212SyncResult> | null = null;

export type T212SyncResult = { ok: true } | { ok: false; code: T212ErrorCode | 'not_connected' | 'too_soon' | 'skipped' };

/**
 * Runs a read-only sync. `force` is the "Sync now" button; otherwise it only runs when the
 * last success is older than 6 hours. Failures are recorded and never touch manual data.
 */
export async function syncT212({ force = false } = {}): Promise<T212SyncResult> {
  if (syncing) return syncing;
  const state = readState();
  const creds = credentials(state);
  if (!creds) return { ok: false, code: 'not_connected' };
  const now = Date.now();
  const lastAttempt = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  const lastSync = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
  if (now - lastAttempt < MIN_MANUAL_INTERVAL_MS) return { ok: false, code: 'too_soon' };
  if (!force && (now - lastSync < T212_SYNC_INTERVAL_MS || (state.lastError && now - lastAttempt < RETRY_AFTER_ERROR_MS))) {
    return { ok: false, code: 'skipped' };
  }

  syncing = (async (): Promise<T212SyncResult> => {
    const at = new Date().toISOString();
    try {
      const snap = await fetchT212(creds);
      recordSync(snap.metrics, at);
      writeState({
        ...readState(),
        lastAttemptAt: at,
        lastSyncAt: at,
        lastError: null,
        metrics: snap.metrics,
        positions: snap.positions ?? readState().positions ?? [],
        positionsError: snap.positionsError,
      });
      return { ok: true };
    } catch (err) {
      const code: T212ErrorCode = err instanceof T212Error ? err.code : 'network';
      writeState({ ...readState(), lastAttemptAt: at, lastError: { code, status: err instanceof T212Error ? err.status : undefined, at } });
      return { ok: false, code };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Validates the credentials with a live read-only call before storing them encrypted. */
export async function connectT212(input: T212Credentials): Promise<T212SyncResult> {
  let snap;
  try {
    snap = await fetchT212(input);
  } catch (err) {
    return { ok: false, code: err instanceof T212Error ? err.code : 'network' };
  }
  const key = encryptionKey();
  const at = new Date().toISOString();
  recordSync(snap.metrics, at);
  writeState({
    env: input.env,
    apiKey: encryptSecret(input.apiKey, key),
    apiSecret: input.apiSecret ? encryptSecret(input.apiSecret, key) : undefined,
    keyHint: input.apiKey.slice(-4),
    lastSyncAt: at,
    lastAttemptAt: at,
    lastError: null,
    metrics: snap.metrics,
    positions: snap.positions ?? [],
    positionsError: snap.positionsError,
  });
  return { ok: true };
}

/** Removes the stored credentials; synced history and balances are kept. */
export function disconnectT212() {
  const s = readState();
  writeState({ env: s.env, lastSyncAt: s.lastSyncAt, metrics: s.metrics, positions: s.positions });
}
