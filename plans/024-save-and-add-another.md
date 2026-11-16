# Plan 024: "Save + new" on the new-transaction form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/app/actions.ts src/app/transactions/new/page.tsx src/components/transactions/TransactionForm.tsx src/i18n/locales`
> Plans 022 and 023 are expected to have changed `TransactionForm.tsx`, `actions.ts` (one line in the
> transfer check) and the locale files (one key). The specific lines quoted in "Current state" must
> still be there; if not, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/022 and plans/023 (same files; run after them)
- **Category**: direction (small feature)
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

After saving a new transaction the app always goes to the transactions list. Logging several receipts
in a row (a common evening routine) means: add button → form → Save → list → add button → form … one
extra page per entry, and the date has to be set again each time when the receipts are from
yesterday. A second button, "Save + new", saves and comes straight back to an empty form that keeps
the kind (expense / income / transfer) and the date.

## Current state

- `src/app/actions.ts`, end of `saveTransactionAction` (lines 165-170 at `60bbf14`):

```ts
  // Only now is the old receipt unreferenced.
  if (previousAttachment && previousAttachment !== attachment) await removeAttachment(previousAttachment);
  repo.materializeRecurring();
  refresh();
  redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));
}
```

  Earlier in the same function: `const id = optId(fd, 'id');` (null for a new transaction),
  `const date = str(fd, 'date');` (already validated with `isISODate`), and
  `const type = oneOf<TxType>(TX_TYPES, str(fd, 'type'), 'purchase');`. `str(fd, k)` returns the
  trimmed string value of a form field or `''`.

- `src/app/transactions/new/page.tsx` (whole file, 20 lines):

```tsx
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Card, PageHeader } from '@/components/ui';
import { getI18n, pageTitle } from '@/i18n/server';
import { todayISO } from '@/lib/dates';
import { asTxFormError } from '@/lib/tx-form-error';
import { transactionFormOptions } from '@/lib/tx-options';

export const generateMetadata = pageTitle('tx.new');
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const { error, type } = await searchParams;
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('tx.new')} />
      <Card>
        <TransactionForm {...transactionFormOptions(t)} today={todayISO()} back="/transactions" error={asTxFormError(error)} initialType={type} />
      </Card>
    </div>
  );
}
```

- `src/components/transactions/TransactionForm.tsx` (client component):
  - the date state: `const [date, setDate] = useState(transaction?.date ?? today);`
  - `description`, `merchant`, `categoryId`, `account` are React state (controlled inputs). They do
    NOT reset by themselves when the page URL changes, because Next.js keeps the component mounted
    when only the query string changes. That is why this plan passes a changing `key`.
  - the button bar at the bottom of the form:

```tsx
      <div className="sticky bottom-[calc(3.6rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <a href={back} className="btn-ghost flex-1 sm:flex-none">
          {t('common.cancel')}
        </a>
        <SubmitButton className="btn-primary min-h-12 flex-[2] sm:flex-none">{t('common.save')}</SubmitButton>
      </div>
```

- `src/components/SubmitButton.tsx` — a `<button type="submit">` that shows a spinner while the form
  action runs. Its doc comment says: "Extra props (name, value, aria-*, formAction) pass through."
- `src/components/ui.tsx` exports `Alert` (`<Alert tone="success">…</Alert>`); the transactions list
  uses it for the "Transaction saved." message with the key `tx.added`.
- `src/lib/dates.ts` exports `isISODate(v: unknown): boolean` (true only for a real `YYYY-MM-DD` day).
  `src/lib/types.ts` exports `TX_TYPES`.
- Translations: `src/i18n/locales/en-US.json` and `pt-PT.json`, group `"tx"`; every key in both files.
- Tests run in Node without a DOM. Pure helpers live in `src/lib/` and are tested in `tests/`.
  Exemplar: `tests/tx-form-error.test.ts`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**:
- `src/lib/tx-again.ts` (create)
- `tests/tx-again.test.ts` (create)
- `src/app/actions.ts` (only the last lines of `saveTransactionAction`)
- `src/app/transactions/new/page.tsx`
- `src/components/transactions/TransactionForm.tsx`
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`

**Out of scope** (do NOT touch):
- `src/app/transactions/[id]/page.tsx` — the button is for new transactions only.
- `src/components/SubmitButton.tsx`.
- Carrying the account or the category to the next entry (deliberate: the category picks the account
  for some categories, and a kept account would silently override that).
- The dashboard quick-transfer form in `AccountsPanel.tsx`.

## Git workflow

- Branch: `advisor/024-save-and-new`
- One commit, plain-sentence message, for example: `Add "Save + new" to the new-transaction form`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure helpers for the URL

Create `src/lib/tx-again.ts`:

```ts
import { isISODate } from './dates';
import { TX_TYPES } from './types';

/**
 * Where "Save + new" goes: the new-transaction form again, keeping the kind and the date.
 * `nonce` only has to differ from the previous one; the page uses it as a React key so the form starts empty.
 */
export function addAnotherUrl(kept: { type: string; date: string }, nonce: number | string): string {
  const qs = new URLSearchParams({ saved: '1', type: kept.type, date: kept.date, n: String(nonce) });
  return `/transactions/new?${qs}`;
}

/** Reads those parameters back, ignoring anything that is not one of ours. */
export function parseAgainParams(sp: { saved?: string; type?: string; date?: string; n?: string }): { saved: boolean; type?: string; date?: string; formKey: string } {
  return {
    saved: sp.saved === '1',
    type: TX_TYPES.includes(sp.type as never) ? sp.type : undefined,
    date: isISODate(sp.date) ? sp.date : undefined,
    formKey: /^\d{1,20}$/.test(sp.n ?? '') ? (sp.n as string) : 'new',
  };
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Tests for the helpers

Create `tests/tx-again.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addAnotherUrl, parseAgainParams } from '@/lib/tx-again';

describe('save and add another', () => {
  it('builds the URL of a fresh form that keeps the kind and the date', () => {
    expect(addAnotherUrl({ type: 'income', date: '2026-11-14' }, 42)).toBe('/transactions/new?saved=1&type=income&date=2026-11-14&n=42');
  });
  it('reads its own parameters back', () => {
    expect(parseAgainParams({ saved: '1', type: 'income', date: '2026-11-14', n: '42' })).toEqual({ saved: true, type: 'income', date: '2026-11-14', formKey: '42' });
  });
  it('ignores values that are not ours', () => {
    expect(parseAgainParams({ saved: 'yes', type: 'gift', date: '2026-02-31', n: 'x<y' })).toEqual({ saved: false, type: undefined, date: undefined, formKey: 'new' });
    expect(parseAgainParams({})).toEqual({ saved: false, type: undefined, date: undefined, formKey: 'new' });
  });
});
```

**Verify**: `npm test -- tests/tx-again.test.ts` → 3 tests pass.

### Step 3: Translation keys

In both locale files, inside `"tx"`, add:

- `en-US.json`: `"saveAndNew": "Save + new"`
- `pt-PT.json`: `"saveAndNew": "Guardar + nova"`

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) console.log(require('./src/i18n/locales/'+f+'.json').tx.saveAndNew)"`
→ prints both texts.

### Step 4: Redirect back to the form when the second button was used

In `src/app/actions.ts`:

1. Add `import { addAnotherUrl } from '@/lib/tx-again';` with the other `@/lib` imports.
2. Replace the final `redirect(...)` line of `saveTransactionAction` with:

```ts
  // "Save + new" (new transactions only): straight back to an empty form that keeps the kind and the date.
  if (!id && str(fd, 'again') === '1') redirect(addAnotherUrl({ type, date }, Date.now()));
  redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));
```

**Verify**: `npm run typecheck` → exit 0.

### Step 5: The page reads the parameters

Replace the body of `src/app/transactions/new/page.tsx` so that it:

- types `searchParams` as `Promise<{ error?: string; type?: string; saved?: string; date?: string; n?: string }>`;
- calls `const again = parseAgainParams(sp);` (import from `@/lib/tx-again`), where `sp` is the awaited
  `searchParams`;
- shows the confirmation above the card when `again.saved` is true:

```tsx
      {again.saved && (
        <div className="mb-4">
          <Alert tone="success">{t('tx.added')}</Alert>
        </div>
      )}
```

  (add `Alert` to the import from `@/components/ui`);
- renders the form with a key and the kept date:

```tsx
        <TransactionForm
          key={again.formKey}
          {...transactionFormOptions(t)}
          today={todayISO()}
          back="/transactions"
          error={asTxFormError(sp.error)}
          initialType={sp.type}
          initialDate={again.date}
        />
```

Keep `initialType={sp.type}` exactly as today (the form validates it itself).

**Verify**: typecheck fails here until Step 6 adds the `initialDate` prop; continue to Step 6.

### Step 6: The form gets the prop and the button

In `src/components/transactions/TransactionForm.tsx`:

1. Add an optional prop `initialDate?: string` (destructuring and props type, next to `initialType`).
2. Change the date state to
   `const [date, setDate] = useState(transaction?.date ?? initialDate ?? today);`
3. Replace the button bar with the following. Note the order in the code: plain **Save** comes
   before "Save + new" in the HTML, and the `order-*` classes swap them on screen. This matters:
   pressing Enter in a field submits with the first submit button in the HTML, and that must stay
   plain Save.

```tsx
      <div className="sticky bottom-[calc(3.6rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <a href={back} className={`btn-ghost order-1 sm:flex-none ${transaction ? 'flex-1' : '!px-3'}`}>
          {t('common.cancel')}
        </a>
        <SubmitButton className={`btn-primary order-3 min-h-12 sm:flex-none ${transaction ? 'flex-[2]' : 'flex-1'}`}>{t('common.save')}</SubmitButton>
        {!transaction && (
          <SubmitButton name="again" value="1" className="btn-secondary order-2 min-h-12 flex-1 whitespace-nowrap !px-2 sm:flex-none sm:!px-4">
            {t('tx.saveAndNew')}
          </SubmitButton>
        )}
      </div>
```

   If plan 025 already changed `<a href={back}>` to `<Link href={back}>`, keep `Link` and only apply
   the class change.

How it works: a browser adds the pressed submit button's `name`/`value` to the form data, and React
passes that to the server action, so `fd.get('again')` is `'1'` only when "Save + new" was pressed.
Do not add any JavaScript to the `onSubmit` handler for this.

**Verify**: `npm run typecheck` → exit 0. `npm test` → all pass.

## Test plan

- `tests/tx-again.test.ts` (3 tests, Step 2).
- `npm test` → all existing tests pass.
- Optional browser check (throwaway `DATA_DIR`): open `/transactions/new`, set the date to yesterday,
  type `12,50`, press "Save + new". Expected: the form comes back empty with the cursor in the amount
  field, "Transaction saved." above it, the date still yesterday. Type `3` and press Enter in the
  amount field: expected to land on the transactions list (plain Save) with both entries there. At a
  375 px wide window the three buttons fit on one line without overflowing.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/tx-again.test.ts` exists with 3 passing tests
- [ ] `grep -n "addAnotherUrl" src/app/actions.ts` shows one import and one use
- [ ] `grep -c "saveAndNew" src/i18n/locales/en-US.json src/i18n/locales/pt-PT.json` → 1 for each file
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The end of `saveTransactionAction` does not match the excerpt.
- In the optional browser check, "Save + new" behaves like plain Save (the action does not receive
  `again=1`): report it; do not add a hidden input toggled by JavaScript without asking.
- In the browser check, pressing Enter in the amount field triggers "Save + new" instead of plain Save:
  the HTML order of the two submit buttons is wrong; fix the order as in Step 6, do not add JavaScript.

## Maintenance notes

- Plan 028 (save feedback) replaces the inline "Transaction saved." alert on this page with a toast;
  it knows about the `saved` parameter added here.
- If more values should be kept between entries (account, payment method), add them to
  `addAnotherUrl` / `parseAgainParams` and as `initial…` props; never trust the query values without
  the checks in `parseAgainParams`.
- Reviewer: check that editing an existing transaction shows only Cancel and Save, as before.
