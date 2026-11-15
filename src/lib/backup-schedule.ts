import 'server-only';
import { getSetting, setSetting } from './db';
import { appVersion, createBackupNow, newestBackupMs } from './backup';
import { describeError } from './security';

export const SCHEDULE_MODES = ['off', 'daily', 'weekly'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];
/** Weekly unless the person chose otherwise (see the operator note in plan 021). */
export const DEFAULT_SCHEDULE: ScheduleMode = 'weekly';

const HOUR = 60 * 60 * 1000;
const CHECK_EVERY_MS = HOUR;
/** Each period is shortened by one check interval, so the hourly check never drifts a whole extra period. */
const INTERVAL_MS: Record<Exclude<ScheduleMode, 'off'>, number> = { daily: 24 * HOUR - CHECK_EVERY_MS, weekly: 7 * 24 * HOUR - CHECK_EVERY_MS };
const SETTING_KEY = 'backup_schedule';

export const asScheduleMode = (v: unknown): ScheduleMode | null => SCHEDULE_MODES.find((m) => m === v) ?? null;

export const getBackupSchedule = (): ScheduleMode => asScheduleMode(getSetting(SETTING_KEY)) ?? DEFAULT_SCHEDULE;

export const saveBackupSchedule = (mode: ScheduleMode) => setSetting(SETTING_KEY, mode);

/** Pure: is a new automatic backup due? `lastMs` is when the newest automatic copy was made (null = never). */
export function isBackupDue(mode: ScheduleMode, lastMs: number | null, now: number): boolean {
  if (mode === 'off') return false;
  return lastMs === null || now - lastMs >= INTERVAL_MS[mode];
}

/** Makes an automatic backup if one is due. Returns the new database file name, or null when nothing was due. */
export function runScheduledBackup(now: number = Date.now()): string | null {
  if (!isBackupDue(getBackupSchedule(), newestBackupMs('auto'), now)) return null;
  return createBackupNow(appVersion(), 'auto').db;
}

const globalForBackup = globalThis as unknown as { __nestfundBackupTimer?: NodeJS.Timeout };

/** Checks shortly after start (so a missed backup is made up after a restart), then hourly. Errors are logged, never thrown. */
export function startBackupScheduler() {
  if (globalForBackup.__nestfundBackupTimer) return;
  const loop = () => {
    try {
      runScheduledBackup();
    } catch (err) {
      console.error('[backup] automatic backup failed:', describeError(err));
    }
    globalForBackup.__nestfundBackupTimer = setTimeout(loop, CHECK_EVERY_MS).unref();
  };
  globalForBackup.__nestfundBackupTimer = setTimeout(loop, 60_000).unref();
}
