# Plan 017: Never lower the database schema version when an older app version opens a newer database

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0a31f89..HEAD -- src/lib/schema.ts tests/fresh-start.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (reliability)
- **Planned at**: commit `0a31f89`, 2026-11-15

## Why this matters

NestFund stores the schema version in SQLite's `PRAGMA user_version` and runs each new migration once. `migrate()` currently **always writes `MIGRATIONS.length + 1`** at the end. If a newer release (say, with 8 migrations) created the database, and the user later runs an older image (4 migrations) — for example after pinning a previous Docker tag to roll back — the older app overwrites the version with 5. When the user upgrades again, migrations 5–8 run a second time on a database that already has them, and statements such as `ALTER TABLE … ADD COLUMN` fail, so the app can no longer start. After this plan, an older app leaves a newer version number alone and the upgrade path stays safe.

## Current state

`src/lib/schema.ts:219-236` (verified at `0a31f89`):

```ts
export function migrate(db: Database.Database, opts: { backupDir?: string } = {}) {
  const version = db.pragma('user_version', { simple: true }) as number;
  // version 0 = database just created from SCHEMA, which is already the latest shape.
  const pending = version > 0 && version <= MIGRATIONS.length;
  if (pending) {
    // Safety net: a full copy of the database is taken before any schema change is applied.
    if (opts.backupDir) { ... VACUUM INTO ... }
    db.transaction(() => {
      for (let v = version; v <= MIGRATIONS.length; v++) db.exec(MIGRATIONS[v - 1]);
    })();
  }
  db.pragma(`user_version = ${MIGRATIONS.length + 1}`);   // <-- always executed
}
```

`MIGRATIONS` currently has 4 entries, so a fully migrated database has `user_version = 5`.

Existing test to model after: `tests/fresh-start.test.ts:107-140` (`describe` that builds an in-memory `better-sqlite3` database, sets `user_version`, calls `migrate`, and asserts `db.pragma('user_version', { simple: true })`). Read lines 100-140 first and copy its setup style (imports, how the database is created and closed).

Commit message style: short imperative sentence (example from `git log`: `Keep receipts when all data is deleted`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests (filter) | `npx vitest run tests/fresh-start.test.ts` | all pass |
| Tests (all) | `npm test` | all pass |

## Scope

**In scope**:
- `src/lib/schema.ts` (the last line of `migrate`)
- `tests/fresh-start.test.ts` (add one test)

**Out of scope**:
- The `MIGRATIONS` list itself, `SCHEMA`, `src/lib/db.ts`.
- Adding a "database is newer than this app" warning screen (possible follow-up, see maintenance notes).

## Git workflow

- Branch: `advisor/017-keep-newer-schema-version`
- One commit, message like `Keep a newer schema version when an older app opens the database`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Only raise the version

In `src/lib/schema.ts`, replace the final line of `migrate` with:

```ts
  // Only ever raise the version: a database written by a newer release keeps its number if an older release opens it,
  // otherwise upgrading again would re-run migrations that already happened.
  if (version <= MIGRATIONS.length) db.pragma(`user_version = ${MIGRATIONS.length + 1}`);
```

Cases: fresh database (`0`) → set to `N+1` (as today); old database (`1..N`) → migrated, then set to `N+1` (as today); current database (`N+1`) → condition false, nothing to write, value unchanged anyway; newer database (`> N+1`) → untouched (the fix).

**Verify**: `npm run typecheck` → exit 0; `npx vitest run tests/fresh-start.test.ts` → existing tests still pass.

### Step 2: Test

In `tests/fresh-start.test.ts`, next to the existing migration test, add:

```ts
it('leaves the version of a newer database alone (rollback to an older release)', () => {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  db.pragma(`user_version = ${MIGRATIONS.length + 4}`);
  migrate(db);
  expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length + 4);
});
```

Use the same `Database` import and cleanup style as the neighboring test.

**Verify**: `npx vitest run tests/fresh-start.test.ts` → passes. Then temporarily revert Step 1 (`git stash` the `schema.ts` change only, or edit the line back) and confirm the new test **fails** (version becomes `MIGRATIONS.length + 1`); restore Step 1 and re-run → passes.

## Test plan

One new test (above), written to fail without the fix. Full suite: `npm test` → all pass.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test exists, fails without the fix and passes with it
- [ ] `git status` shows only `src/lib/schema.ts` and `tests/fresh-start.test.ts` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `migrate()` no longer ends with the unconditional `user_version` write shown above.
- The existing fresh-start tests fail after Step 1 (they assert the version is `MIGRATIONS.length + 1` after migrating an old or new database; that must still hold).
- You find a second place that writes `user_version`: `grep -rn "user_version" src` should show only `schema.ts`.

## Maintenance notes

- Every future migration appended to `MIGRATIONS` must stay safe to run once and is never edited afterwards.
- Follow-up (not in this plan): detect `version > MIGRATIONS.length + 1` at startup and show the user a clear "this data was made by a newer NestFund" message instead of running with a schema the code may not understand.
- Reviewer: confirm the condition is `version <= MIGRATIONS.length` (using the value read at the top, not a re-read after migrating).
