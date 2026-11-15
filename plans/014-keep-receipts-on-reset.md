# Plan 014: "Delete all data" moves receipts into the backups folder instead of erasing them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ef09949..HEAD -- src/app/actions.ts src/lib/repo.ts src/lib/db.ts src/i18n/locales`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (data loss)
- **Planned at**: commit `ef09949`, 2026-11-14

## Why this matters

"Delete all data" (Setup page) first saves a full database copy, then deletes the whole receipts folder. The code comment and the
on-screen text promise that a mistaken reset can be undone, but the database copy only holds *references* to receipts. After
restoring it, every transaction points at a file that no longer exists, and the receipts are gone for good. After this plan the
receipts folder is **moved** (not deleted) next to the safety copy, so restoring the `.db` plus moving the folder back is a
complete undo. A move on the same volume is instant and uses no extra disk space.

## Current state

- `src/app/actions.ts:436-443` — the server action:

```ts
export async function resetDataAction(fd: FormData) {
  if (str(fd, 'confirm') !== '1' || (await tooMany('reset-data', 3, 60 * 60 * 1000))) redirect('/setup#reset');
  repo.resetData();
  await fs.rm(UPLOADS_DIR, { recursive: true, force: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  refresh();
  redirect('/setup?reset=1');
}
```

- `src/lib/repo.ts:94-101` — `resetData()` makes the `.db` copy and **returns its full path**:

```ts
export function resetData(): string {
  // Full copy first, so even a mistaken reset can be undone (restore = replace nestfund.db with this file).
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `nestfund-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  getDb().prepare('VACUUM INTO ?').run(backup);
  resetAllData(getDb());
  return backup;
}
```

- `src/lib/db.ts:8-10` — `DATA_DIR`, `UPLOADS_DIR = <DATA_DIR>/uploads`, `BACKUP_DIR = <DATA_DIR>/backups`. Both folders are inside the same data volume, so `fs.rename` between them works.
- `src/i18n/locales/en-US.json:496` (key `…resetHint`, find its group with `grep -n resetHint src/i18n/locales/*.json`) says: "…attachments… A full copy is saved to /data/backups automatically before anything is deleted." Same key exists in `pt-PT.json`.
- `README.en-US.md` (section "Restore a full database copy") says attachments "are not part of the `.db`; copy that folder separately".
- Files in `/data/backups/` are matched by `BACKUP_NAME = /^nestfund-[A-Za-z0-9._-]+\.(db|json)$/` in `src/lib/backup.ts`. A folder named `…-uploads` does **not** match, so it never shows in the backup list and is never offered for download. Keep it that way.
- Conventions: files that touch the disk and the data dir import `'server-only'` first (see `src/lib/backup.ts:1`); comments in English explain *why*; tests that need the file system set `process.env.DATA_DIR` to a temp dir **before** dynamic imports (see the top of `tests/trading212-sync.test.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| New tests | `npx vitest run tests/uploads.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/uploads.ts` (create)
- `src/app/actions.ts` (the reset action only; remove the `fs.rm`/`fs.mkdir` of `UPLOADS_DIR` there)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json` (the `resetHint` text only)
- `tests/uploads.test.ts` (create)
- `README.en-US.md`, `README.md` (one sentence each, Step 4)

**Out of scope** (do NOT touch):
- `src/lib/repo.ts` `resetData` — it already returns the `.db` path; leave it exactly as is.
- `storeAttachment` / `removeAttachment` and the attachments route.
- Backup pruning, `createBackupNow`, `applyRestore` (plans 004 and 015 handle those).

## Git workflow

- Branch: `advisor/014-keep-receipts-on-reset`
- One commit, short imperative message in the repo's style (e.g. `Keep receipts when all data is deleted`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/lib/uploads.ts`

```ts
import 'server-only';
import fs from 'node:fs';
import { UPLOADS_DIR } from './db';

/**
 * Moves the whole receipts folder to `dest` and leaves a fresh empty one behind. A rename is instant and needs no extra
 * disk space (both folders live in the data volume); if the rename is not possible (different filesystems) it falls
 * back to copy-then-delete. Returns false when there was nothing to move. Never deletes a receipt before it is safe at `dest`.
 */
export function moveUploadsTo(dest: string, uploadsDir: string = UPLOADS_DIR): boolean {
  const hasFiles = fs.existsSync(uploadsDir) && fs.readdirSync(uploadsDir).length > 0;
  if (!hasFiles) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return false;
  }
  if (fs.existsSync(dest)) throw new Error('uploads destination already exists');
  try {
    fs.renameSync(uploadsDir, dest);
  } catch {
    fs.cpSync(uploadsDir, dest, { recursive: true, errorOnExist: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  return true;
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use it in the reset action

In `src/app/actions.ts`:
- Change `repo.resetData();` to `const safetyCopy = repo.resetData();`
- Replace the two lines `await fs.rm(UPLOADS_DIR, …)` and `await fs.mkdir(UPLOADS_DIR, …)` with:
  `moveUploadsTo(safetyCopy.replace(/\.db$/, '-uploads'));`
- Add `import { moveUploadsTo } from '@/lib/uploads';` next to the other `@/lib` imports.
- Remove the `UPLOADS_DIR` import from `@/lib/db` **only if** `grep -n UPLOADS_DIR src/app/actions.ts` shows it is still used elsewhere in the file (it is: `storeAttachment`/`removeAttachment`) — so normally keep it. Do not leave unused imports (typecheck/lint) and do not remove used ones.

**Verify**: `npm run typecheck` → exit 0; `grep -n "fs.rm" src/app/actions.ts` → no match mentioning `UPLOADS_DIR`.

### Step 3: Update the on-screen text (both languages)

Find the key: `grep -n resetHint src/i18n/locales/*.json`. Change only that value in both files. English target:
"Removes transactions, balances, budgets, goals, custom categories and the Trading 212 connection. Before anything is deleted, a full copy of the database is saved to /data/backups, and your receipts are moved to a folder next to it (not deleted). Built-in categories and preferences are kept."
Portuguese: translate the same meaning in the same tone as the neighbouring strings (European Portuguese, e.g. "…os teus recibos são movidos para uma pasta ao lado (não são apagados)…"). Keep JSON valid, 2-space indent, trailing newline.

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en-US.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/locales/pt-PT.json','utf8'))"` → no output.

### Step 4: Document the undo

- `README.en-US.md`, in "Restore a full database copy (`.db`)": replace the sentence beginning "Attachments live in `/data/uploads`…" with one that keeps its meaning and adds: after a reset, the receipts are in `/data/backups/nestfund-before-reset-…-uploads/`; to undo a reset, restore the matching `.db` and move that folder back to `/data/uploads`.
- `README.md` (Portuguese): the equivalent sentence, same edit in Portuguese.

**Verify**: `grep -n "before-reset" README.en-US.md README.md` → one new match in each.

### Step 5: Tests (see Test plan), then run everything

**Verify**: `npm test` → all pass.

## Test plan

Create `tests/uploads.test.ts` testing `moveUploadsTo` with explicit temp folders (the function takes `uploadsDir` as a parameter, so no database is needed; still set `process.env.DATA_DIR` to a temp dir before dynamic-importing `@/lib/uploads`, because it imports `./db`, and mock `server-only` exactly the way the other tests do — check how `tests/trading212-sync.test.ts` and `vitest.config.ts` handle `server-only`). Cases:
1. Files in `uploadsDir` end up in `dest` with identical contents; `uploadsDir` exists and is empty; returns `true`.
2. Empty or missing `uploadsDir`: returns `false`, `dest` is not created, `uploadsDir` exists afterwards.
3. `dest` already exists: throws and **leaves the receipts in place** (assert the files are still in `uploadsDir`).
4. Nested content survives (create one sub-folder with a file).

Clean up temp dirs in `afterAll` like the exemplar test.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/uploads.test.ts` exists with ≥ 4 passing tests
- [ ] `grep -n "fs.rm(UPLOADS_DIR" src/app/actions.ts` returns no matches
- [ ] Both locale files parse as JSON and the `resetHint` value no longer says receipts/attachments are removed
- [ ] `git status` shows only the in-scope files modified or created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The reset action or `resetData` does not match the excerpts above.
- `resetData()` no longer returns a path ending in `.db`.
- `vitest` cannot import a module that starts with `import 'server-only'` and the exemplar test's approach does not fix it.
- You find another place that deletes `UPLOADS_DIR` contents (report it; do not change it).

## Maintenance notes

- Plan 004 (pruning) only looks at names ending in `.db`/`.json`, so these `…-uploads` folders will accumulate. Plan 015 extends pruning to remove the sibling folder together with its `.db`; if 004 is merged first, 015 handles it. Until then each reset leaves one folder; it is the user's own receipts, so that is the safe direction.
- Reviewers: confirm the move happens **after** `repo.resetData()` succeeds (a failed copy must not move receipts) and that nothing else in the reset path deletes the uploads.
