# Plan 025: Editing a transaction returns to the page it was opened from

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- "src/app/transactions/[id]/page.tsx" src/app/transactions/page.tsx src/app/page.tsx src/components/transactions/TransactionList.tsx src/components/transactions/TransactionForm.tsx src/components/dashboard/AccountsPanel.tsx src/app/actions.ts`
> Plans 022–024 are expected to have changed `TransactionForm.tsx` and a few lines of `actions.ts`.
> The specific lines quoted in "Current state" must still be recognisable; if not, STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/022, 023, 024 (same files; run after them)
- **Category**: bug (interaction)
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

Opening a transaction from a search ("lidl"), from one account's list, from page 3, or from the
dashboard, then pressing Save, Cancel or Delete, always lands on `/transactions?month=<month of that
transaction>`. The search, the account filter, the page number or the dashboard are gone and have to
be set up again. Verified in a browser on 2026-11-15: a row opened from
`/transactions?q=lidl&account=meal_card` had `back` = `/transactions?month=2026-11`. After this plan
the edit page returns to exactly the page it was opened from. Cancel also stops reloading the whole
app (it is a plain `<a>` today).

## Current state

- `src/app/transactions/[id]/page.tsx` (38 lines). The relevant part:

```tsx
export default async function EditTransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const tx = getTransaction(Number(id));
  if (!tx) notFound();
  const { t } = await getI18n();
  const back = `/transactions?month=${tx.date.slice(0, 7)}`;
```

  `back` is then used twice: as a hidden input of the delete form
  (`<input type="hidden" name="back" value={back} />`) and as the `back` prop of `<TransactionForm>`.

- `src/components/transactions/TransactionList.tsx` — server component used by the transactions page
  and the dashboard. Props today: `{ transactions, categories, locale, compact = false }`. Each row:

```tsx
                    <Link href={`/transactions/${tx.id}`} className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition hover:bg-raised/60">
```

- `src/app/transactions/page.tsx` — the list page. It has a helper `query(overrides)` that returns the
  current filters as a query string starting with `?` (for example `?month=2026-11&account=revolut`;
  it returns `?month=` when no filter at all is set, which means "all months"). The page number is in
  the variable `page`. The list is rendered with:

```tsx
        <TransactionList transactions={txs} categories={categories} locale={locale} />
```

- `src/app/page.tsx` (dashboard). `const { m, saved: justSaved } = await searchParams;` and
  `const month = isMonth(m) ? m : currentMonth();`. The recent list:

```tsx
        <TransactionList transactions={txs.slice(0, 6)} categories={categories} locale={locale} compact />
```

- `src/components/dashboard/AccountsPanel.tsx` (client component), in the "recent transfers" list:

```tsx
                    <Link href={`/transactions/${r.id}`} className="link shrink-0 !text-xs">
```

- `src/components/transactions/TransactionForm.tsx` — the hidden input
  `<input type="hidden" name="back" value={back} />` and the Cancel control
  `<a href={back} className=…>` (the class list may have been changed by plan 024). `Link` from
  `next/link` is already imported at the top of this file.

- `src/app/actions.ts`:
  - `const safeBack = (fd: FormData, fallback: string) => safeLocalPath(str(fd, 'back'), fallback);`
  - `saveTransactionAction` ends with `redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));`
    and `deleteTransactionAction` with `redirect(safeBack(fd, '/transactions'));`. Both already honour
    whatever local path the form posts as `back`. Nothing to change for the happy path.
  - Three places in `saveTransactionAction` send the user back to the form on an error with
    `redirect(txFormErrorUrl(id, 'amount'))`, `… 'date'` and `… 'transfer'`. `txFormErrorUrl` comes
    from `@/lib/tx-form-error` and returns `/transactions/<id or "new">?error=<error>` (plus
    `&type=transfer` for a new transfer after plan 022).

- `src/lib/security.ts:18` — the existing guard against open redirects; reuse it, do not write another:

```ts
export function safeLocalPath(value: string, fallback: string): string {
  if (!value || value.length > 500) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
```

  `security.ts` is pure (no Node-only imports), so client components may import from it.

- Tests run in Node without a DOM; pure helpers go in `src/lib/` with a test in `tests/`. Exemplar:
  `tests/tx-form-error.test.ts`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**:
- `src/lib/tx-links.ts` (create)
- `tests/tx-links.test.ts` (create)
- `src/components/transactions/TransactionList.tsx`
- `src/app/transactions/page.tsx` (one prop on `<TransactionList>`)
- `src/app/page.tsx` (one prop on `<TransactionList>`)
- `src/components/dashboard/AccountsPanel.tsx` (one `href`)
- `src/app/transactions/[id]/page.tsx`
- `src/components/transactions/TransactionForm.tsx` (only the Cancel control)
- `src/app/actions.ts` (only the three error redirects in `saveTransactionAction`)

**Out of scope** (do NOT touch):
- `safeLocalPath` itself and `src/lib/security.ts`.
- `src/app/transactions/new/page.tsx` (`back` stays `/transactions`).
- Links to transactions from the notifications page, reports or rules pages, if any: they keep the
  current behaviour (return to the transaction's month).
- Scroll position restoration.

## Git workflow

- Branch: `advisor/025-return-after-edit`
- One commit, plain-sentence message, for example: `Return to the page a transaction was opened from`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure helpers

Create `src/lib/tx-links.ts`:

```ts
import { safeLocalPath } from './security';

/** Link to a transaction's edit page that remembers the page it is opened from (a local path with its query). */
export function txEditHref(id: number, from?: string): string {
  return from ? `/transactions/${id}?from=${encodeURIComponent(from)}` : `/transactions/${id}`;
}

/** Where the edit page returns to: the page it was opened from when that is a safe local path, otherwise the transaction's month. */
export function txBackTarget(from: string | undefined, date: string): string {
  return safeLocalPath(from ?? '', `/transactions?month=${date.slice(0, 7)}`);
}
```

Create `tests/tx-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { txBackTarget, txEditHref } from '@/lib/tx-links';

describe('returning from the edit page', () => {
  it('remembers the page a transaction was opened from', () => {
    expect(txEditHref(7)).toBe('/transactions/7');
    expect(txEditHref(7, '/transactions?q=lidl&account=meal_card')).toBe('/transactions/7?from=%2Ftransactions%3Fq%3Dlidl%26account%3Dmeal_card');
  });
  it('returns there, or to the month of the transaction', () => {
    expect(txBackTarget('/transactions?q=lidl&page=3', '2026-11-14')).toBe('/transactions?q=lidl&page=3');
    expect(txBackTarget('/', '2026-11-14')).toBe('/');
    expect(txBackTarget(undefined, '2026-11-14')).toBe('/transactions?month=2026-11');
  });
  it('never returns to another site', () => {
    for (const bad of ['https://example.com', '//example.com', 'javascript:alert(1)', '/\\example.com'])
      expect(txBackTarget(bad, '2026-11-14'), bad).toBe('/transactions?month=2026-11');
  });
});
```

**Verify**: `npm test -- tests/tx-links.test.ts` → 3 tests pass.

### Step 2: The list passes the origin along

In `src/components/transactions/TransactionList.tsx`:

- add an optional prop `from?: string` (in the destructuring and in the props type);
- import `txEditHref` from `@/lib/tx-links`;
- change the row link to `href={txEditHref(tx.id, from)}`.

In `src/app/transactions/page.tsx`, pass the current list URL (filters plus the page number when it is
not the first page):

```tsx
        <TransactionList transactions={txs} categories={categories} locale={locale} from={`/transactions${query({ page: page > 1 ? String(page) : undefined })}`} />
```

In `src/app/page.tsx`, pass the dashboard URL (with the month only when one was chosen):

```tsx
        <TransactionList transactions={txs.slice(0, 6)} categories={categories} locale={locale} compact from={isMonth(m) ? `/?m=${month}` : '/'} />
```

In `src/components/dashboard/AccountsPanel.tsx`, import `txEditHref` from `@/lib/tx-links` and change
the recent-transfer link to `href={txEditHref(r.id, '/')}`.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: The edit page uses it

In `src/app/transactions/[id]/page.tsx`:

- type `searchParams` as `Promise<{ error?: string; from?: string }>` and read `from` next to `error`;
- import `txBackTarget` from `@/lib/tx-links`;
- replace the `back` line with `const back = txBackTarget(from, tx.date);`.

Nothing else changes: the delete form and `<TransactionForm>` already receive `back`.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Cancel becomes a client-side link

In `src/components/transactions/TransactionForm.tsx`, change the Cancel control from `<a href={back} …>`
/ `</a>` to `<Link href={back} …>` / `</Link>`. Keep its `className` exactly as it is in the file at
that moment. Do not touch anything else in the form.

**Verify**: `npm run typecheck` → exit 0; `grep -n "<a href={back}" src/components/transactions/TransactionForm.tsx` → no matches.

### Step 5: An error on the edit form keeps the origin too

In `src/app/actions.ts`, inside `saveTransactionAction`, directly after
`const existing = id ? repo.getTransaction(id) : null;`, add:

```ts
  // Back to the form with a message; when editing, the form keeps knowing which page it was opened from.
  const formError = (error: TxFormError) => {
    const url = txFormErrorUrl(id, error);
    return id && str(fd, 'back') ? `${url}&from=${encodeURIComponent(safeBack(fd, '/transactions'))}` : url;
  };
```

Extend the import to `import { txFormErrorUrl, type TxFormError } from '@/lib/tx-form-error';` (keep
any other name plan 022 added to that import). Then replace the three
`redirect(txFormErrorUrl(id, '<error>'))` calls in this function with `redirect(formError('<error>'))`
(`'amount'`, `'date'`, `'transfer'`). The conditions in front of them stay as they are.

**Verify**: `npm run typecheck` → exit 0;
`grep -c "redirect(formError(" src/app/actions.ts` → 3;
`grep -c "redirect(txFormErrorUrl(" src/app/actions.ts` → 0.

### Step 6: Full run

**Verify**: `npm test` → all pass.

## Test plan

- `tests/tx-links.test.ts` (3 tests, Step 1), including the "never returns to another site" case.
- `npm test` → all existing tests pass (`tests/page-titles.test.ts` and `tests/routes.test.ts` read
  page files; they must stay green).
- Optional browser check (throwaway `DATA_DIR`): add two expenses, one described "Lidl". Open
  `/transactions?q=lidl`, click the row, press Cancel → back on `/transactions?q=lidl`. Open it again,
  change the amount, Save → `/transactions?q=lidl&saved=1` with the search still applied. From the
  dashboard's recent list, open a row and Cancel → back on the dashboard.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/tx-links.test.ts` has 3 passing tests
- [ ] `grep -rn "/transactions/\${tx.id}\|/transactions/\${r.id}" src` → no matches
- [ ] `grep -n "txBackTarget" "src/app/transactions/[id]/page.tsx"` → one import and one use
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `safeLocalPath` no longer rejects values starting with `//` or containing a backslash (the third
  test in Step 1 fails): do not weaken the test; report.
- `query()` in `src/app/transactions/page.tsx` no longer exists or no longer returns a string starting
  with `?`.
- The Cancel control in `TransactionForm.tsx` is not an `<a href={back}>` (and not already a `Link`).

## Maintenance notes

- Any new place that links to `/transactions/<id>` should use `txEditHref(id, <current URL>)`.
- `from` travels in the URL and is only ever used after `safeLocalPath`; reviewers should check that
  no new code redirects to `from` without it.
- After a save the app appends `saved=1` to the return URL. Plan 028 turns that into a toast and
  removes the parameter from the address bar.
