# Plan 023: The category picker and the default account follow the kind of transaction

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/lib/categorize.ts src/lib/tx-options.ts src/components/transactions/TransactionForm.tsx src/i18n/locales tests/categorize.test.ts`
> Plan 022 is expected to have changed `TransactionForm.tsx` (a `needsDestination` state, an
> `onSubmit` guard and the "To" block). Any other difference from the "Current state" excerpts is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/022-keep-transfer-form-on-missing-destination.md (same file; run after it)
- **Category**: bug
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

The transaction form has three tabs: Expense, Income, Transfer. Whatever tab is selected, the category
area shows the same things: the one-tap chips of the most used *spending* categories and one dropdown
with every category in alphabetical order. Seen in a browser on 2026-11-15 after logging one grocery
purchase with the meal card: the Income tab offered a "Groceries" chip, and the account was
pre-selected to "Meal card" (the default account is "the account most used for spending"). Logging
income therefore starts with a wrong suggestion and a wrong account. After this plan each tab offers
the categories that fit it first, and the Income tab starts on the account income usually goes to.

## Current state

- `src/lib/categorize.ts:90-95` — the rule that already says which category kinds fit which tab:

```ts
/** A category fits the kind of transaction being logged (a salary is never suggested for a purchase). */
export function categoryFitsKind(category: Pick<CategoryLike, 'kind'>, kind: SuggestKind): boolean {
  if (kind === 'spending') return category.kind === 'expense';
  if (kind === 'income') return category.kind === 'income' || category.kind === 'salary';
  return category.kind === 'investment' || category.kind === 'savings';
}
```

  `SuggestKind` is `'spending' | 'income' | 'transfer'`. Category kinds are
  `'expense' | 'investment' | 'savings' | 'income' | 'salary'` (`src/lib/types.ts:49`).

- `src/lib/tx-options.ts` — server-only; builds the props for the form. Relevant lines 17-22 and 34:

```ts
  const recent = db
    .prepare("SELECT account FROM transactions WHERE type IN ('purchase','expense','payment') AND date >= date('now', '-30 days') GROUP BY account ORDER BY COUNT(*) DESC LIMIT 1")
    .get() as { account: string } | undefined;
  const accounts = visibleAccounts();
  const wanted = recent && ACCOUNT_IDS.includes(recent.account as AccountId) ? (recent.account as AccountId) : 'ctt';
  const defaultAccount: AccountId = accounts.includes(wanted) ? wanted : (accounts[0] ?? 'ctt');
  ...
  return { categories, suggest, merchants: column('merchant'), subcategories: column('subcategory'), defaultAccount, topCategoryIds };
```

- `src/components/transactions/TransactionForm.tsx` (client component):
  - lines 16-19: `type Kind = 'spending' | 'income' | 'transfer';` and `kindOf`.
  - lines 21-27: `CategoryOption { id; key; label; color; kind?: string }`.
  - props (lines 74-99) include `defaultAccount = 'ctt'`, `topCategoryIds = []`.
  - line 104: `const [kind, setKind] = useState<Kind>(kindOf(initial));`
  - line 107: `const [categoryId, setCategoryId] = useState<string>(...)`
  - line 108: `const [account, setAccount] = useState<AccountId>(transaction?.account ?? defaultAccount);`
  - line 110: `const [accountTouched, setAccountTouched] = useState(!!transaction);`
  - line 116: `const topCategories = topCategoryIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is CategoryOption => !!c);`
  - line 165: the tab buttons call `onClick={() => setKind(k)}`.
  - lines 211-234: the chips and the dropdown:

```tsx
        {topCategories.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {topCategories.map((c) => (
              <button key={c.id} type="button" aria-pressed={categoryId === String(c.id)} onClick={() => pickCategory(String(c.id))} className={`chip ${categoryId === String(c.id) ? 'chip-active' : ''}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.label}
              </button>
            ))}
          </div>
        )}
        <select name="categoryId" value={categoryId} aria-label={t('tx.category')} className="input" onChange={(e) => pickCategory(e.target.value)}>
          <option value="">{t('tx.noCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
```

    (In the file the `<button>` attributes are on separate lines; the content is the same.)

- Translations live in `src/i18n/locales/en-US.json` and `src/i18n/locales/pt-PT.json`, group `"tx"`.
  Every key must exist in both files.
- Tests run in Node without a DOM; pure logic goes in `src/lib/` and is tested there. Exemplar:
  `tests/categorize.test.ts` (it already builds a `cats: CategoryLike[]` list).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**:
- `src/lib/categorize.ts`
- `src/lib/tx-options.ts`
- `src/components/transactions/TransactionForm.tsx`
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`
- `tests/categorize.test.ts`

**Out of scope** (do NOT touch):
- `suggestCategory` and `categoryFitsKind` behaviour (only add a new function next to them).
- The category filter on the transactions list page, the categories page, the budget page.
- `src/app/transactions/new/page.tsx` and `[id]/page.tsx`: they spread `transactionFormOptions(t)` into
  the form, so a new property reaches the form without editing them.
- The server action. Any category remains valid for any type on the server; this plan only changes
  what the form offers first.

## Git workflow

- Branch: `advisor/023-kind-aware-categories`
- One commit, plain-sentence message, for example: `Offer the categories that fit the transaction kind first`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a pure helper that splits the categories by fit

In `src/lib/categorize.ts`, directly below `categoryFitsKind`, add:

```ts
/** The categories that fit `kind` first, then the rest; both keep the order they came in. */
export function splitCategoriesForKind<C extends { kind?: string }>(categories: readonly C[], kind: SuggestKind): { fitting: C[]; others: C[] } {
  const fitting: C[] = [];
  const others: C[] = [];
  for (const c of categories) (categoryFitsKind({ kind: c.kind ?? 'expense' }, kind) ? fitting : others).push(c);
  return { fitting, others };
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Provide a default account for income

In `src/lib/tx-options.ts`, after the `defaultAccount` line, add:

```ts
  // Income usually lands in one account; when nothing was logged yet it is the main bank account.
  const incomeRecent = db.prepare("SELECT account FROM transactions WHERE type = 'income' GROUP BY account ORDER BY COUNT(*) DESC LIMIT 1").get() as { account: string } | undefined;
  const incomeWanted = incomeRecent && ACCOUNT_IDS.includes(incomeRecent.account as AccountId) ? (incomeRecent.account as AccountId) : 'ctt';
  const defaultIncomeAccount: AccountId = accounts.includes(incomeWanted) ? incomeWanted : (accounts[0] ?? 'ctt');
```

and add `defaultIncomeAccount` to the returned object.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Add the translation key

In both locale files, inside the `"tx"` object, add one key (keep valid JSON, mind the commas):

- `en-US.json`: `"otherCategories": "Other categories"`
- `pt-PT.json`: `"otherCategories": "Outras categorias"`

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) console.log(require('./src/i18n/locales/'+f+'.json').tx.otherCategories)"`
→ prints `Other categories` then `Outras categorias`.

### Step 4: Make the form follow the tab

In `src/components/transactions/TransactionForm.tsx`:

1. Import `splitCategoriesForKind` from `@/lib/categorize` (extend the existing import).
2. Add a prop `defaultIncomeAccount = 'ctt'` of type `AccountId` (both in the destructuring and in the
   props type, next to `defaultAccount`).
3. Change the initial account (line 108) so a new income entry starts on the income account:

```tsx
  const [account, setAccount] = useState<AccountId>(transaction?.account ?? (kindOf(initial) === 'income' ? defaultIncomeAccount : defaultAccount));
```

4. After `const isTransfer = ...`, compute the split and the chips for the current tab:

```tsx
  const { fitting, others } = splitCategoriesForKind(categories, kind);
  // Spending: the six most used. Income / transfer: the few categories that fit (salary, income / investment, savings).
  const chipCategories = kind === 'spending' ? topCategories : fitting.slice(0, 6);
```

5. Add a function that changes the tab and tidies what no longer fits. Only a *new* transaction is
   tidied; when editing, nothing the user saved earlier is changed on their behalf:

```tsx
  const changeKind = (next: Kind) => {
    setKind(next);
    if (transaction) return;
    const selected = categories.find((c) => String(c.id) === categoryId);
    if (selected && !splitCategoriesForKind([selected], next).fitting.length) setCategoryId('');
    if (!accountTouched) setAccount(next === 'income' ? defaultIncomeAccount : defaultAccount);
  };
```

   and change the tab buttons from `onClick={() => setKind(k)}` to `onClick={() => changeKind(k)}`.

6. In the category area, render `chipCategories` instead of `topCategories` (both the
   `topCategories.length > 0` condition and the `.map`), and replace the dropdown options with:

```tsx
          <option value="">{t('tx.noCategory')}</option>
          {fitting.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          {others.length > 0 && (
            <optgroup label={t('tx.otherCategories')}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
```

   Every category stays selectable; the ones that do not fit are only moved under a heading.

Do not change `pickCategory`, the suggestion button, or anything below the category area.

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Tests

In `tests/categorize.test.ts`, add `splitCategoriesForKind` to the import and add:

```ts
describe('categories offered per kind of transaction', () => {
  const ids = (list: { id: number }[]) => list.map((c) => c.id);
  it('puts expense categories first for spending and keeps the order', () => {
    const { fitting, others } = splitCategoriesForKind(cats, 'spending');
    expect(ids(fitting)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(ids(others)).toEqual([5]);
  });
  it('offers only income and salary categories first for income', () => {
    const { fitting, others } = splitCategoriesForKind(cats, 'income');
    expect(ids(fitting)).toEqual([5]);
    expect(others).toHaveLength(6);
  });
  it('treats a category without a kind as an expense', () => {
    expect(splitCategoriesForKind([{ id: 9 }], 'spending').fitting).toHaveLength(1);
    expect(splitCategoriesForKind([{ id: 9 }], 'transfer').fitting).toHaveLength(0);
  });
});
```

(`cats` is the list declared at the top of that file: ids 1,2,3,4,6,7 are `expense`, id 5 is `salary`.)

**Verify**: `npm test -- tests/categorize.test.ts` → all pass, including 3 new tests.

## Test plan

- The three tests above.
- `npm test` → all existing tests pass.
- Optional browser check (throwaway `DATA_DIR`, see "Commands"): log one expense in "Groceries"; open
  `/transactions/new`, switch to Income. Expected: chips "Income" and "Salary" (no "Groceries"), the
  dropdown lists Income and Salary first and the rest under "Other categories", the account chip is
  "Banco CTT". Switch back to Expense: the "Groceries" chip returns.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; 3 new tests in `tests/categorize.test.ts` pass
- [ ] `grep -n "setKind(k)" src/components/transactions/TransactionForm.tsx` returns no matches
- [ ] `grep -c "otherCategories" src/i18n/locales/en-US.json src/i18n/locales/pt-PT.json` → 1 for each file
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The category area or the tab buttons no longer match the excerpts (beyond the plan 022 changes).
- `transactionFormOptions` is called from somewhere that does not spread its result into
  `<TransactionForm>` (check with `grep -rn "transactionFormOptions" src`; expected: `tx-options.ts`,
  `transactions/new/page.tsx`, `transactions/[id]/page.tsx`).
- A test in `tests/` fails that is unrelated to the files you edited.

## Maintenance notes

- If a new category kind is added to `CATEGORY_KINDS`, update `categoryFitsKind`; the split follows it.
- For transfers the fitting categories are `investment` and `savings`. If the owner prefers transfers
  to have no category chips at all, change `chipCategories` to `[]` for `kind === 'transfer'`.
- Plans 024–026 edit the same form; run them after this one.
