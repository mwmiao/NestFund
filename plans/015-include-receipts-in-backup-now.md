# Plan 015: "Create backup now" also keeps the receipts that belong to that backup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ef09949..HEAD -- src/lib/backup.ts src/lib/uploads.ts src/instrumentation.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/014-keep-receipts-on-reset.md (reuses `src/lib/uploads.ts`). Independent of plan 004, but see Step 3 for how they interact.
- **Category**: direction / data safety
- **Planned at**: commit `ef09949`, 2026-11-14

## Why this matters

Receipts are stored as files in `/data/uploads`; the `.db` backup and the portable `.json` backup only hold the file *names*.
Today a user who restores a backup on a new server (or after a disk problem) gets every transaction back with a broken
receipt link, and the README tells them to copy the uploads folder by hand. After this plan, **Create backup now** also saves
a snapshot of the receipts next to the `.db`, using hard links, so the snapshot costs almost no disk space and contains exactly
the receipts that existed at that moment (a later edit or deletion in the app cannot damage it).

Scope is deliberately limited to the manual full backup. The portable JSON export/import keeps its current shape (embedding
files in JSON would bloat it and change a documented, versioned format); that is a separate decision for the maintainer.

## Current state

- `src/lib/backup.ts:124-133` — the manual backup:

```ts
export function createBackupNow(appVersion?: string): { db: string; json: string } {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const s = stamp();
  const db = `nestfund-backup-${s}.db`;
  const json = `nestfund-backup-${s}.json`;
  getDb().prepare('VACUUM INTO ?').run(path.join(BACKUP_DIR, db));
  fs.writeFileSync(path.join(BACKUP_DIR, json), JSON.stringify(buildBackupFile(null, appVersion), null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(path.join(BACKUP_DIR, db), 0o600);
  return { db, json };
}
```

- `BACKUP_NAME = /^nestfund-[A-Za-z0-9._-]+\.(db|json)$/` (`src/lib/backup.ts:120`) is what `listBackups` and the download route accept. A folder called `nestfund-backup-<stamp>-uploads` does not match it, so it is never listed or downloadable. Keep it that way.
- After plan 014 lands, `src/lib/uploads.ts` exists (it exports `moveUploadsTo`). Receipt file names are `<uuid>-<sanitised-name>`; the app only ever **creates** new files and **unlinks** old ones in `src/app/actions.ts` (`storeAttachment`, `removeAttachment`); it never rewrites a stored file in place. That is why a hard link is a safe snapshot: unlinking the original later leaves the linked copy intact.
- `src/lib/db.ts`: `UPLOADS_DIR = <DATA_DIR>/uploads`, `BACKUP_DIR = <DATA_DIR>/backups` (same volume, so hard links work; keep a copy fallback anyway).
- `README.en-US.md` "Backup and restore" table row "A copy right now" and the last paragraph of "Restore a full database copy (`.db`)" describe the manual backup and say attachments must be copied separately. `README.md` is the Portuguese equivalent. `SECURITY.md` row "Backups" (Portuguese) describes the folder permissions (`0700` folder, `0600` files).
- Conventions: tests that touch the file system use a temp `DATA_DIR` set before dynamic imports (`tests/trading212-sync.test.ts` top); English comments explain *why*.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| New tests | `npx vitest run tests/uploads.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/uploads.ts` (add one function; created by plan 014)
- `src/lib/backup.ts` (`createBackupNow` and, only if plan 004 is already merged, `pruneBackups`)
- `tests/uploads.test.ts` (add cases)
- `README.en-US.md`, `README.md`, `SECURITY.md` (one sentence each, Step 4)

**Out of scope** (do NOT touch):
- `buildBackupFile`, `readBackupData`, `backup-format.ts`, the import path and the JSON format (versioned, documented).
- `applyRestore` (import never touches receipts) and `resetData`.
- The backup page UI and i18n strings.

## Git workflow

- Branch: `advisor/015-receipts-in-backup`
- One commit, short imperative message (e.g. `Snapshot receipts with Create backup now`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `snapshotUploadsTo` to `src/lib/uploads.ts`

```ts
/**
 * Makes `dest` a snapshot of the receipts folder. Hard links first (instant, no extra disk space, and unaffected when the
 * app later unlinks the original); a plain copy for any file that cannot be linked. Returns the number of files captured.
 * Receipt files are only ever created or unlinked by the app, never rewritten in place, so a link is a faithful snapshot.
 */
export function snapshotUploadsTo(dest: string, uploadsDir: string = UPLOADS_DIR): number {
  if (!fs.existsSync(uploadsDir)) return 0;
  const names = fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  if (names.length === 0) return 0;
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const name of names) {
    const from = path.join(uploadsDir, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) continue; // a repeated call into the same folder is harmless
    try {
      fs.linkSync(from, to);
    } catch {
      fs.copyFileSync(from, to);
    }
  }
  return names.length;
}
```

Add `import path from 'node:path';` at the top of the file if missing.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Call it from `createBackupNow`

After the `chmodSync` line and before `return`, add:

```ts
  try {
    snapshotUploadsTo(path.join(BACKUP_DIR, `nestfund-backup-${s}-uploads`));
  } catch {
    // The database copy and JSON are already safe; a receipts problem must not fail the whole backup.
  }
```

Add `import { snapshotUploadsTo } from './uploads';` to `src/lib/backup.ts`. (`uploads.ts` imports only `./db`, so there is no import cycle.) Leave the return type unchanged.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Keep pruning consistent (only if plan 004 is merged)

Run `grep -n "export function pruneBackups" src/lib/backup.ts`.
- **No match** (plan 004 not merged yet): skip this step and add this sentence to the Maintenance notes of your PR description / report: "plan 004 must also delete `<stem>-uploads` when it deletes `<stem>.db`".
- **Match**: inside the loop where a file is removed with `fs.rmSync(path.join(dir, f.name), { force: true })`, when `f.name` ends in `.db`, also remove the sibling snapshot folder: `fs.rmSync(path.join(dir, f.name.replace(/\.db$/, '-uploads')), { recursive: true, force: true });`. Only for `.db` files of the kinds `nestfund-backup-…` and `nestfund-before-reset-…` is such a folder ever created, and removing a non-existent folder is a no-op, so no kind check is needed. Add a test line to `tests/backup-prune.test.ts` creating one such folder and asserting it disappears with its `.db`.

**Verify**: `npm test` → all pass.

### Step 4: Documentation

- `README.en-US.md` (and `README.md` in Portuguese): in the "A copy right now" row, mention that the receipts are saved too (`nestfund-backup-…-uploads/`, hard links, almost no extra space). In the paragraph "Attachments live in `/data/uploads` and are not part of the `.db`…" say that **Create backup now** also keeps a receipts folder next to the `.db`; to restore everything, put the `.db` back and copy that folder's files into `/data/uploads`. Keep the existing advice to copy `/data/backups/` off the server.
- `SECURITY.md` row "Backups" (Portuguese): add that the receipts snapshot folder is `0700` like the rest of the folder.

**Verify**: `grep -n "\-uploads" README.en-US.md README.md SECURITY.md` → at least one match in each file.

### Step 5: Tests

Add to `tests/uploads.test.ts` (see Test plan), then run everything.

**Verify**: `npm test` → all pass.

## Test plan

Add to `tests/uploads.test.ts`, calling `snapshotUploadsTo(dest, uploadsDir)` with temp folders:
1. Two receipt files + one sub-folder in `uploadsDir`: `dest` contains exactly the two files with identical contents; returns `2`.
2. Snapshot survives deleting an original afterwards (`fs.unlinkSync` the original; the file in `dest` still reads fine).
3. Missing or empty `uploadsDir`: returns `0` and `dest` is not created.
4. Calling it twice with the same `dest` does not throw (names already present in `dest` are skipped; this is the `existsSync` guard in Step 1) and `dest` still holds exactly the same files.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/uploads.test.ts` has the new snapshot cases and they pass
- [ ] `createBackupNow` still returns `{ db, json }` and the backup list (`listBackups`) is unchanged (a folder named `…-uploads` does not appear in it — covered by a test or by `grep -n BACKUP_NAME src/lib/backup.ts` unchanged)
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- `src/lib/uploads.ts` does not exist (plan 014 not merged): do not recreate it; report that 014 must land first.
- `createBackupNow` differs from the excerpt.
- You find code that rewrites a stored receipt file in place (this plan's snapshot argument depends on files only being created or unlinked).
- Hard links fail on the test machine's temp directory in a way the copy fallback does not cover.

## Maintenance notes

- Snapshots are per-backup folders. Without plan 004's pruning they accumulate; with hard links the extra space is only the receipts that were later deleted from the app.
- Not covered by design: the portable `.json` export/import does not carry receipts. If the maintainer wants "move everything to another install" in one file, that needs a format decision (zip vs embedded base64, `BACKUP_VERSION` bump) and should be its own plan.
- Reviewers: check the `try/catch` keeps a receipts failure from failing the backup, and that nothing lists or serves the `-uploads` folder.
