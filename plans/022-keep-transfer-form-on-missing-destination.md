# Plan 022: A transfer without a destination is stopped in the form instead of wiping it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/lib/tx-form-error.ts src/app/actions.ts src/components/transactions/TransactionForm.tsx tests/tx-form-error.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

On "New transaction", choosing **Transfer**, typing an amount and a description and pressing **Save**
without picking a "To" account sends the form to the server, which redirects to
`/transactions/new?error=transfer`. The page that comes back is empty (amount, description and date
are gone) and has switched back to the **Expense** tab, while showing the message "For a transfer,
pick a destination account different from the source." This was reproduced in a browser on
2026-11-15. After this plan the form never leaves the screen in that case: the problem is shown next
to the "To" account chips and nothing typed is lost. As a safety net, the server redirect keeps the
Transfer tab selected.

## Current state

- `src/lib/tx-form-error.ts` — the three form errors and the URL builder (16 lines). Whole file:

```ts
/** The reasons the transaction form can be sent back to the user, carried in the form URL as `?error=`. */
export const TX_FORM_ERRORS = ['transfer', 'amount', 'date'] as const;
export type TxFormError = (typeof TX_FORM_ERRORS)[number];

/** Translation key of the message shown for each error. */
export const TX_FORM_ERROR_MESSAGE: Record<TxFormError, string> = {
  transfer: 'tx.transferError',
  amount: 'tx.amountError',
  date: 'tx.dateError',
};

/** The `error` query value if it is one of ours, otherwise undefined. */
export const asTxFormError = (value: string | undefined): TxFormError | undefined => TX_FORM_ERRORS.find((e) => e === value);

/** Where to send the user so the new/edit form shows `error`. */
export const txFormErrorUrl = (id: number | null, error: TxFormError) => `/transactions/${id ?? 'new'}?error=${error}`;
```

- `src/app/actions.ts:130-134` — the server check inside `saveTransactionAction`:

```ts
  const type = oneOf<TxType>(TX_TYPES, str(fd, 'type'), 'purchase');
  const account = optAccount(fd, 'account') ?? 'ctt';
  const toAccount = type === 'transfer' ? optAccount(fd, 'toAccount') : null;
  // A transfer needs a different destination; otherwise fall back to the form so the user can fix it.
  if (type === 'transfer' && (!toAccount || toAccount === account)) redirect(txFormErrorUrl(id, 'transfer'));
```

- `src/app/transactions/new/page.tsx` already reads `?type=` and passes it to the form as
  `initialType` (so `/transactions/new?type=transfer` opens on the Transfer tab). Do not edit it.
- `src/components/transactions/TransactionForm.tsx` — client component (`'use client'`). Relevant
  parts:
  - line 109: `const [toAccount, setToAccount] = useState<AccountId | ''>(transaction?.toAccount ?? '');`
  - line 115: `const isTransfer = type === 'transfer';`
  - lines 135-147: the `<form action={saveTransactionAction} ... onSubmit={(e) => { ... }}>`; the
    existing `onSubmit` only fills an empty description.
  - lines 152-156: the server error banner:

```tsx
      {error && (
        <p role="alert" className="rounded-control border border-negative/30 bg-negative/10 px-3 py-2 text-sm">
          {t(TX_FORM_ERROR_MESSAGE[error])}
        </p>
      )}
```

  - lines 253-259: the "To" block:

```tsx
      {isTransfer && (
        <div>
          <span className="label">{t('tx.toAccount')}</span>
          <AccountChips name="toAccount" accounts={accounts} value={toAccount} onChange={setToAccount} exclude={account} />
          <p className="muted mt-1 text-xs">{t('tx.transferNote')}</p>
        </div>
      )}
```

- The message text already exists in both locale files as `tx.transferError`
  (`src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`). No new translation keys are needed.
- Tests run in a Node environment (no DOM), so component behaviour cannot be unit-tested. The repo's
  convention is to put the decision in a pure function in `src/lib/` and test that. Exemplar:
  `tests/tx-form-error.test.ts`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. See "Optional browser
check" for a safe way.

## Scope

**In scope** (the only files you should modify):
- `src/lib/tx-form-error.ts`
- `src/app/actions.ts` (only the transfer check in `saveTransactionAction`)
- `src/components/transactions/TransactionForm.tsx`
- `tests/tx-form-error.test.ts`

**Out of scope** (do NOT touch):
- `src/app/transactions/new/page.tsx`, `src/app/transactions/[id]/page.tsx`.
- `src/components/dashboard/AccountsPanel.tsx` — its quick transfer uses two dropdowns that can never
  be empty or equal, so it does not have this problem.
- Keeping typed values after the `amount` and `date` server errors (the browser already blocks a bad
  amount and a missing date before submit).
- Locale files.

## Git workflow

- Branch: `advisor/022-transfer-destination`
- One commit, message in repo style (plain sentence), for example:
  `Keep the transaction form when a transfer has no destination`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the shared check and keep the Transfer tab in the error URL

In `src/lib/tx-form-error.ts`:

1. Add a pure function, used by both the server action and the form:

```ts
/** True when a transfer has no destination account, or the destination is the source. */
export const transferNeedsDestination = (type: string, account: string, toAccount: string | null | undefined) =>
  type === 'transfer' && (!toAccount || toAccount === account);
```

2. Change `txFormErrorUrl` so the transfer error keeps the Transfer tab selected on the new form:

```ts
/** Where to send the user so the new/edit form shows `error`. The transfer error reopens the new form on the Transfer tab. */
export const txFormErrorUrl = (id: number | null, error: TxFormError) =>
  `/transactions/${id ?? 'new'}?error=${error}${error === 'transfer' && id == null ? '&type=transfer' : ''}`;
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use the shared check in the server action

In `src/app/actions.ts`, import `transferNeedsDestination` next to the existing
`import { txFormErrorUrl } from '@/lib/tx-form-error';` and replace the condition on line 134 with:

```ts
  if (transferNeedsDestination(type, account, toAccount)) redirect(txFormErrorUrl(id, 'transfer'));
```

Keep the comment above it. Change nothing else in the action.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Stop the submit in the form and show the message next to the "To" chips

In `src/components/transactions/TransactionForm.tsx`:

1. Extend the import from `@/lib/tx-form-error` with `transferNeedsDestination`.
2. Add state after the existing `useState` lines:
   `const [needsDestination, setNeedsDestination] = useState(false);`
3. At the very top of the existing `onSubmit` handler (before the description fallback), add:

```tsx
        if (transferNeedsDestination(type, account, toAccount)) {
          e.preventDefault();
          setNeedsDestination(true);
          document.getElementById('tx-to-account')?.scrollIntoView({ block: 'center' });
          return;
        }
```

4. Change the "To" block to carry the id, clear the flag when a destination is picked, and show the
   message:

```tsx
      {isTransfer && (
        <div id="tx-to-account">
          <span className="label">{t('tx.toAccount')}</span>
          <AccountChips
            name="toAccount"
            accounts={accounts}
            value={toAccount}
            onChange={(a) => {
              setToAccount(a);
              setNeedsDestination(false);
            }}
            exclude={account}
          />
          {needsDestination && (
            <p role="alert" className="mt-2 rounded-control border border-negative/30 bg-negative/10 px-3 py-2 text-sm">
              {t(TX_FORM_ERROR_MESSAGE.transfer)}
            </p>
          )}
          <p className="muted mt-1 text-xs">{t('tx.transferNote')}</p>
        </div>
      )}
```

5. Leave the server error banner (lines 152-156) as it is.

Why `e.preventDefault()` works here: the form uses a React server action (`action={...}`); React only
runs the action when the submit event is not prevented, the same way the existing description
fallback runs before the action.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Tests

In `tests/tx-form-error.test.ts`, add `transferNeedsDestination` to the import and add inside the
existing `describe`:

```ts
  it('keeps the Transfer tab when a new transfer has no destination', () => {
    expect(txFormErrorUrl(null, 'transfer')).toBe('/transactions/new?error=transfer&type=transfer');
    expect(txFormErrorUrl(7, 'transfer')).toBe('/transactions/7?error=transfer');
    expect(txFormErrorUrl(null, 'amount')).toBe('/transactions/new?error=amount');
  });
  it('knows when a transfer still needs a destination', () => {
    expect(transferNeedsDestination('transfer', 'ctt', '')).toBe(true);
    expect(transferNeedsDestination('transfer', 'ctt', null)).toBe(true);
    expect(transferNeedsDestination('transfer', 'ctt', 'ctt')).toBe(true);
    expect(transferNeedsDestination('transfer', 'ctt', 'revolut')).toBe(false);
    expect(transferNeedsDestination('purchase', 'ctt', '')).toBe(false);
  });
```

**Verify**: `npm test -- tests/tx-form-error.test.ts` → all pass, including the 2 new tests.

## Test plan

- The two tests above (URL keeps the tab; the shared check).
- `npm test` → every existing test still passes.

## Optional browser check

Only if you have a browser tool. Use a throwaway database so the owner's data is never touched: create
a new empty folder outside the repo, set the environment variable `DATA_DIR` to its absolute path,
and run `npx next dev -p 7788`. Open `http://localhost:7788/transactions/new?type=transfer`, type an
amount and a description, press Save without choosing a "To" account. Expected: the page does not
navigate, the typed amount and description are still there, and the red message appears under the
"To" chips. Pick a "To" account: the message disappears and Save works. Stop the server afterwards.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the 2 new tests in `tests/tx-form-error.test.ts` pass
- [ ] `grep -n "transferNeedsDestination" src/app/actions.ts src/components/transactions/TransactionForm.tsx` shows a use in both files
- [ ] `git status --short` lists only the four in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts in "Current state" do not match the live code.
- `tests/tx-form-error.test.ts` already has expectations for `txFormErrorUrl(..., 'transfer')` that
  contradict Step 1.
- Preventing the submit event does not stop the server action (in the optional browser check the page
  still navigates to `?error=transfer`): report it instead of rewriting the form with `useActionState`.

## Maintenance notes

- Plans 023–026 also edit `TransactionForm.tsx`; run them after this one, in order.
- If a later change adds more client-side checks, follow the same shape: pure function in
  `src/lib/tx-form-error.ts`, used by the action and the form.
- Deferred: keeping the typed values after the `amount` / `date` server errors. That needs the form to
  move to `useActionState`; not worth it while the browser blocks those cases before submit.
