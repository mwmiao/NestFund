import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// The data dir must point at a throwaway folder before anything that imports ./db is loaded.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-sched-'));
process.env.DATA_DIR = path.join(root, 'data');
const db = await import('@/lib/db');
const sched = await import('@/lib/backup-schedule');
const { createBackupNow } = await import('@/lib/backup');

const HOUR = 3_600_000;
const autoFiles = () => (fs.existsSync(db.BACKUP_DIR) ? fs.readdirSync(db.BACKUP_DIR).filter((n) => n.startsWith('nestfund-auto-')) : []);

afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  for (const n of autoFiles()) fs.rmSync(path.join(db.BACKUP_DIR, n), { recursive: true, force: true });
  db.getDb().prepare("DELETE FROM settings WHERE key = 'backup_schedule'").run();
});

describe('isBackupDue', () => {
  const now = Date.UTC(2026, 10, 15, 12);
  it('is never due when off', () => {
    expect(sched.isBackupDue('off', null, now)).toBe(false);
    expect(sched.isBackupDue('off', now - 100 * 24 * HOUR, now)).toBe(false);
  });
  it('daily: due when never made or at least a day old', () => {
    expect(sched.isBackupDue('daily', null, now)).toBe(true);
    expect(sched.isBackupDue('daily', now - 22 * HOUR, now)).toBe(false);
    expect(sched.isBackupDue('daily', now - 24 * HOUR, now)).toBe(true);
  });
  it('weekly: due after about seven days', () => {
    expect(sched.isBackupDue('weekly', now - 3 * 24 * HOUR, now)).toBe(false);
    expect(sched.isBackupDue('weekly', now - 7 * 24 * HOUR, now)).toBe(true);
  });
});

describe('schedule setting', () => {
  it('defaults to weekly, stores a mode and rejects an unknown one', () => {
    expect(sched.getBackupSchedule()).toBe('weekly');
    sched.saveBackupSchedule('daily');
    expect(sched.getBackupSchedule()).toBe('daily');
    expect(sched.asScheduleMode('hourly')).toBeNull();
  });
});

describe('runScheduledBackup', () => {
  it('creates one automatic copy, then waits until the next one is due', () => {
    sched.saveBackupSchedule('daily');
    const name = sched.runScheduledBackup();
    expect(name).toMatch(/^nestfund-auto-.*\.db$/);
    expect(autoFiles().some((n) => n.endsWith('.json'))).toBe(true);
    const count = autoFiles().length;
    expect(sched.runScheduledBackup()).toBeNull();
    expect(autoFiles()).toHaveLength(count);
    expect(sched.runScheduledBackup(Date.now() + 25 * HOUR)).toMatch(/^nestfund-auto-/);
  });
  it('creates nothing when off', () => {
    sched.saveBackupSchedule('off');
    expect(sched.runScheduledBackup()).toBeNull();
    expect(autoFiles()).toEqual([]);
  });
  it('leaves manual backups with their own name', () => {
    expect(createBackupNow().db).toMatch(/^nestfund-backup-/);
  });
});
