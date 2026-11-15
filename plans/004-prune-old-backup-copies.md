# Plan 004: Prune old safety copies in `/data/backups` (keep newest 10 per kind, never anything under 30 days)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca98cb9..HEAD -- src/lib/backup.ts src/instrumentation.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (it deletes files; the policy below is deliberately conservative)
- **Depends on**: none
- **Category**: tech-debt (reliability)
- **Planned at**: commit `ca98cb9`, 2026-11-13; refreshed against `c3b3b76` on 2026-11-15 (plans 014/015 added receipt folders next to the `.db` copies: pruning must remove them together with their `.db`; see Step 1b)

## Why this matters

NestFund writes a **full copy of the SQLite database** into `<DATA_DIR>/backups/` every time the user clicks "create backup", imports a file, resets data, applies a rule to old transactions, or a schema migration runs. Nothing ever deletes them (`listBackups(12)` only limits what the settings page *shows*). On a small NAS volume this grows without bound. After this plan, old copies are pruned automatically while always keeping recent ones.

## Current state

Files:
- `src/lib/backup.ts` — backup helpers. Relevant parts:

```ts
// src/lib/backup.ts:120-121
const BACKUP_NAME = /^nestfund-[A-Za-z0-9._-]+\.(db|json)$/;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');   // e.g. 2026-11-04T10-00-00-000Z

// src/lib/backup.ts:124-132
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

- Other writers into the same folder, all using the same `<prefix>-<ISO stamp>.db` shape:
  - `nestfund-backup-<stamp>.db` / `.json` — manual backup (`createBackupNow`)
  - `nestfund-before-import-<stamp>.db` — `applyRestore` in `src/lib/backup.ts` (~line 197)
  - `nestfund-before-reset-<stamp>.db` — `resetData` in `src/lib/repo.ts:72`
  - `nestfund-before-rule-<ruleId>-<stamp>.db` — `src/lib/rules-repo.ts:132`
  - `nestfund-v<N>-before-migration-<stamp>.db` — `migrate` in `src/lib/schema.ts:~228`
- `src/lib/db.ts` exports `BACKUP_DIR` = `<DATA_DIR>/backups` (`DATA_DIR` from env `DATA_DIR`).
- `src/instrumentation.ts` runs once at server start; the Node-only import must stay **inside** the `NEXT_RUNTIME === 'nodejs'` check:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startT212Scheduler } = await import('./lib/t212-scheduler');
    startT212Scheduler();
  }
}
```

- `SECURITY.md` row "Backups" and the README "Backup and restore" sections describe the folder (the READMEs are in `README.md` (pt-PT) and `README.en-US.md`).

Conventions: pure-ish helpers in `src/lib/*.ts`, English comments explaining *why*; tests in `tests/*.test.ts` that need the file system use a tmp dir (see `tests/trading212-sync.test.ts` for tmp `DATA_DIR` set before dynamic imports). Errors in background work must never crash the app: log with `describeError` from `src/lib/security.ts` (see `src/lib/t212-scheduler.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| New tests | `npx vitest run tests/backup-prune.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/backup.ts` — add `pruneBackups` and call it from `createBackupNow`
- `src/instrumentation.ts` — call it once at startup
- `tests/backup-prune.test.ts` (create)
- `README.md`, `README.en-US.md`, `SECURITY.md` — one sentence each (Step 4)

**Out of scope** (do NOT touch):
- The writers listed above (`repo.ts`, `rules-repo.ts`, `schema.ts`, `applyRestore`): they stay as they are.
- `/data/nestfund.db`, `/data/uploads`, `/data/imports` (the staged-import folder has its own 24 h cleanup).
- The settings backup page and its i18n strings.

## Git workflow

- Branch: `advisor/004-prune-backups`
- One commit, short imperative message (e.g. `Prune old backup copies, keeping the newest 10 per kind`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `pruneBackups` to `src/lib/backup.ts`

Place it right after `listBackups`. Policy: files are grouped by *kind* (the file name with its timestamp removed). Within a kind, files sorted newest-first by modification time; a file is deleted **only if** it is not among the newest `KEEP_PER_KIND` of its kind **and** is older than `MIN_PRUNE_AGE_MS`. So nothing recent is ever deleted, and the newest 10 of every kind always survive. Only names matching the existing `BACKUP_NAME` regex are considered.

```ts
export const KEEP_PER_KIND = 10;
export const MIN_PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const STAMP_IN_NAME = /-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/;

/** Deletes old safety copies; returns the names removed. Never touches the newest copies of each kind or anything under 30 days. */
export function pruneBackups(dir: string = BACKUP_DIR, now: number = Date.now()): string[] {
  if (!fs.existsSync(dir)) return [];
  const kinds = new Map<string, { name: string; mtime: number }[]>();
  for (const name of fs.readdirSync(dir)) {
    if (!BACKUP_NAME.test(name)) continue;
    const kind = name.replace(STAMP_IN_NAME, '');
    const list = kinds.get(kind) ?? [];
    list.push({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs });
    kinds.set(kind, list);
  }
  const removed: string[] = [];
  for (const list of kinds.values()) {
    list.sort((a, b) => b.mtime - a.mtime);
    for (const f of list.slice(KEEP_PER_KIND)) {
      if (now - f.mtime < MIN_PRUNE_AGE_MS) continue;
      fs.rmSync(path.join(dir, f.name), { force: true });
      removed.push(f.name);
    }
  }
  return removed;
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 1b: Remove the receipts folder that belongs to a pruned `.db`

Since plans 014/015, two writers also create a **directory** next to a `.db`, named `<db name without ".db">-uploads`: `createBackupNow` makes `nestfund-backup-<stamp>-uploads/` (hard links to the receipts) and "Delete all data" moves the receipts to `nestfund-before-reset-<stamp>-uploads/`. The `BACKUP_NAME` regex only matches `.db`/`.json` files, so without this step those folders would never be deleted. In `pruneBackups`, when a `.db` file is removed, also remove its folder: after `fs.rmSync(path.join(dir, f.name), { force: true });` add

```ts
if (f.name.endsWith('.db')) fs.rmSync(path.join(dir, f.name.replace(/\.db$/, '-uploads')), { recursive: true, force: true });
```

Rules: only the folder whose name is exactly the pruned `.db` name with `.db` replaced by `-uploads`; never any other directory; `.json` files have no folder; a folder with no matching `.db` (orphan) is left alone. Deleting a hard-link folder does not touch the live `/data/uploads` files (a hard link is just another name for the same file).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Call it (never letting it fail a backup)

- At the end of `createBackupNow` (after the existing `try { snapshotUploadsTo(...) } catch { ... }` block, before `return { db, json }`), add: `try { pruneBackups(); } catch { /* pruning is housekeeping; a failure must not fail the backup */ }`.
- In `src/instrumentation.ts`, inside the existing `nodejs` check after `startT212Scheduler();` add:

```ts
const { pruneBackups } = await import('./lib/backup');
try { pruneBackups(); } catch (err) { console.error('[backup] prune failed:', (await import('./lib/security')).describeError(err)); }
```

**Verify**: `npm run typecheck` → exit 0; `grep -n "pruneBackups" src/lib/backup.ts src/instrumentation.ts` → definition plus two call sites.

### Step 3: Tests

Create `tests/backup-prune.test.ts`. Set `process.env.DATA_DIR` to a tmp dir before dynamically importing `@/lib/backup` (pattern: `tests/trading212-sync.test.ts`), but call `pruneBackups(dir, now)` with an explicit tmp `dir` and fixed `now`. Create fake files with `fs.writeFileSync` and set ages with `fs.utimesSync(file, atime, mtime)` (seconds). Cases:
1. 15 `nestfund-backup-<stamp>.db` files, all 60 days old (stamps increasing by one second): the newest 10 remain, the 5 oldest are removed; return value lists exactly those 5.
2. 15 files all 5 days old → nothing removed (age guard).
3. Mixed kinds: 12 old `nestfund-before-import-*.db` and 3 old `nestfund-before-reset-*.db` → only the 2 oldest imports are removed; the 3 resets stay (kinds are independent).
4. `nestfund-before-rule-1-*.db` and `nestfund-before-rule-2-*.db` are separate kinds (different rule ids).
5. Files that do not match `BACKUP_NAME` (`notes.txt`, `random.db`) and a missing directory are ignored (no throw, returns `[]`).
7. Receipts folders: for 12 old `nestfund-backup-<stamp>.db` files, each with a directory `nestfund-backup-<stamp>-uploads/` containing one file, the 2 oldest `.db` files **and their `-uploads` directories** are removed, the other 10 `.db` files and directories remain; a directory `nestfund-backup-<old stamp>-uploads/` with no matching `.db` is left untouched; an unrelated directory (e.g. `somedir/`) is left untouched. Also: pruning a `.db` that has no uploads folder does not throw.
6. `.db` and `.json` files of manual backups are different kinds (the extension stays in the kind name): with 12 old `.db` and 12 old `.json` files, 2 of each are removed, i.e. each extension is pruned independently.

**Verify**: `npx vitest run tests/backup-prune.test.ts` → all pass.

### Step 4: Docs (one sentence each)

- `README.en-US.md`, "Backup and restore" section: add "Older safety copies in `/data/backups/` are pruned automatically: the newest 10 of each kind are always kept, and nothing newer than 30 days is deleted."
- `README.md`: same sentence in Portuguese ("As cópias de segurança antigas em `/data/backups/` são limpas automaticamente: guardam-se sempre as 10 mais recentes de cada tipo e nunca se apaga nada com menos de 30 dias.").
- `SECURITY.md`, table row "Backups": append the same Portuguese sentence.

**Verify**: `grep -n "30 dias\|30 days" README.md README.en-US.md SECURITY.md` → one match per file.

### Step 5: Full suite

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

Listed in Step 3 (6 cases). Pattern: `tests/trading212-sync.test.ts` for tmp dirs and cleanup (`fs.rmSync(dir, { recursive: true, force: true })` in `afterAll`). Verification: `npx vitest run tests/backup-prune.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/backup-prune.test.ts` exists and passes
- [ ] `pruneBackups` is only called inside `try`/`catch` (check both call sites)
- [ ] `git status` shows only the in-scope files modified or created
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the source (drift), or a writer of backup files uses a name that does not contain an ISO-style stamp (then the kind grouping in Step 1 is wrong).
- You are tempted to run `pruneBackups()` against a real `/data` or `./data` directory while testing — don't; use tmp directories only.
- A test needs real file ages and `fs.utimesSync` does not work on the platform — report instead of lowering the age guard.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any new writer into `BACKUP_DIR` must use `nestfund-<something>-<stamp()>.db|json` so the kind grouping works; otherwise its files are grouped under a kind that includes the timestamp and are never pruned (safe failure).
- The constants are deliberately generous because these copies are the user's undo for imports, resets and migrations. If the maintainer wants a setting, expose `KEEP_PER_KIND` via an env var rather than a UI.
- Reviewers: scrutinize that deletion requires **both** conditions (outside the newest 10 *and* older than 30 days) and that `mtime` — not the file name — drives ordering.
- Deferred: automatic scheduled backups (the scheduler already runs on the server) — a product decision, tracked as a "direction" idea in the audit.
