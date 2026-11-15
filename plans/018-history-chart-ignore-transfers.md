# Plan 018: The History "monthly spending" chart must not count transfers as spending

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e051a5d..HEAD -- src/lib/repo.ts tests/`
> If `src/lib/repo.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (data correctness)
- **Planned at**: commit `e051a5d`, 2026-11-15

## Why this matters

The History page has a stacked chart of monthly spending per category. Its query keeps every transaction that is **not income**, so a **transfer** (money moved between the user's own accounts, e.g. CTT → Trade Republic) is added to the chart as spending: under "no category" if it has none, or under its category if that is an expense category. Everywhere else (month summary, reports, notifications, budget) transfers are explicitly not spending, so the History chart shows bigger bars than the rest of the app and can rank "no category" as a top category because of savings transfers. The category picker is shown for transfers, so a category on a transfer is also possible. After this plan only purchases, expenses and payments count.

## Current state

`src/lib/repo.ts:661-676`:

```ts
/** Monthly outflow totals per category, for history charts. */
export function spendingByMonthAndCategory(fromMonth: string): { month: string; categoryId: number | null; total: number }[] {
  return memo(`spending:${fromMonth}`, () => readSpendingByMonthAndCategory(fromMonth));
}

function readSpendingByMonthAndCategory(fromMonth: string): { month: string; categoryId: number | null; total: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(t.date, 1, 7) AS month, t.category_id AS categoryId, SUM(t.amount) AS total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type != 'income' AND t.date >= ? AND (c.kind IS NULL OR c.kind = 'expense')
       GROUP BY month, t.category_id ORDER BY month`,
    )
    .all(`${fromMonth}-01`) as Row[];
  ...
}
```

The definition of spending used everywhere else, `src/lib/types.ts:167`:

```ts
export const isSpending = (type: TxType) => type === 'purchase' || type === 'expense' || type === 'payment';
```

Only caller: `src/components/reports/HistoryView.tsx:45`. No existing test covers this function.

Test pattern to copy: `tests/interest-db.test.ts:1-45` (real `repo` on a throwaway database in a temp `DATA_DIR`, `process.env.DATA_DIR` set before the dynamic imports, tables emptied in `beforeEach`, `afterAll` closes `globalThis.__nestfundDb` and removes the directory). Commit message style: short imperative sentence (e.g. `Keep receipts when all data is deleted`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| New test | `npx vitest run tests/history-spending.test.ts` | pass |
| All tests | `npm test` | all pass |

## Scope

**In scope**: `src/lib/repo.ts` (the one `WHERE` clause), new `tests/history-spending.test.ts`.

**Out of scope**: `HistoryView.tsx`, `calc.ts`, any other query. Meal-card purchases stay in the chart (they are spending). Do not change `isSpending`.

## Git workflow

- Branch: `advisor/018-history-ignore-transfers`
- One commit, e.g. `Leave transfers out of the History spending chart`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Count only spending types

In `readSpendingByMonthAndCategory`, replace `t.type != 'income'` with `t.type IN ('purchase', 'expense', 'payment')` and update the doc comment of `spendingByMonthAndCategory` to say it counts spending only (not income or transfers). Keep the rest of the query as is.

**Verify**: `npm run typecheck` → exit 0; `grep -n "t.type" src/lib/repo.ts` shows the new `IN (...)` clause.

### Step 2: Test

Create `tests/history-spending.test.ts` following `tests/interest-db.test.ts` (same imports, temp dir with a different prefix such as `nf-history-`, only `repo` needed). Insert rows with raw SQL into `transactions` (columns `date, amount, type, description, account, to_account, payment_method`, amount in cents), then assert on `repo.spendingByMonthAndCategory('2026-01')`:

1. A purchase of 10.00 (category null), an expense of 5.00 and a payment of 2.50 in the same month all count: total for `categoryId: null` is 17.5.
2. An income of 100.00 and a transfer of 50.00 (`type = 'transfer'`, `to_account = 'traderepublic'`, category null) in the same month do **not** change that total.
3. A transfer with an expense category id (use an id from `SELECT id FROM categories WHERE kind = 'expense' LIMIT 1`) is not counted under that category.
4. A purchase before `fromMonth` is ignored (guards the date filter you did not change).

**Verify**: `npx vitest run tests/history-spending.test.ts` → passes. Then temporarily restore `t.type != 'income'` and confirm tests 2 and 3 **fail**; put the fix back and re-run → passes. Finally `npm test` → all pass.

## Test plan

Covered in Step 2 (one file, four cases, written to fail without the fix).

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test file exists, fails without the fix and passes with it
- [ ] `git status` shows only `src/lib/repo.ts` and `tests/history-spending.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The query no longer has the `t.type != 'income'` clause, or has another caller than `HistoryView.tsx`.
- An existing test fails and the fix would be to edit that test.
- `TxType` has gained a type besides purchase, expense, payment, income and transfer: decide with the operator whether it is spending.

## Maintenance notes

- Any new SQL that totals "spending" must use the same three types as `isSpending`. Reviewer: `grep -n "type !=" src/lib/*.ts` should show only the notifications query (`'transfer'` exclusion).
- Past months change: History bars drop by the amount of transfers that were wrongly included. That is the intended correction.
