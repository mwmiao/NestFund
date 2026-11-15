# Plan 001: Never delete or orphan a receipt when a transaction save fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0a31f89..HEAD -- src/app/actions.ts src/lib/repo.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0a31f89`, 2026-11-13 (refreshed 2026-11-15: plan 012 added the amount-error redirect and `txFormErrorUrl`; plan 014 changed only `resetDataAction`)

## Why this matters

`saveTransactionAction` changes files on disk (deletes the old receipt, writes the new one) **before** it has finished validating the form and **before** the database row is written. If a later step fails — today, an invalid transfer (destination equals origin) triggers a `redirect()` — the database still points at a receipt that was already deleted from disk, and the newly uploaded file is left orphaned. The user silently loses a receipt/invoice. After this plan, disk changes happen only after validation, and the old file is deleted only after the row was saved.

## Current state

Files:
- `src/app/actions.ts` — server actions. `saveTransactionAction` is at lines ~116–163 (file starts with `'use server';`).
- `src/lib/repo.ts` — `upsertTransaction`, `getTransaction`, `deleteTransaction` (returns the attachment name to delete).
- `src/lib/db.ts` — exports `UPLOADS_DIR` (`<DATA_DIR>/uploads`) and `DATA_DIR` (env `DATA_DIR`, default `./data`).

Current code (`src/app/actions.ts`):

```ts
// lines 102-113
async function storeAttachment(file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const stored = `${crypto.randomUUID()}-${safeName}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, stored), Buffer.from(await file.arrayBuffer()));
  return stored;
}

async function removeAttachment(name: string | null) {
  if (!name) return;
  await fs.unlink(path.join(UPLOADS_DIR, path.basename(name))).catch(() => undefined);
}

// lines 116-146 (abridged to the load-bearing order)
export async function saveTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  const existing = id ? repo.getTransaction(id) : null;
  const amount = Math.abs(num(fd, 'amount'));
  const description = text(fd, 'description', MAX_TEXT.description);
  // An amount that cannot be read (or is zero) goes back to the form with a message instead of vanishing silently.
  if (!amount) redirect(txFormErrorUrl(id, 'amount'));
  if (!description) redirect(safeBack(fd, '/transactions'));

  let attachment = existing?.attachment ?? null;
  const file = fd.get('attachment');
  if (str(fd, 'removeAttachment') === '1') {
    await removeAttachment(attachment);   // <-- file deleted here
    attachment = null;
  }
  if (file instanceof File && isAllowedAttachment(file)) {
    await removeAttachment(attachment);
    attachment = await storeAttachment(file);   // <-- new file written here
  }

  const recurring = str(fd, 'recurring') === '1';
  const date = str(fd, 'date');
  const type = oneOf<TxType>(TX_TYPES, str(fd, 'type'), 'purchase');
  const account = optAccount(fd, 'account') ?? 'ctt';
  const toAccount = type === 'transfer' ? optAccount(fd, 'toAccount') : null;
  // A transfer needs a different destination; otherwise fall back to the form so the user can fix it.
  if (type === 'transfer' && (!toAccount || toAccount === account)) redirect(txFormErrorUrl(id, 'transfer'));   // <-- throws AFTER the file changes
  repo.upsertTransaction({ id: id ?? undefined, /* ... */ attachment, /* ... */ });
  repo.materializeRecurring();
  refresh();
  redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));
}
```

Conventions to match:
- `redirect()` from `next/navigation` works by **throwing** a `NEXT_REDIRECT` error. Never put a `redirect()` call inside a `try { } catch { }` that swallows errors.
- Tests that need a real database follow `tests/trading212-sync.test.ts`: set `process.env.DATA_DIR` to a `fs.mkdtempSync` directory **before** dynamically importing app modules (`await import('@/lib/db')`), and clean up in `afterAll`. Vitest aliases `@` → `src` and stubs `server-only` (see `vitest.config.ts`).
- Code comments in this repo are short English sentences explaining *why*.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| All tests | `npm test` | all pass |
| One test file | `npx vitest run tests/attachments-save.test.ts` | all pass |

(Dependencies are already installed in `node_modules`; do not run `npm install`.)

## Scope

**In scope** (the only files you should modify):
- `src/app/actions.ts` — only `saveTransactionAction`
- `tests/attachments-save.test.ts` (create)

**Out of scope** (do NOT touch):
- `storeAttachment` / `removeAttachment` bodies, `isAllowedAttachment` — behavior stays the same.
- `deleteTransactionAction` and `resetDataAction` — separate, already correct.
- `src/app/api/attachments/[name]/route.ts` — serving code is fine.
- Any form markup or i18n files.

## Git workflow

- Branch: `advisor/001-attachment-loss`
- One commit. Message style of this repo is a short imperative sentence (e.g. `Refactor Trading 212 sync: shared policy, classified poll outcomes, atomic state`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move all validation ahead of any file operation

In `saveTransactionAction`, move the block that computes `recurring`, `date`, `type`, `account`, `toAccount` and the `redirect(txFormErrorUrl(id, 'transfer'))` check so that it sits **directly after** the `if (!description) redirect(safeBack(fd, '/transactions'));` line and **before** `let attachment = ...`. Do not change any expression, only the order. (`recurring` and `date` are used later by `upsertTransaction`; keep them as `const`s declared in the new position.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Write files first, delete the old file only after the row is saved

Replace the attachment block with this shape:

```ts
const previousAttachment = existing?.attachment ?? null;
let attachment = previousAttachment;
if (str(fd, 'removeAttachment') === '1') attachment = null;
const upload = fd.get('attachment');
const newFile = upload instanceof File && isAllowedAttachment(upload) ? upload : null;
if (newFile) attachment = await storeAttachment(newFile);

try {
  repo.upsertTransaction({ /* unchanged fields */, attachment, /* unchanged fields */ });
} catch (err) {
  // The row was not saved: do not leave the new upload behind, and keep the old receipt.
  if (newFile) await removeAttachment(attachment);
  throw err;
}
// Only now is the old receipt unreferenced.
if (previousAttachment && previousAttachment !== attachment) await removeAttachment(previousAttachment);
```

Keep `repo.materializeRecurring(); refresh(); redirect(...)` after it, outside the `try`. The `try` must wrap **only** `repo.upsertTransaction(...)`.

**Verify**: `npm run typecheck` → exit 0. Then `grep -n "removeAttachment" src/app/actions.ts` → the only calls inside `saveTransactionAction` are the one in the `catch` and the one after the `try`; the `deleteTransactionAction` call is unchanged.

### Step 3: Add the regression test

Create `tests/attachments-save.test.ts` (see Test plan). It calls the real action with `FormData`.

**Verify**: `npx vitest run tests/attachments-save.test.ts` → all new tests pass. Then temporarily `git stash` only `src/app/actions.ts` (`git stash push src/app/actions.ts`), re-run, and confirm the "invalid transfer keeps the old receipt" test **fails**; then `git stash pop`. (This proves the test catches the bug.)

### Step 4: Full suite

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

New file `tests/attachments-save.test.ts`. Pattern: `tests/trading212-sync.test.ts` (tmp `DATA_DIR`, dynamic imports). Because the action module imports Next.js server APIs, mock them at the top of the file:

```ts
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('NEXT_REDIRECT:' + url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }), headers: async () => new Headers() }));
```

`src/app/actions.ts` also imports `@/i18n/server` (`getI18n`, which reads cookies/headers) and `@/lib/t212`; if either fails to load under Vitest, mock that module the same way with the smallest stub that satisfies the import.

Helper: `call(fd)` runs `await actions.saveTransactionAction(fd)` inside `try/catch` and returns the redirect URL from the `NEXT_REDIRECT:` message (rethrow anything else).
Build forms with `new FormData()`; attach files with `new File([new Uint8Array([1,2,3])], 'r.png', { type: 'image/png' })`. Required fields: `type=purchase`, `amount=10`, `description=Lunch`, `date=2026-11-02`, `account=ctt`.

Cases:
1. **Create with a receipt**: row has `attachment` set; file exists in `UPLOADS_DIR`.
2. **Replace receipt (happy path)**: edit the row (`id`) with a new file → DB points to the new name, new file exists, old file is gone.
3. **Remove receipt**: `removeAttachment=1` → DB `attachment` is `null`, old file is gone.
4. **Invalid transfer keeps the old receipt (the bug)**: edit the row with `type=transfer`, `account=ctt`, `toAccount=ctt` and a new file → redirect URL contains `?error=transfer`; old file still exists; DB `attachment` unchanged; the uploads directory contains exactly one file (no orphan).

Use `repo.getTransaction(id)` (from `@/lib/repo`) to read rows and `fs.readdirSync(UPLOADS_DIR)` to inspect files. Get `id` from `repo.listTransactions()[0].id` after case 1.

Verification: `npx vitest run tests/attachments-save.test.ts` → 4 tests pass.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/attachments-save.test.ts` exists with the 4 cases and passes
- [ ] The "invalid transfer" test fails when `src/app/actions.ts` is reverted (checked in Step 3)
- [ ] `git status` shows only `src/app/actions.ts` and `tests/attachments-save.test.ts` changed
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match `src/app/actions.ts` (drift).
- Loading `src/app/actions.ts` under Vitest still fails after mocking `next/navigation`, `next/cache`, `next/headers` and one further stub for a failing import — report which import fails rather than restructuring the action or its imports.
- Making the fix seems to require changing `repo.upsertTransaction` or the schema.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If more steps that can fail are ever added between the file write and `upsertTransaction`, they must go inside the same compensation (the `catch` that removes the new upload) or be moved before the write.
- Reviewers: check that the `try` wraps only `repo.upsertTransaction(...)`, so the `redirect()` throw is never swallowed.
- Deferred: a periodic sweep of orphaned files in `uploads/` (files not referenced by any `transactions.attachment`) — out of scope here.
