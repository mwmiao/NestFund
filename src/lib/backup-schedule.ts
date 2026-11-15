import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, getDb } from './db';
import { appVersion, createBackupNow } from './backup';
import { describeError } from './security';

export const SCHEDULE_MODES = ['off', 'daily', 'weekly'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];
/** Weekly unless the person chose otherwise (see the operator note in plan 021). */
export const DEFAULT_SCHEDULE: ScheduleMode = 'weekly';

const HOUR = 60 * 60 * 1000;
/** A little under the nominal period, so the hourly check never drifts a whole extra period. */
const INTERVAL_MS: Record<Exclude<ScheduleMode, 'off'>, number> = { daily: 23 * HOUR, weekly: 6 * 24 * HOUR + 23 * HOUR };
const SETTING_KEY = 'backup_schedule';
const AUTO_DB = /^nestfund-auto-[A-Za-z0-9._-]+\.db$/;

export const asScheduleMode = (v: unknown): ScheduleMode | null => SCHEDULE_MODES.find((m) => m === v) ?? null;

export function getBackupSchedule(): ScheduleMode {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY) as { value: string } | undefined;
  try {
    return asScheduleMode(row ? JSON.parse(row.value) : null) ?? DEFAULT_SCHEDULE;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

/** Returns false (and stores nothing) when `mode` is not one of the known modes. */
export function saveBackupSchedule(mode: unknown): boolean {
  const m = asScheduleMode(mode);
  if (!m) return false;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(SETTING_KEY, JSON.stringify(m));
  return true;
}

/** Pure: is a new automatic backup due? `lastMs` is when the newest automatic copy was made (null = never). */
export function isBackupDue(mode: ScheduleMode, lastMs: number | null, now: number): boolean {
  if (mode === 'off') return false;
  return lastMs === null || now - lastMs >= INTERVAL_MS[mode];
}

/** Modification time of the newest automatic database copy, or null. Survives restarts because it is read from disk. */
export function lastAutomaticBackupMs(dir: string = BACKUP_DIR): number | null {
  if (!fs.existsSync(dir)) return null;
  let last: number | null = null;
  for (const name of fs.readdirSync(dir)) {
    if (!AUTO_DB.test(name)) continue;
    const t = fs.statSync(path.join(dir, name)).mtimeMs;
    if (last === null || t > last) last = t;
  }
  return last;
}

/** Makes an automatic backup if one is due. Returns the new database file name, or null when nothing was due. */
export function runScheduledBackup(now: number = Date.now()): string | null {
  if (!isBackupDue(getBackupSchedule(), lastAutomaticBackupMs(), now)) return null;
  return createBackupNow(appVersion(), 'nestfund-auto').db;
}

const CHECK_EVERY_MS = HOUR;
const globalForBackup = globalThis as unknown as { __nestfundBackupTimer?: NodeJS.Timeout };

/** Checks once an hour (and shortly after start, so a missed backup is made up after a restart). Errors are logged, never thrown. */
export function startBackupScheduler() {
  if (globalForBackup.__nestfundBackupTimer) return;
  const tick = () => {
    try {
      runScheduledBackup();
    } catch (err) {
      console.error('[backup] automatic backup failed:', describeError(err));
    }
  };
  setTimeout(tick, 60_000).unref();
  globalForBackup.__nestfundBackupTimer = setInterval(tick, CHECK_EVERY_MS);
  globalForBackup.__nestfundBackupTimer.unref();
}
