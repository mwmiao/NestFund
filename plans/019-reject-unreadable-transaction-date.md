# Plan 019: Send the transaction form back with a message when the date cannot be read (instead of saving today)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e051a5d..HEAD -- src/app/actions.ts src/lib/tx-form-error.ts src/i18n/locales tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (018 is independent; they share no file)
- **Category**: bug (UX / data correctness)
- **Planned at**: commit `e051a5d`, 2026-11-15

## Why this matters

If the date sent with a transaction is missing or not a real calendar date (for example `2026-02-31`, which plan 005 made `isISODate` reject), `saveTransactionAction` quietly stores the transaction under **today**. The user sees "saved" and the entry sits in the wrong month, which changes budgets and reports. The date field is `type="date" required`, so a normal browser rarely sends a bad value, which is why this is P3; the fix mirrors what plan 012 did for unreadable amounts: go back to the form with a clear message.

## Current state

`src/app/actions.ts:117-146` (excerpt):

```ts
export async function saveTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  const existing = id ? repo.getTransaction(id) : null;
  const amount = Math.abs(num(fd, 'amount'));
  const description = text(fd, 'description', MAX_TEXT.description);
  // An amount that cannot be read (or is zero) goes back to the form with a message instead of vanishing silently.
  if (!amount) redirect(txFormErrorUrl(id, 'amount'));
  ...
  const date = str(fd, 'date');
  ...
      date: isISODate(date) ? date : todayISO(),
```

`src/lib/tx-form-error.ts` (whole file):

```ts
export const TX_FORM_ERRORS = ['transfer', 'amount'] as const;
export type TxFormError = (typeof TX_FORM_ERRORS)[number];
export const TX_FORM_ERROR_MESSAGE: Record<TxFormError, string> = {
  transfer: 'tx.transferError',
  amount: 'tx.amountError',
};
export const asTxFormError = (value: string | undefined): TxFormError | undefined => TX_FORM_ERRORS.find((e) => e === value);
export const txFormErrorUrl = (id: number | null, error: TxFormError) => `/transactions/${id ?? 'new'}?error=${error}`;
```

The form shows the message from `TX_FORM_ERROR_MESSAGE[error]` (`TransactionForm.tsx:153`) — no change needed there. Translations live in `src/i18n/locales/en-US.json` and `pt-PT.json` in the `tx` group, next to `"amountError"` (line 205) and `"transferError"` (line 265). Both files must keep exactly the same keys (check `tests/` for a locale parity test before editing; if there is none, still add both).

`todayISO` is also used for the snapshot action and others; do not touch those (they have no form to return to). Other callers of `isISODate` stay as they are.

Commit message style: short imperative sentence.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**: `src/lib/tx-form-error.ts`, `src/app/actions.ts` (the `saveTransactionAction` function only), `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`, and one new test file `tests/tx-form-error.test.ts`.

**Out of scope**: `TransactionForm.tsx`, the CSV import (it already reports a `date` reason), any other action, `isISODate`.

## Git workflow

- Branch: `advisor/019-reject-bad-date`
- One commit, e.g. `Ask for a valid date instead of saving a transaction under today`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: New error kind

In `src/lib/tx-form-error.ts` add `'date'` to `TX_FORM_ERRORS` and `date: 'tx.dateError'` to `TX_FORM_ERROR_MESSAGE`.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Translations

Add `"dateError"` to the `tx` group of both locale files, right after `"amountError"`:
- en-US: `"That date could not be read. Pick a real calendar date."`
- pt-PT: `"Não foi possível ler a data. Escolhe uma data válida do calendário."`

**Verify**: `npm test` → all pass (including any locale-parity test).

### Step 3: Use it in the action

In `saveTransactionAction`, right after the amount check, add:

```ts
  const date = str(fd, 'date');
  // A date that is not a real calendar day goes back to the form instead of being saved under today.
  if (!isISODate(date)) redirect(txFormErrorUrl(id, 'date'));
```

and remove the later `const date = str(fd, 'date');` line, changing `date: isISODate(date) ? date : todayISO(),` to `date,`. If `todayISO` is no longer used in `actions.ts` check with `grep -n todayISO src/app/actions.ts`: it is still used by `saveSnapshotAction`, so keep the import.

**Verify**: `npm run typecheck` → exit 0; `grep -n "isISODate(date)" src/app/actions.ts` shows the new check plus the unchanged `saveSnapshotAction` use.

### Step 4: Test

Create `tests/tx-form-error.test.ts` (pure, no database) covering the helper the action relies on:

```ts
import { describe, expect, it } from 'vitest';
import { asTxFormError, TX_FORM_ERROR_MESSAGE, TX_FORM_ERRORS, txFormErrorUrl } from '@/lib/tx-form-error';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';

describe('transaction form errors', () => {
  it('builds the form URL for the date error, for a new and an existing transaction', () => {
    expect(txFormErrorUrl(null, 'date')).toBe('/transactions/new?error=date');
    expect(txFormErrorUrl(7, 'date')).toBe('/transactions/7?error=date');
    expect(asTxFormError('date')).toBe('date');
    expect(asTxFormError('nope')).toBeUndefined();
  });
  it('has a translation in both languages for every error', () => {
    for (const e of TX_FORM_ERRORS) {
      const key = TX_FORM_ERROR_MESSAGE[e].replace('tx.', '');
      expect((en.tx as Record<string, string>)[key], `en ${e}`).toBeTruthy();
      expect((pt.tx as Record<string, string>)[key], `pt ${e}`).toBeTruthy();
    }
  });
});
```

If importing the JSON files fails typechecking (`resolveJsonModule`), read them with `fs.readFileSync` + `JSON.parse` instead.

**Verify**: `npx vitest run tests/tx-form-error.test.ts` → passes; `npm test` → all pass.

## Test plan

Step 4 (URL helper and translation coverage). The action itself needs a Next request context and is not unit-tested in this repo; manual spot check if a dev server is running: edit a transaction, in devtools change the date input's value to `2026-02-31`, submit → the form returns with the new message and nothing is saved.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test exists and passes
- [ ] `git status` shows only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `saveTransactionAction` no longer falls back to `todayISO()` for the date.
- A locale-parity test (or any existing test) fails and the fix would be to edit that test.
- The form already shows a date error some other way (then this plan is redundant).

## Maintenance notes

- Any new transaction form error: add it to `TX_FORM_ERRORS`, the message map and both locale files; the new test fails if a translation is missing.
- Reviewer: the unchanged `saveSnapshotAction` and `setupBalancesAction` keep their `todayISO()` fallback on purpose (no form to return to).
