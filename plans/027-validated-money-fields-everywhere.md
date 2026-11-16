# Plan 027: Every money field rejects a mistyped amount instead of saving 0

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/lib/format.ts src/components/AmountInput.tsx src/components/goals/GoalForm.tsx src/app/budget/page.tsx src/components/dashboard/AccountsPanel.tsx src/app/portfolio/page.tsx src/app/transactions/categories/page.tsx src/components/income/IncomeForm.tsx src/components/setup/FixedExpensesForm.tsx src/app/setup/page.tsx src/app/actions.ts tests/security.test.ts`
> `actions.ts` and `AccountsPanel.tsx` are expected to have small changes from plans 022–025 in
> `saveTransactionAction` and one link. If any `<input>` quoted in "Current state" is no longer there,
> STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (independent of 022–026; touches different lines)
- **Category**: bug
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

Only two fields in the app check what is typed as an amount: the amount of a transaction and of the
dashboard quick transfer. They use the `AmountInput` component, which refuses text that is not a
number and explains why in the app's language. Every other money field is a plain text input. What
happens with a typo there was reproduced in a browser on 2026-11-15: a new goal with the target
"abc" and the monthly amount "1oo" was saved without any message as a goal of €0.00, immediately
shown as "Goal reached". The same silent "becomes 0" applies to budget items, and a mistyped account
balance is silently ignored. After this plan all those fields use `AmountInput`, and the two server
actions that turned an unreadable required amount into 0 no longer save it.

## Current state

- `src/components/AmountInput.tsx` (whole component):

```tsx
'use client';

import type { InputHTMLAttributes } from 'react';
import { useI18n } from '@/i18n/client';
import { AMOUNT_PATTERN } from '@/lib/format';

export function AmountInput({ onInvalid, onInput, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'pattern' | 'inputMode'>) {
  const { t } = useI18n();
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      pattern={AMOUNT_PATTERN}
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

  Note the props type: `type`, `pattern` and `inputMode` may NOT be passed to it. An empty optional
  field is always valid (browsers skip `pattern` for an empty value).

- `src/lib/format.ts:81` — the pattern (unsigned on purpose: a transaction amount is never negative):

```ts
export const AMOUNT_PATTERN = String.raw`\s*(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+,\d+|\d{1,3}(?:,\d{3})+\.\d+)\s*`;
```

  `parseMoney` / `parseDecimal` in the same file accept a leading `-`. Balances can be negative, so
  balance fields need a signed variant.

- The plain money inputs to convert (line numbers at `60bbf14`; each is a single `<input … />`):

| File | Line | `name` | Signed? |
|---|---|---|---|
| `src/components/goals/GoalForm.tsx` | 40 | `target` (required) | no |
| `src/components/goals/GoalForm.tsx` | 43 | `monthly` | no |
| `src/components/goals/GoalForm.tsx` | 62 | `current` | yes |
| `src/app/budget/page.tsx` | 37 | `amount` (required) | no |
| `src/app/budget/page.tsx` | 364 | `{name}` (a `.map` over `transportAllowance`, `annualBonus`) | no |
| `src/components/dashboard/AccountsPanel.tsx` | 191 | `value` (required, has `autoFocus`) | yes |
| `src/components/dashboard/AccountsPanel.tsx` | 196 | `invested` | no |
| `src/app/portfolio/page.tsx` | 193 | `value` (required) | yes |
| `src/app/portfolio/page.tsx` | 196 | `invested` | no |
| `src/app/transactions/categories/page.tsx` | 39 | `monthlyBudget` | no |
| `src/app/transactions/categories/page.tsx` | 60 | `monthlyBudget` | no |
| `src/components/income/IncomeForm.tsx` | 56 | `salary` | no |
| `src/components/income/IncomeForm.tsx` | 71 | `meal` | no |
| `src/components/income/IncomeForm.tsx` | 100 | `salaryPerDay` | no |
| `src/components/income/IncomeForm.tsx` | 104 | `mealPerDay` | no |
| `src/components/income/IncomeForm.tsx` | 122 | `extraIncome` | no |
| `src/components/setup/FixedExpensesForm.tsx` | 20 | `amount` | no |
| `src/app/setup/page.tsx` | 46 | `{name}` (the `amountInput` helper; used for balances, income, goals) | yes |

  Example of one of them (`GoalForm.tsx:40`):

```tsx
        <input name="target" required inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.target) : ''} className="input tabular-nums" />
```

- Fields that look similar but are NOT money and must stay plain inputs:
  `IncomeForm.tsx` `normalDays` and `holidayDays` (days worked), `InterestSection.tsx` `annualRate` and
  `taxRate` (percentages), everything under `src/components/simulators/`, and the two `type="number"`
  pay-day inputs in `budget/page.tsx`.

- `src/app/actions.ts` helpers: `const num = (fd, k, fallback = 0) => parseMoney(str(fd, k)) ?? fallback;`
  and `const optNum = (fd, k) => parseMoney(str(fd, k));` (null when unreadable or empty).
  - `saveBudgetItemAction`: `amount: Math.abs(num(fd, 'amount')),` → unreadable becomes 0.
  - `saveGoalAction`: `target: Math.abs(num(fd, 'target')),` → unreadable becomes 0.
  - Both actions already use the convention "invalid required input → `return` without saving", e.g.
    `const name = text(fd, 'name', MAX_TEXT.name); if (!name) return;`.

- `AmountInput` is a client component that calls `useI18n()`. It may be rendered from server
  components (`budget/page.tsx`, `portfolio/page.tsx`, `categories/page.tsx`, `setup/page.tsx`) as
  long as only plain values are passed as props (strings, numbers, booleans). All pages are inside
  the `I18nProvider` set up in `src/app/layout.tsx`.

- Pattern tests live in `tests/security.test.ts`, block `describe('amount field pattern', …)`, which
  builds `new RegExp(`^(?:${AMOUNT_PATTERN})$`)`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**: `src/lib/format.ts`, `src/components/AmountInput.tsx`, the eight files in the table
above, `src/app/actions.ts` (only `saveBudgetItemAction` and `saveGoalAction`), `tests/security.test.ts`.

**Out of scope** (do NOT touch):
- `AMOUNT_PATTERN`, `parseDecimal`, `parseMoney` (do not change what they accept).
- The non-money fields listed above.
- Showing server-side error messages for these forms.
- Locale files (the two messages `common.amountRequired` and `common.amountInvalid` already exist).

## Git workflow

- Branch: `advisor/027-money-fields`
- One commit, plain-sentence message, for example: `Check every money field the way the transaction amount is checked`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: A signed pattern and a `signed` prop

In `src/lib/format.ts`, below `AMOUNT_PATTERN`, add:

```ts
/** The same, with an optional leading minus: for balances, which can be negative. */
export const SIGNED_AMOUNT_PATTERN = String.raw`\s*-?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+,\d+|\d{1,3}(?:,\d{3})+\.\d+)\s*`;
```

In `src/components/AmountInput.tsx`: import `SIGNED_AMOUNT_PATTERN` too, add a prop `signed`, and use it:

```tsx
export function AmountInput({ onInvalid, onInput, signed = false, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'pattern' | 'inputMode'> & { signed?: boolean }) {
```

and `pattern={signed ? SIGNED_AMOUNT_PATTERN : AMOUNT_PATTERN}`. Change nothing else; update the doc
comment with one sentence: "`signed` also allows a leading minus (balances)."

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Test the signed pattern

In `tests/security.test.ts`, add `SIGNED_AMOUNT_PATTERN` to the import from `@/lib/format` and add
inside `describe('amount field pattern', …)`:

```ts
  it('has a signed variant for balances that parseMoney also reads', () => {
    const signed = new RegExp(`^(?:${SIGNED_AMOUNT_PATTERN})$`);
    for (const ok of ['-12', '-12,50', '12,50', '-1.234,56', ' -7 ']) {
      expect(signed.test(ok), ok).toBe(true);
      expect(parseMoney(ok), ok).not.toBeNull();
    }
    for (const bad of ['abc', '1oo', '--5', '5-', '-']) expect(signed.test(bad), bad).toBe(false);
    expect(field.test('-12'), 'unsigned stays unsigned').toBe(false);
  });
```

(`field` is the unsigned regular expression already declared at the top of that `describe`.)

**Verify**: `npm test -- tests/security.test.ts` → all pass, including the new test.

### Step 3: Convert the inputs

For each row of the table in "Current state":

1. change `<input` to `<AmountInput`;
2. delete the attribute `inputMode="decimal"` (the component sets it; passing it is a type error);
3. add the attribute `signed` on the rows marked "yes";
4. keep every other attribute exactly as it is (`name`, `required`, `autoFocus`, `value`, `onChange`,
   `defaultValue`, `placeholder`, `aria-label`, `className`);
5. add `import { AmountInput } from '@/components/AmountInput';` to the file if it is not there
   (`AccountsPanel.tsx` already has it).

Example, `GoalForm.tsx:40` becomes:

```tsx
        <AmountInput name="target" required defaultValue={goal ? toInputDecimal(goal.target) : ''} className="input tabular-nums" />
```

and `GoalForm.tsx:62` becomes:

```tsx
          <AmountInput name="current" signed defaultValue={toInputDecimal(manualCurrent ?? 0)} className="input tabular-nums" />
```

Do the files one at a time and run the typecheck after each.

**Verify** (after all files): `npm run typecheck` → exit 0, and

```
grep -rn 'inputMode="decimal"' src --include=*.tsx | grep -v -E 'AmountInput.tsx|normalDays|holidayDays|InterestSection|simulators/'
```

→ no output.

### Step 4: The two actions stop saving an unreadable required amount as 0

In `src/app/actions.ts`:

- `saveBudgetItemAction`: after `if (!name) return;` add

```ts
  // An amount that cannot be read is not saved as 0 (the field already blocks it in the browser).
  const amount = optNum(fd, 'amount');
  if (amount == null) return;
```

  and change `amount: Math.abs(num(fd, 'amount')),` to `amount: Math.abs(amount),`.

- `saveGoalAction`: after `if (!name) return;` add

```ts
  const target = optNum(fd, 'target');
  if (target == null) return;
```

  and change `target: Math.abs(num(fd, 'target')),` to `target: Math.abs(target),`.

Leave `monthly`, `current` and every other field as they are (empty optional fields must keep meaning 0).

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

- The new signed-pattern test (Step 2).
- `npm test` → all existing tests pass.
- Optional browser check (throwaway `DATA_DIR`): on `/goals`, open "+ New goal", type a name, target
  `abc`, press Add → the browser shows the message "Use digits and a comma for the cents, for example
  12,50." (in the app's language) on the target field and nothing is saved. Target `1500` → saved as
  €1,500.00. On the dashboard, update a balance to `-20,5` → accepted.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test in `tests/security.test.ts` passes
- [ ] The `grep` in Step 3 prints nothing
- [ ] `grep -c "<AmountInput" src/components/goals/GoalForm.tsx` → 3; `src/components/income/IncomeForm.tsx` → 5
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- One of the inputs in the table is not where the table says and cannot be found by its `name` in the
  same file.
- Typecheck reports that `AmountInput` cannot be used in one of the server pages (for example because
  a function is being passed as a prop there): report which page; do not convert that page to a client
  component.
- An existing test that asserts `saveGoalAction` or `saveBudgetItemAction` stores 0 for an unreadable
  amount fails: report it instead of changing the test.

## Maintenance notes

- Any new money field should use `AmountInput` (`signed` only for balances). The `grep` in Step 3 is a
  quick way to find stragglers.
- Plan 028 adds a "saved" tick to some of these forms; it relies on these fields being validated in
  the browser so the tick is not shown for something that was silently not saved.
- Deferred: the simulators' `NumberField.tsx` (mixes € and % fields; noted in `plans/README.md`).
