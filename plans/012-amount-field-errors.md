# Plan 012: Explain a mistyped amount in the app's language, and say so when the server cannot read it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ed4209c..HEAD -- src/components/transactions/TransactionForm.tsx src/components/dashboard/AccountsPanel.tsx src/app/actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (shares the locale JSON files with plans 011 and 013, in other groups; run 011, 012, 013 in order)
- **Category**: UX / accessibility
- **Planned at**: commit `ed4209c`, 2026-11-14

## Why this matters

The two main amount fields (new/edit transaction and the dashboard's quick transfer) use an HTML `pattern`, so a bad value
shows the browser's generic validation bubble ("Please match the requested format") in the *browser's* language, not the app's,
with no hint of what format is wanted. Worse, a value that passes the pattern but cannot be read (for example `1,2,3`) is accepted by
the browser, rejected by the server, and the user is silently sent back to the list with nothing saved and no message.
After this plan a mistyped amount produces a short message in the app's language with an example ("12,50"), and an amount the
server cannot read brings the user back to the form with a visible error.

## Current state

- `src/components/transactions/TransactionForm.tsx` — the amount field of the transaction form:

```tsx
<Field label={`${t('common.amount')} (€)`}>
  <input
    name="amount"
    required
    inputMode="decimal"
    autoComplete="off"
    placeholder="0,00"
    pattern="[0-9.,\s]*[0-9][0-9.,\s]*"
    defaultValue={transaction ? String(transaction.amount).replace('.', ',') : ''}
    className="input !py-3 text-3xl font-semibold tabular-nums tracking-tight sm:text-2xl"
    autoFocus={!transaction}
  />
</Field>
```
  and, near the top of the form body, the existing error alert (only for transfers):

```tsx
{error === 'transfer' && (
  <p role="alert" className="rounded-control border border-negative/30 bg-negative/10 px-3 py-2 text-sm">
    {t('tx.transferError')}
  </p>
)}
```
- `src/components/dashboard/AccountsPanel.tsx` — the quick-transfer amount field (the other `pattern=` in the codebase):

```tsx
<input name="amount" required inputMode="decimal" placeholder="0,00" pattern="[0-9.,\s]*[0-9][0-9.,\s]*" className="input tabular-nums" />
```
- `src/app/actions.ts` — `saveTransactionAction`; an unreadable or zero amount redirects silently, and the transfer error shows the pattern to copy:

```ts
const num = (fd: FormData, k: string, fallback = 0) => parseDecimal(str(fd, k)) ?? fallback;   // line ~54
…
export async function saveTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  const existing = id ? repo.getTransaction(id) : null;
  const amount = Math.abs(num(fd, 'amount'));
  const description = text(fd, 'description', MAX_TEXT.description);
  if (!amount || !description) redirect(safeBack(fd, '/transactions'));      // silent
  …
  if (type === 'transfer' && (!toAccount || toAccount === account)) redirect(`/transactions/${id ?? 'new'}?error=transfer`);
```
  `parseDecimal` (in `src/lib/format.ts`) accepts `12,50`, `12.50`, `1.234,56`, `1,234.56` and returns `null` for anything else (for example `1,2,3`).
- `src/app/transactions/new/page.tsx` and `src/app/transactions/[id]/page.tsx` already pass `?error=` through as the `error` prop of `TransactionForm`.
- i18n: client components use `const { t } = useI18n()` (`@/i18n/client`); keys live in nested JSON in `src/i18n/locales/en-US.json` / `pt-PT.json`
  (add every key to **both**; keep 2-space indent, trailing newline, non-ASCII unescaped). Existing groups used here: `common`, `tx`.
- The other money inputs in the app (`inputMode="decimal"` without `pattern`) are intentionally **not** touched by this plan: they accept any text and the
  server falls back to a default; changing all of them is a larger, separate decision.
- Tests: Vitest, node environment; no DOM. Pattern for source-structure tests: `tests/page-titles.test.ts`.

Conventions: client components start with `'use client'`; `@/` alias; 2-space indent; single quotes; keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| New test | `npx vitest run tests/amount-input.test.ts` | pass |

## Scope

**In scope**:
- `src/components/AmountInput.tsx` (create)
- `src/components/transactions/TransactionForm.tsx`
- `src/components/dashboard/AccountsPanel.tsx`
- `src/app/actions.ts` (only `saveTransactionAction`)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`
- `tests/amount-input.test.ts` (create)

**Out of scope**:
- The `pattern` itself (do not make it stricter), `parseDecimal`, and every other money input.
- Server actions other than `saveTransactionAction`.
- Keeping the user's other typed values after a server-side amount error (the existing transfer error does not either).

## Git workflow

- Branch: `advisor/012-amount-errors`
- One commit, message in repo style: `Explain mistyped amounts in the app's language`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add translation keys (both locales)

| key | en-US | pt-PT |
|---|---|---|
| `common.amountRequired` | `Enter an amount.` | `Indica um valor.` |
| `common.amountInvalid` | `Use digits and a comma for the cents, for example 12,50.` | `Usa algarismos e vírgula para os cêntimos, por exemplo 12,50.` |
| `tx.amountError` | `That amount could not be read. Use digits and a comma, for example 12,50.` | `Não foi possível ler o valor. Usa algarismos e vírgula, por exemplo 12,50.` |

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) { const o=require('./src/i18n/locales/'+f+'.json'); for (const k of ['common.amountRequired','common.amountInvalid','tx.amountError']) { const v=k.split('.').reduce((a,p)=>a&&a[p],o); if(typeof v!=='string') throw new Error(f+' missing '+k) } }"` → exit 0, no output.

### Step 2: Create `AmountInput`

Create `src/components/AmountInput.tsx`:

```tsx
'use client';

import type { InputHTMLAttributes } from 'react';
import { useI18n } from '@/i18n/client';

/**
 * Amount text field ("12,50"): digits with a comma or dot for the cents. When the browser rejects the value it says why in the
 * app's language, with an example, instead of its own generic bubble. All other input props pass through.
 */
export function AmountInput({ onInvalid, onInput, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'pattern' | 'inputMode'>) {
  const { t } = useI18n();
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      pattern="[0-9.,\s]*[0-9][0-9.,\s]*"
      onInvalid={(e) => {
        onInvalid?.(e);
        e.currentTarget.setCustomValidity(t(e.currentTarget.validity.valueMissing ? 'common.amountRequired' : 'common.amountInvalid'));
      }}
      onInput={(e) => {
        onInput?.(e);
        e.currentTarget.setCustomValidity(''); // clear the message as soon as the user edits, or the field would stay invalid
      }}
    />
  );
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Use it in the two forms

- `TransactionForm.tsx`: replace the amount `<input … />` shown above with `<AmountInput name="amount" required autoComplete="off" placeholder="0,00" defaultValue={…same as today…} className="…same classes…" autoFocus={!transaction} />`
  (drop `inputMode` and `pattern`, they are built in). Import `{ AmountInput } from '@/components/AmountInput'`.
- `AccountsPanel.tsx`: replace the quick-transfer amount input with `<AmountInput name="amount" required placeholder="0,00" className="input tabular-nums" />` and add the import.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -rn 'pattern="\[0-9' src --include=*.tsx` → only `src/components/AmountInput.tsx`.

### Step 4: Tell the user when the server cannot read the amount

In `saveTransactionAction` (`src/app/actions.ts`) split the combined check so an unreadable or zero amount returns to the form with an error, and keep the description behaviour as it is:

```ts
const amount = Math.abs(num(fd, 'amount'));
const description = text(fd, 'description', MAX_TEXT.description);
// An amount that cannot be read (or is zero) goes back to the form with a message instead of vanishing silently.
if (!amount) redirect(`/transactions/${id ?? 'new'}?error=amount`);
if (!description) redirect(safeBack(fd, '/transactions'));
```

In `TransactionForm.tsx` replace the transfer-only alert with one that handles both errors:

```tsx
{(error === 'transfer' || error === 'amount') && (
  <p role="alert" className="rounded-control border border-negative/30 bg-negative/10 px-3 py-2 text-sm">
    {t(error === 'transfer' ? 'tx.transferError' : 'tx.amountError')}
  </p>
)}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Add the regression test

Create `tests/amount-input.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDecimal } from '@/lib/format';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const locales = ['en-US', 'pt-PT'].map((f) => JSON.parse(read(`src/i18n/locales/${f}.json`)));

describe('amount fields', () => {
  it('both amount fields use AmountInput; no raw pattern input is left', () => {
    for (const f of ['src/components/transactions/TransactionForm.tsx', 'src/components/dashboard/AccountsPanel.tsx']) {
      const src = read(f);
      expect(src, f).toContain('<AmountInput');
      expect(src, f).not.toContain('pattern="[0-9');
    }
  });

  it('the server redirects an unreadable amount back to the form with an error', () => {
    expect(read('src/app/actions.ts')).toContain("?error=amount");
  });

  it('the form shows the amount error, and every message exists in both languages', () => {
    expect(read('src/components/transactions/TransactionForm.tsx')).toContain("'tx.amountError'");
    for (const dict of locales) {
      expect(typeof dict.common.amountRequired).toBe('string');
      expect(typeof dict.common.amountInvalid).toBe('string');
      expect(typeof dict.tx.amountError).toBe('string');
    }
  });

  it('the values the pattern lets through but the server cannot read really are rejected by parseDecimal', () => {
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
  });
});
```

**Verify**: `npx vitest run tests/amount-input.test.ts` → 4 tests pass; then `npx vitest run` → all pass.

### Step 6 (optional manual check)

With `DATA_DIR=<temp dir> npx next dev -p 7802`, open `/transactions/new`, type `abc` in the amount and press Save: the bubble must show the app-language
message with the "12,50" example. Type `1,2,3` and Save: you must land back on the form with the red alert. If you cannot drive a browser, say so.

## Test plan

- `tests/amount-input.test.ts` (Step 5): structure checks (no DOM available) plus `parseDecimal` facts that justify the server-side error. Pattern: `tests/page-titles.test.ts`.
- `npx vitest run` → all pass including 4 new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/amount-input.test.ts`
- [ ] `grep -rn 'pattern="\[0-9' src --include=*.tsx` → only `src/components/AmountInput.tsx`
- [ ] `grep -n "error=amount" src/app/actions.ts` → one match, inside `saveTransactionAction`
- [ ] the Step 1 key-check command exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The live `saveTransactionAction` differs from the excerpt (for example the amount check moved or a message mechanism was added).
- `setCustomValidity` typing or `onInvalid` is rejected by `tsc` in a way you cannot fix inside `AmountInput.tsx`.
- Either amount field has other attributes not listed here that `AmountInput` would drop (report them).

## Maintenance notes

- New money fields should use `AmountInput`; consider migrating the remaining `inputMode="decimal"` inputs later (deferred: they rely on server fallbacks and need a decision per form).
- The server-side error loses the other typed fields, like the existing transfer error; if that bothers users, preserve them through the redirect in a follow-up.
- Reviewer: try `abc`, `1,2,3`, an empty amount, and a good value in the browser; confirm the message disappears when you edit the field.
