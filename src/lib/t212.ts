import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, fromCents, getDb, toCents } from './db';
import { todayISO } from './dates';
import { describeError } from './security';
import { decryptSecret, encryptSecret, keyFromPassphrase } from './secret-box';
import { T212Error, fetchT212, retryAtAfter, type T212Credentials, type T212Env, type T212ErrorCode, type T212Metrics, type T212Position, type T212RateLimit } from './t212-core';
import { SERVER_POLL_MIN_AGE_MS, type PollResult } from './t212-polling';

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
  lastError?: { code: T212SyncErrorCode; status?: number; at: string } | null;
  positionsError?: T212ErrorCode | null;
  metrics?: T212Metrics;
  positions?: T212Position[];
  lastChangedAt?: string | null; // ISO, last time total / invested / gain-loss actually changed
  retryAt?: string | null; // ISO, after a 429: no request before this
  rateLimit?: (T212RateLimit & { at: string }) | null; // x-ratelimit-* of the latest response
  syncStartedAt?: string | null; // cross-process lock (scheduler and "Sync now" may run in different module instances)
}

/** API errors plus local ones: the stored key cannot be decrypted, or NestFund itself failed. */
export type T212SyncErrorCode = T212ErrorCode | 'key_unreadable' | 'internal';

/** Errors only the user can fix (new key / permissions): no automatic retries until they act. */
const NEEDS_USER_ACTION: ReadonlySet<T212SyncErrorCode> = new Set(['auth', 'forbidden', 'key_unreadable']);
const LOCK_TTL_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** What the UI may see: never the key or secret. */
export interface T212Status {
  connected: boolean;
  env: T212Env;
  keyHint: string | null;
  hasSecret: boolean;
  /** Last successful check (values may be unchanged). */
  lastSyncAt: string | null;
  /** Last time the values changed. */
  lastChangedAt: string | null;
  /** After a 429: no request before this. */
  retryAt: string | null;
  rateLimit: NonNullable<StoredState['rateLimit']> | null;
  /** When the next automatic attempt is due; null when it waits for the user (e.g. invalid key). */
  nextSyncAt: string | null;
  lastError: StoredState['lastError'];
  needsAction: boolean;
  /** Last successful sync is older than 24 hours. */
  stale: boolean;
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

function nextAttemptAt(s: StoredState, maxAgeMs = T212_SYNC_INTERVAL_MS): number | null {
  if (!s.apiKey) return null;
  if (s.lastError && NEEDS_USER_ACTION.has(s.lastError.code)) return null;
  const lastSync = s.lastSyncAt ? Date.parse(s.lastSyncAt) : 0;
  const lastAttempt = s.lastAttemptAt ? Date.parse(s.lastAttemptAt) : 0;
  const retryAt = s.retryAt ? Date.parse(s.retryAt) || 0 : 0;
  const base = s.lastError ? Math.max(lastSync + maxAgeMs, lastAttempt + Math.min(RETRY_AFTER_ERROR_MS, maxAgeMs)) : lastSync + maxAgeMs;
  return Math.max(base, retryAt); // never before the rate-limit reset
}

export function getT212Status(): T212Status {
  const s = readState();
  const connected = !!s.apiKey;
  // A stored key that can no longer be decrypted is surfaced instead of failing silently.
  const lastError = connected && !credentials(s) ? { code: 'key_unreadable' as const, at: s.lastAttemptAt ?? new Date().toISOString() } : (s.lastError ?? null);
  const next = nextAttemptAt({ ...s, lastError });
  return {
    connected,
    env: s.env,
    keyHint: s.keyHint ?? null,
    hasSecret: !!s.apiSecret,
    lastSyncAt: s.lastSyncAt ?? null,
    lastChangedAt: s.lastChangedAt ?? null,
    retryAt: s.retryAt && Date.parse(s.retryAt) > Date.now() ? s.retryAt : null,
    rateLimit: s.rateLimit ?? null,
    nextSyncAt: next ? new Date(next).toISOString() : null,
    lastError,
    needsAction: !!lastError && NEEDS_USER_ACTION.has(lastError.code),
    stale: connected && !!s.lastSyncAt && Date.now() - Date.parse(s.lastSyncAt) > STALE_AFTER_MS,
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

/** Did total value, invested capital or gain/loss change (to the cent) compared with the last stored values? */
export function metricsChanged(prev: T212Metrics | undefined, next: T212Metrics): boolean {
  if (!prev) return true;
  return toCents(prev.totalValue) !== toCents(next.totalValue) || toCents(prev.invested) !== toCents(next.invested) || toCents(prev.unrealized) !== toCents(next.unrealized);
}

function hasHistoryToday(): boolean {
  return !!getDb().prepare('SELECT 1 FROM t212_history WHERE date = ?').get(todayISO());
}

let syncing: Promise<T212SyncResult> | null = null;

export type T212SyncResult =
  | { ok: true }
  | { ok: false; code: T212SyncErrorCode | 'not_connected' | 'too_soon' | 'skipped' | 'in_progress'; retryAt?: string };

/** Shapes a sync outcome for the browser poller: timestamps only, never keys or balances. */
export function pollResult(result: T212SyncResult): PollResult {
  const s = readState();
  const retryAt = s.retryAt && Date.parse(s.retryAt) > Date.now() ? s.retryAt : null;
  const code = result.ok ? undefined : result.code;
  const lastError = s.lastError?.code;
  return {
    ok: result.ok,
    code,
    lastSyncAt: s.lastSyncAt ?? null,
    retryAt,
    lastChangedAt: s.lastChangedAt ?? null,
    needsAction: !!s.apiKey && !!lastError && NEEDS_USER_ACTION.has(lastError),
  };
}

/** One poll from the dashboard / portfolio page (or "Sync now" when manual). */
export async function pollT212({ manual = false } = {}): Promise<PollResult> {
  const result = await syncT212(manual ? { force: true } : { maxAgeMs: SERVER_POLL_MIN_AGE_MS });
  return pollResult(result);
}

/** Takes the cross-process sync lock atomically; false if another sync holds a fresh lock. */
function acquireLock(): boolean {
  const db = getDb();
  return db.transaction(() => {
    const s = readState();
    if (s.syncStartedAt && Date.now() - Date.parse(s.syncStartedAt) < LOCK_TTL_MS) return false;
    writeState({ ...s, syncStartedAt: new Date().toISOString() });
    return true;
  }).immediate();
}

/**
 * Runs a read-only sync. `force` is the "Sync now" button; otherwise it runs when the last
 * success is 6 hours old (30 minutes after a temporary error; never on its own after an invalid
 * key). Failures only update the connection status: manual data and last values are untouched.
 */
export async function syncT212({ force = false, maxAgeMs = T212_SYNC_INTERVAL_MS } = {}): Promise<T212SyncResult> {
  if (syncing) return syncing;
  const state = readState();
  if (!state.apiKey) return { ok: false, code: 'not_connected' };
  const creds = credentials(state);
  if (!creds) {
    writeState({ ...state, lastError: { code: 'key_unreadable', at: new Date().toISOString() } });
    return { ok: false, code: 'key_unreadable' };
  }
  const now = Date.now();
  const lastAttempt = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  if (now - lastAttempt < MIN_MANUAL_INTERVAL_MS) return { ok: false, code: 'too_soon' };
  // After a 429 nothing (not even "Sync now") goes out before the reset time announced by Trading 212.
  const retryAt = state.retryAt ? Date.parse(state.retryAt) : 0;
  if (retryAt > now) return { ok: false, code: 'rate_limit', retryAt: state.retryAt! };
  const due = nextAttemptAt(state, maxAgeMs);
  if (!force && (due === null || now < due)) return { ok: false, code: 'skipped' };
  if (!acquireLock()) return { ok: false, code: 'in_progress' };

  syncing = (async (): Promise<T212SyncResult> => {
    const at = new Date().toISOString();
    let result: T212SyncResult;
    try {
      const snap = await fetchT212(creds);
      const before = readState();
      // History only when something changed (plus the day's first row, so the daily series has no gaps);
      // otherwise just the "last checked" timestamp moves.
      const changed = metricsChanged(before.metrics, snap.metrics);
      if (changed || !hasHistoryToday()) recordSync(snap.metrics, at);
      const current = readState();
      const exhausted = snap.rateLimit?.remaining === 0 || snap.positionsError === 'rate_limit';
      writeState({
        ...current,
        lastAttemptAt: at,
        lastSyncAt: at,
        lastChangedAt: changed ? at : (current.lastChangedAt ?? at),
        retryAt: exhausted ? new Date(retryAtAfter(snap.rateLimit)).toISOString() : null,
        rateLimit: snap.rateLimit ? { ...snap.rateLimit, at } : current.rateLimit,
        lastError: null,
        metrics: snap.metrics,
        positions: snap.positions ?? current.positions ?? [],
        positionsError: snap.positionsError,
      });
      result = { ok: true };
    } catch (err) {
      // T212Error = the API said no; anything else is a problem inside NestFund (e.g. disk), not the network.
      const code: T212SyncErrorCode = err instanceof T212Error ? err.code : 'internal';
      if (!(err instanceof T212Error)) console.error('[trading212] sync failed:', describeError(err));
      const rl = err instanceof T212Error ? err.rateLimit : null;
      // 429: schedule the next try only after x-ratelimit-reset (never an immediate retry).
      const retryAt = code === 'rate_limit' ? new Date(retryAtAfter(rl)).toISOString() : null;
      const cur = readState();
      writeState({
        ...cur,
        lastAttemptAt: at,
        lastError: { code, status: err instanceof T212Error ? err.status : undefined, at },
        retryAt: retryAt ?? (cur.retryAt && Date.parse(cur.retryAt) > Date.now() ? cur.retryAt : null),
        rateLimit: rl ? { ...rl, at } : cur.rateLimit,
      });
      result = retryAt ? { ok: false, code, retryAt } : { ok: false, code };
    } finally {
      writeState({ ...readState(), syncStartedAt: null });
      syncing = null;
    }
    return result;
  })();
  return syncing;
}

/** Validates the credentials with a live read-only call before storing them encrypted. */
export async function connectT212(input: T212Credentials): Promise<T212SyncResult> {
  let snap;
  try {
    snap = await fetchT212(input);
  } catch (err) {
    return { ok: false, code: err instanceof T212Error ? err.code : 'internal' };
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
    lastChangedAt: at,
    rateLimit: snap.rateLimit ? { ...snap.rateLimit, at } : null,
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
