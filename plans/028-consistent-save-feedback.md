# Plan 028: One consistent "saved" / "deleted" confirmation across the app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/app/layout.tsx src/app/page.tsx src/app/transactions/page.tsx src/app/transactions/new/page.tsx src/app/actions.ts src/components/SubmitButton.tsx src/components/goals/GoalForm.tsx src/components/income/IncomeForm.tsx src/app/budget/page.tsx src/app/transactions/categories/page.tsx src/i18n/locales`
> Plans 022–027 are expected to have changed several of these files. What matters is that the lines
> quoted in "Current state" are still recognisable; if one is gone, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches the shared submit button and the root layout)
- **Depends on**: plans/024 (adds an inline alert this plan replaces), plans/027 (see Step 6); run last
- **Category**: tech-debt (interaction consistency)
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

Feedback after an action is uneven (checked in a browser on 2026-11-15):

- Saving a transaction adds `?saved=1` to the address and the list page prints "Transaction saved."
  from it. The message is part of the URL, so it is shown again on every reload and when coming back
  with the browser's back button.
- Deleting a transaction shows nothing at all.
- Saving a goal, a budget item, a category, the month's income or the profile only spins the button
  for a moment; nothing confirms the save.

After this plan: a small toast confirms saves and deletes of transactions, disappears after a few
seconds and removes its parameter from the address bar; and the forms that save in place show a short
"✓" on their button.

## Current state

- `src/app/actions.ts`:
  - `const withParam = (url: string, key: string, value: string) => `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;`
  - `saveTransactionAction` ends with `redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));`
    (plan 024 added one line before it that redirects to `/transactions/new?saved=1&…`).
  - `deleteTransactionAction`:

```ts
export async function deleteTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) await removeAttachment(repo.deleteTransaction(id));
  refresh();
  redirect(safeBack(fd, '/transactions'));
}
```

- `src/app/transactions/page.tsx` prints the message from the URL:

```tsx
      {sp.saved && (
        <div className="mb-4">
          <Alert tone="success">{t('tx.added')}</Alert>
        </div>
      )}
```

- `src/app/page.tsx` (dashboard): `const { m, saved: justSaved } = await searchParams;` and, inside the
  alerts block, `{justSaved && <Alert tone="success">{t('common.saved')}</Alert>}`. The dashboard
  quick-transfer form posts `back="/"`, which is how `/?saved=1` is reached.

- `src/app/transactions/new/page.tsx` (after plan 024) shows
  `{again.saved && (<div className="mb-4"><Alert tone="success">{t('tx.added')}</Alert></div>)}`.

- `src/app/settings/page.tsx` uses a different parameter (`?accounts=saved`). Leave it alone.

- `src/app/layout.tsx` renders, inside `<I18nProvider>` and `<AccountsProvider>`:

```tsx
            <BottomNav />
            <PwaClient />
```

  `PwaClient` (`src/components/pwa/PwaClient.tsx`) is the existing example of a fixed notice; its
  container classes are
  `pointer-events-none fixed inset-x-3 top-[4.25rem] z-50 space-y-2 lg:left-64 lg:top-4`, and one
  notice is
  `pointer-events-auto rounded-control border border-caution/30 bg-surface px-4 py-3 text-sm shadow-pop`.
  The mobile header is 3.5rem high; the desktop sidebar is 15rem (`w-60`) wide.

- `src/components/SubmitButton.tsx` (whole file):

```tsx
'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui';

export function SubmitButton({ children, className = 'btn-primary', disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} className={`relative ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}
```

  It is used by about 20 files, including forms where a finished action does NOT mean success (the
  Trading 212 connection form reports errors after the action returns). So the tick must be opt-in.

- The in-place forms that get the tick (each renders `<SubmitButton …>` for its save/add button):
  `src/components/goals/GoalForm.tsx`, `src/components/income/IncomeForm.tsx`,
  `src/app/budget/page.tsx` (two: `ItemForm` and the profile form),
  `src/app/transactions/categories/page.tsx` (two: new category and each existing category).

- `useI18n()` from `@/i18n/client` gives `{ t, locale }` in client components. Existing keys:
  `common.saved` ("Saved" / "Guardado"), `tx.added` ("Transaction saved." / "Transação registada.").

- Tests run in Node without a DOM; pure helpers go in `src/lib/` with a test in `tests/`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**:
- `src/lib/flash.ts` (create), `tests/flash.test.ts` (create)
- `src/components/Flash.tsx` (create)
- `src/app/layout.tsx` (mount the component)
- `src/app/transactions/page.tsx`, `src/app/page.tsx`, `src/app/transactions/new/page.tsx` (remove the
  inline alerts)
- `src/app/actions.ts` (only the redirect of `deleteTransactionAction`)
- `src/components/SubmitButton.tsx`
- `src/components/goals/GoalForm.tsx`, `src/components/income/IncomeForm.tsx`,
  `src/app/budget/page.tsx`, `src/app/transactions/categories/page.tsx` (add one prop to their save buttons)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`

**Out of scope** (do NOT touch):
- `src/app/settings/page.tsx` and its `?accounts=saved`, the setup wizard, backup pages.
- `ConfirmButton.tsx` and the `window.confirm` question before deleting.
- An "Undo" for deletes (see Maintenance notes).
- `PwaClient.tsx`.
- Adding the tick to any `SubmitButton` not listed above.

## Git workflow

- Branch: `advisor/028-save-feedback`
- Two commits are fine (toast; button tick), plain-sentence messages, for example:
  `Confirm saved and deleted transactions with a toast` and `Show a tick when an in-place form was saved`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure helpers

Create `src/lib/flash.ts`:

```ts
/** One-off confirmations carried in the URL after a redirect (`?saved=1`, `?deleted=1`). */
export const FLASH_PARAMS = ['saved', 'deleted'] as const;

/** Translation key of the confirmation to show for this URL, or null. */
export function flashMessageKey(pathname: string, params: URLSearchParams): string | null {
  if (params.get('deleted') === '1') return 'tx.deleted';
  if (params.get('saved') === '1') return pathname.startsWith('/transactions') ? 'tx.added' : 'common.saved';
  return null;
}

/** The same address without the confirmation parameters, so a reload does not show the message again. */
export function withoutFlash(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  for (const p of FLASH_PARAMS) rest.delete(p);
  const qs = rest.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
```

Create `tests/flash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';
import { flashMessageKey, withoutFlash } from '@/lib/flash';

const q = (s: string) => new URLSearchParams(s);

describe('one-off confirmations', () => {
  it('picks the message for the page', () => {
    expect(flashMessageKey('/transactions', q('month=2026-11&saved=1'))).toBe('tx.added');
    expect(flashMessageKey('/transactions/new', q('saved=1&type=income'))).toBe('tx.added');
    expect(flashMessageKey('/', q('saved=1'))).toBe('common.saved');
    expect(flashMessageKey('/transactions', q('deleted=1'))).toBe('tx.deleted');
    expect(flashMessageKey('/transactions', q('month=2026-11'))).toBeNull();
    expect(flashMessageKey('/transactions', q('saved=yes'))).toBeNull();
  });
  it('removes only its own parameters from the address', () => {
    expect(withoutFlash('/transactions', q('q=lidl&saved=1&page=2'))).toBe('/transactions?q=lidl&page=2');
    expect(withoutFlash('/', q('saved=1'))).toBe('/');
    expect(withoutFlash('/transactions', q('month=&deleted=1'))).toBe('/transactions?month=');
  });
  it('has the deleted message in both languages', () => {
    expect((en.tx as unknown as Record<string, string>).deleted).toBeTruthy();
    expect((pt.tx as unknown as Record<string, string>).deleted).toBeTruthy();
  });
});
```

**Verify**: `npm test -- tests/flash.test.ts` → the first two tests pass; the third fails until Step 2.

### Step 2: Translation key

In both locale files, inside `"tx"`, add:

- `en-US.json`: `"deleted": "Transaction deleted."`
- `pt-PT.json`: `"deleted": "Transação apagada."`

**Verify**: `npm test -- tests/flash.test.ts` → 3 tests pass.

### Step 3: The toast component

Create `src/components/Flash.tsx`:

```tsx
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { flashMessageKey, withoutFlash } from '@/lib/flash';

const VISIBLE_MS = 4000;

/**
 * Shows the one-off confirmation a redirect left in the URL (`?saved=1`, `?deleted=1`) as a toast, then removes the
 * parameter from the address bar so a reload or the back button does not repeat it.
 */
export function Flash() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = flashMessageKey(pathname, params);
    if (!key) return; // also the case right after the parameter was removed: the toast stays until its timer ends
    setMessage(t(key));
    window.history.replaceState(null, '', withoutFlash(pathname, params) + window.location.hash);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, params]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The live region is always in the page so screen readers announce the text when it appears.
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-50 flex justify-center lg:left-64 lg:top-4">
      {message && <p className="pointer-events-auto rounded-control border border-positive/30 bg-surface px-4 py-3 text-sm shadow-pop">{message}</p>}
    </div>
  );
}
```

Why the timer lives in a ref and not in the effect's cleanup: after `replaceState`, Next.js updates
`params` and the effect runs again. A cleanup-based timer would be cancelled by that second run and
the toast would never hide. Keep the code exactly as above.

Mount it in `src/app/layout.tsx`: add `import { Suspense } from 'react';` and
`import { Flash } from '@/components/Flash';`, and directly after `<PwaClient />` add:

```tsx
            <Suspense fallback={null}>
              <Flash />
            </Suspense>
```

(`useSearchParams` must sit under a `Suspense` boundary.)

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Remove the inline alerts the toast replaces

- `src/app/transactions/page.tsx`: delete the `{sp.saved && ( … )}` block quoted in "Current state".
  If `Alert` is then unused in that file, remove it from the import.
- `src/app/page.tsx`: delete the line `{justSaved && <Alert tone="success">{t('common.saved')}</Alert>}`
  and change `const { m, saved: justSaved } = await searchParams;` to `const { m } = await searchParams;`
  (also drop `saved?: string` from the `searchParams` type). `Alert` is still used there for other
  alerts; keep its import.
- `src/app/transactions/new/page.tsx`: delete the `{again.saved && ( … )}` block added by plan 024 and
  the `Alert` import if unused. Keep everything else from plan 024 (`key`, `initialDate`). If the block
  is not there (plan 024 not executed), skip this bullet.

**Verify**: `npm run typecheck` → exit 0;
`grep -rn "sp.saved\|justSaved\|again.saved" src/app` → no matches.

### Step 5: Deleting a transaction confirms too

In `src/app/actions.ts`, change the last line of `deleteTransactionAction` to:

```ts
  redirect(withParam(safeBack(fd, '/transactions'), 'deleted', '1'));
```

**Verify**: `npm run typecheck` → exit 0.

### Step 6: An opt-in tick on the submit button

Replace `src/components/SubmitButton.tsx` with:

```tsx
'use client';

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/**
 * Submit button for a form with a server action: while the action runs it is disabled (no double-submit),
 * shows a spinner in place of the label (same size, so the layout does not jump) and is announced as busy.
 * Must be rendered inside the <form>. Extra props (name, value, aria-*, formAction) pass through.
 * `savedTick`: for forms that save in place (no redirect), show a tick for a moment when the action has finished.
 * Use it only where a finished action means the data was saved.
 */
export function SubmitButton({ children, className = 'btn-primary', disabled, savedTick = false, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { savedTick?: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const wasPending = useRef(false);
  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || !savedTick) return;
    setDone(true);
    const timer = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(timer);
  }, [pending, savedTick]);
  const overlay = pending || done;
  return (
    <button type="submit" {...rest} className={`relative ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>
      <span className={overlay ? 'invisible' : undefined}>{children}</span>
      {overlay && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          {pending ? <Spinner /> : '✓'}
        </span>
      )}
      <span className="sr-only" role="status">
        {done ? t('common.saved') : ''}
      </span>
    </button>
  );
}
```

Then add the attribute `savedTick` to the save/add `<SubmitButton>` in exactly these places:

- `src/components/goals/GoalForm.tsx` — the one `SubmitButton` at the bottom.
- `src/components/income/IncomeForm.tsx` — the one `SubmitButton` at the bottom.
- `src/app/budget/page.tsx` — the `SubmitButton` in `ItemForm` and the one in the profile form
  (`action={saveProfileAction}`).
- `src/app/transactions/categories/page.tsx` — both `SubmitButton`s (new category; each category row).

Example: `<SubmitButton savedTick className="btn-primary">{goal ? t('common.save') : t('common.add')}</SubmitButton>`.

Why plan 027 comes first: these actions return without saving when a required value is unreadable.
With plan 027 the browser blocks such input before the action runs, so the tick is not shown for
something that was not saved.

**Verify**: `npm run typecheck` → exit 0; `grep -rn "savedTick" src --include=*.tsx | grep -v SubmitButton.tsx | wc -l` → 6.

### Step 7: Full run

**Verify**: `npm test` → all pass.

## Test plan

- `tests/flash.test.ts` (3 tests).
- `npm test` → all existing tests pass.
- Optional browser check (throwaway `DATA_DIR`, with the Browser window visible): save a new
  transaction → on the list a toast "Transaction saved." appears at the top, the address bar shows no
  `saved=1`, the toast disappears after about 4 seconds, and reloading does not bring it back. Delete
  a transaction → toast "Transaction deleted.". On `/goals`, edit a goal and Save → the button shows
  "✓" for about 2 seconds, then its label again. On `/settings`, the Trading 212 button shows no tick.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/flash.test.ts` has 3 passing tests
- [ ] `grep -rn "sp.saved\|justSaved\|again.saved" src/app` → no matches
- [ ] `grep -n "<Flash />" src/app/layout.tsx` → 1 match
- [ ] `grep -n "'deleted', '1'" src/app/actions.ts` → 1 match
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- In the browser check the toast never disappears, or disappears immediately: compare the effect with Step 3 line by line and fix it; if it still misbehaves, report.
- `window.history.replaceState` makes Next.js re-fetch or re-render the page in a loop (visible as
  repeated requests in the dev-server log): remove the `replaceState` call, keep the toast, and report.
- Typecheck or a test reports that `SubmitButton` is rendered outside `I18nProvider` (the error says
  `useI18n` must be used inside a provider): report where; do not wrap pages in a second provider.
- `tests/page-titles.test.ts` or `tests/routes.test.ts` fail after editing the page files.

## Maintenance notes

- Any new redirect that should confirm something: append `saved=1` or `deleted=1` and the toast does
  the rest; a new kind of message needs a parameter in `FLASH_PARAMS`, a branch in `flashMessageKey`
  and a translation.
- The toast shares its screen position with the offline / "update ready" notices of `PwaClient`. They
  can overlap when both show at once; acceptable, but if it becomes annoying merge the two into one
  stack.
- Deferred on purpose: "Undo" after deleting a transaction. A delete also removes the receipt file, so
  an undo needs a soft-delete first; worth its own plan.
- Reviewer: check that `savedTick` was added only to the six buttons listed.
