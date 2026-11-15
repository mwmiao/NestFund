# Plan 021: Automatic scheduled backups (off / daily / weekly), set in Settings › Backup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e5e57c4..HEAD -- src/lib/backup.ts src/instrumentation.ts src/app/backup-actions.ts src/app/settings/backup/page.tsx src/i18n/locales README.md README.en-US.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (a background job that writes to the data volume; it only ever adds files and reuses the existing, tested backup and prune code)
- **Depends on**: none (plans 004 and 015 already landed: pruning exists and receipts are included as hard links)
- **Category**: feature (reliability / data protection)
- **Planned at**: commit `e5e57c4`, 2026-11-15

## Why this matters

NestFund keeps all of a person's money data in one SQLite file. Today a backup exists only when someone remembers to press **Create backup now**. A disk problem, a bad update or a mistaken import on a day with no recent backup loses real data. This plan adds an optional automatic backup that runs inside the app (the same way the Trading 212 sync does), reusing `createBackupNow`, so a recent restorable copy always exists without anyone remembering. Automatic copies are kept apart from manual ones and pruned by the existing rules.

## Decision for the operator

- **Default mode: weekly** (choices: off, daily, weekly). Change `DEFAULT_SCHEDULE` in Step 2 if you prefer `daily` or `off`. With the existing prune rule (newest 10 of each kind always kept, nothing under 30 days deleted) daily mode keeps about a month of copies; a database copy is small and receipts are hard links, so extra disk use is low.
- Automatic copies live in the same `/data/backups` folder, on the same volume as the database. They protect against mistakes and bad updates, **not** against losing the volume. The README line added in Step 6 says so (copy the folder elsewhere for real disaster protection).

## Current state

`src/lib/backup.ts:106-128` (`createBackupNow`) — the function to reuse:

```ts
export function createBackupNow(appVersion?: string): { db: string; json: string } {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const s = stamp();
  const db = `nestfund-backup-${s}.db`;
  const json = `nestfund-backup-${s}.json`;
  getDb().prepare('VACUUM INTO ?').run(path.join(BACKUP_DIR, db));
  fs.writeFileSync(path.join(BACKUP_DIR, json), JSON.stringify(buildBackupFile(null, appVersion), null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(path.join(BACKUP_DIR, db), 0o600);
  try {
    snapshotUploadsTo(path.join(BACKUP_DIR, `nestfund-backup-${s}-uploads`));
  } catch { /* ... */ }
  try { pruneBackups(); } catch { /* ... */ }
  return { db, json };
}
```

Related facts in the same file: `BACKUP_NAME = /^nestfund-[A-Za-z0-9._-]+\.(db|json)$/` (an `nestfund-auto-….db/json` name matches it, so listing, download and pruning already handle it); `pruneBackups` groups files by the name with the timestamp removed (`name.replace(STAMP_IN_NAME, '')`), so `nestfund-auto-<stamp>.db` is its own kind (`nestfund-auto.db`) with its own "newest 10" rule, separate from manual copies; `listBackups(limit = 12)` lists the newest files of all kinds.

`src/instrumentation.ts` (whole file):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startT212Scheduler } = await import('./lib/t212-scheduler');
    startT212Scheduler();
    const { pruneBackups } = await import('./lib/backup');
    try { pruneBackups(); } catch (err) { console.error('[backup] prune failed:', (await import('./lib/security')).describeError(err)); }
  }
}
```

Pattern to copy for the scheduler: `src/lib/t212-scheduler.ts` (global-guarded `setInterval`, `setTimeout(...).unref()`, errors logged with `describeError`, never thrown).

`src/app/backup-actions.ts` holds the backup server actions (`createBackupAction` etc.; file starts with `'use server'`). `src/app/settings/backup/page.tsx` renders the "Create backup now" card (lines ~28-58) and receives `searchParams` `{ created?, imported?, importError? }`; alerts are rendered from them (lines ~22-26).

Settings are stored as JSON in the `settings` table (`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`), e.g. `getInterestConfig` in `src/lib/interest-repo.ts`.

Test pattern: `tests/backup-prune.test.ts` (sets `process.env.DATA_DIR` to a temp folder **before** a dynamic `import('@/lib/backup')`, cleans up in `afterAll`) and `tests/interest-db.test.ts` (real repo on a throwaway database). Translations: both locale files must have identical keys (`tests/utils.test.ts:89`). Commit message style: short imperative sentence.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| New tests | `npx vitest run tests/backup-schedule.test.ts` | pass |
| All tests | `npm test` | all pass |

## Scope

**In scope**:
- `src/lib/backup.ts` (only `createBackupNow`: add a name prefix parameter)
- `src/lib/backup-schedule.ts` (new)
- `src/instrumentation.ts` (start the scheduler)
- `src/app/backup-actions.ts` (one new action)
- `src/app/settings/backup/page.tsx` (one new card + one alert)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json` (`backup` group)
- `README.md`, `README.en-US.md` (one sentence each in the backup section)
- `tests/backup-schedule.test.ts` (new)

**Out of scope**: restore/import code, `pruneBackups` rules, `listBackups` limit, the portable JSON format, notifications, uploading backups anywhere off the server, Docker files.

## Git workflow

- Branch: `advisor/021-scheduled-backups`
- One commit, e.g. `Add automatic scheduled backups`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Let `createBackupNow` take a name prefix

In `src/lib/backup.ts`:
1. Change the signature to `createBackupNow(appVersion?: string, prefix: 'nestfund-backup' | 'nestfund-auto' = 'nestfund-backup')`.
2. Replace the three literal `nestfund-backup-` occurrences in the function (`.db` name, `.json` name, the `-uploads` folder) with `${prefix}-`.
3. Leave `createBackupAction` (it calls `createBackupNow(appVersion())`) unchanged: the default keeps manual backups exactly as they are.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass (existing backup tests unchanged).

### Step 2: The schedule module

Create `src/lib/backup-schedule.ts`:

```ts
import 'server-only';
import fs from 'node:fs';
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
    const t = fs.statSync(`${dir}/${name}`).mtimeMs;
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
```

(Use `path.join` instead of the template string in `lastAutomaticBackupMs` if you prefer; add `import path from 'node:path'`.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Start it with the server

In `src/instrumentation.ts`, after the prune line inside the `nodejs` branch, add:

```ts
    const { startBackupScheduler } = await import('./lib/backup-schedule');
    startBackupScheduler();
```

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Server action and settings card

1. `src/app/backup-actions.ts`: import `saveBackupSchedule` from `@/lib/backup-schedule` and add

```ts
export async function saveBackupScheduleAction(fd: FormData) {
  saveBackupSchedule(String(fd.get('mode') ?? ''));
  revalidatePath('/settings/backup');
  redirect('/settings/backup?schedule=saved');
}
```

2. `src/app/settings/backup/page.tsx`: add `schedule?: string` to the `searchParams` type; add `{sp.schedule && <Alert tone="success">{t('backup.scheduleSaved')}</Alert>}` next to the other alerts; import `getBackupSchedule`, `lastAutomaticBackupMs`, `SCHEDULE_MODES` and `saveBackupScheduleAction`; and add a card between the "Create backup now" card and the export card:

```tsx
      <Card title={t('backup.scheduleTitle')} subtitle={t('backup.scheduleHint')} className="mb-4">
        <form action={saveBackupScheduleAction} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-0 flex-1 basis-48">
            <span className="label">{t('backup.scheduleMode')}</span>
            <select name="mode" defaultValue={getBackupSchedule()} className="input">
              {SCHEDULE_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`backup.scheduleModes.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton className="btn-secondary">{t('common.save')}</SubmitButton>
        </form>
        <p className="muted mt-3 text-xs">
          {lastAuto === null ? t('backup.scheduleNever') : t('backup.scheduleLast', { when: formatDateTime(new Date(lastAuto).toISOString(), locale) })}
        </p>
      </Card>
```

with `const lastAuto = lastAutomaticBackupMs();` computed near `const backups = listBackups();`. If `common.save` does not exist in the locale files, use the key other forms use for their save button (`grep -n '"save"' src/i18n/locales/en-US.json`).

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Translations

Add to the `backup` group of both locale files (keep keys identical):

| key | en-US | pt-PT |
|---|---|---|
| `scheduleTitle` | `Automatic backups` | `Cópias automáticas` |
| `scheduleHint` | `Saves a full copy and a portable file in the backups folder on its own, so a recent copy always exists. Copies are kept next to the database; copy the folder elsewhere to also be safe against losing the disk.` | `Guarda sozinha uma cópia completa e um ficheiro portátil na pasta de cópias, para haver sempre uma cópia recente. As cópias ficam junto da base de dados; copia a pasta para outro sítio para ficares protegido também contra a perda do disco.` |
| `scheduleMode` | `How often` | `Com que frequência` |
| `scheduleModes` | object: `off` → `Off`, `daily` → `Daily`, `weekly` → `Weekly` | `off` → `Desligado`, `daily` → `Todos os dias`, `weekly` → `Todas as semanas` |
| `scheduleSaved` | `Automatic backup setting saved.` | `Definição das cópias automáticas guardada.` |
| `scheduleLast` | `Last automatic backup: {when}` | `Última cópia automática: {when}` |
| `scheduleNever` | `No automatic backup has been made yet.` | `Ainda não foi feita nenhuma cópia automática.` |

(Check how other messages write placeholders, e.g. `grep -n '{created}' src/i18n/locales/en-US.json`, and use the same `{name}` style.)

**Verify**: `npm test` → all pass (the "same keys" test in `tests/utils.test.ts`).

### Step 6: README

In both `README.md` and `README.en-US.md`, in the backup table/section next to the "A copy right now" row, add one sentence (translate for the Portuguese README): "**Automatic backups** (Settings › Backup and data) make the same copy for you daily or weekly (weekly by default), named `nestfund-auto-….db/.json`; the app keeps the newest 10 and nothing under 30 days is deleted. They live on the same volume as the database, so also copy `/data/backups/` elsewhere."

**Verify**: `git diff --stat README.md README.en-US.md` shows one small hunk each.

### Step 7: Tests

Create `tests/backup-schedule.test.ts`. Set the data dir first, exactly as in `tests/backup-prune.test.ts` (temp folder, `process.env.DATA_DIR = ...` before dynamic imports, `afterAll` closes `globalThis.__nestfundDb` if set and removes the folder), then `const sched = await import('@/lib/backup-schedule')` and `const db = await import('@/lib/db')`. Cases:

1. **`isBackupDue`** (pure): `off` never due; `daily` with `lastMs = null` due; daily at `now - 22h` not due, at `now - 24h` due; weekly at `now - 3 days` not due, at `now - 7 days` due.
2. **Mode setting**: with a fresh database `getBackupSchedule()` is `'weekly'`; `saveBackupSchedule('daily')` returns true and is read back; `saveBackupSchedule('hourly')` returns false and leaves `'daily'` unchanged.
3. **`runScheduledBackup` creates a copy once**: set `daily`; the first call returns a name matching `/^nestfund-auto-.*\.db$/`, a matching `.json` exists in `BACKUP_DIR` (`db.BACKUP_DIR`); a second call right after returns `null` and creates nothing more; a call with `now = Date.now() + 25 * 3600 * 1000` creates another.
4. **Off creates nothing**: `saveBackupSchedule('off')` and a fresh empty backup folder → `runScheduledBackup()` returns `null` and no `nestfund-auto-*` file exists.
5. **Manual backups are untouched**: `createBackupNow()` (no prefix) still produces a `nestfund-backup-…` name.

Use `fs.readdirSync(db.BACKUP_DIR)` for the file checks; delete the `nestfund-auto-*` files between cases that need an empty folder.

**Verify**: `npx vitest run tests/backup-schedule.test.ts` → passes. Then temporarily make `runScheduledBackup` ignore `isBackupDue` (always create) and confirm cases 3 and 4 **fail**; restore and re-run → passes. Finally `npm test` → all pass.

## Test plan

Step 7 (five cases: due logic, setting round-trip with invalid input, create-once behaviour, off, manual naming unchanged). Manual spot check if a dev server is running: open Settings › Backup and data, set "Daily", restart the dev server; within about a minute a `nestfund-auto-….db` and `.json` appear in `data/backups/`, and the page shows "Last automatic backup".

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test file exists, and cases 3-4 fail when `isBackupDue` is bypassed
- [ ] `git status` shows only the in-scope files
- [ ] Manual backups still work and keep the `nestfund-backup-` name (case 5)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `createBackupNow` has more callers than `createBackupAction` and the new scheduler, or its body differs from the excerpt above.
- `listBackups`, `pruneBackups` or `BACKUP_NAME` changed so that an `nestfund-auto-…` file would not be listed or pruned as its own kind.
- An existing test fails and the fix would be to edit that test.
- The settings page or locale files have no obvious save-button key and no equivalent exists: ask which wording to use.

## Maintenance notes

- Any new place that creates backup files must use a name matching `BACKUP_NAME` and a stable prefix, or listing/pruning will not see it.
- `listBackups(12)` shows the newest 12 files of all kinds; with daily automatic copies (two files each) manual copies scroll out of the visible list sooner, though they stay on disk. A follow-up could split the list by kind.
- Pruning already keeps the newest 10 automatic copies and anything under 30 days; if the operator wants fewer files for daily mode, change the constants in `backup.ts` deliberately (they apply to all kinds).
- Reviewer: confirm the scheduler is started once (global guard), that failures are only logged, and that `runScheduledBackup` returns `null` for `off` without touching the disk.
