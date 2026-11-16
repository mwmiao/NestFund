# Plan 026: Repeat a recent purchase in one tap, and autocomplete the description

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60bbf14..HEAD -- src/lib/tx-options.ts src/components/transactions/TransactionForm.tsx src/i18n/locales`
> Plans 022–025 are expected to have changed `TransactionForm.tsx`, `tx-options.ts` (plan 023 added
> `defaultIncomeAccount`) and the locale files. The specific lines quoted in "Current state" must
> still be recognisable; if not, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (new query on every form load; new UI row on a small screen)
- **Depends on**: plans/022, 023, 024, 025 (same files; run after them)
- **Category**: direction (small feature)
- **Planned at**: commit `60bbf14`, 2026-11-15

## Why this matters

Most everyday entries repeat: the same supermarket, the same café, the same fuel station. Today each
one is typed again: the description field has no autocomplete at all (checked in a browser on
2026-11-15: the input has no `list` attribute), and the only autocomplete list in the form, for
"Place / store", is hidden inside the collapsed "More details" section. After this plan the new
transaction form shows up to five chips with the descriptions used most in the last six months;
tapping one fills the description, its usual category and its usual account, so the entry is "amount,
one tap, Save". The description field also offers the same list while typing.

A design rule of this form must be respected. The props comment in the form says: "suggestions are
only ever offered, never applied on their own." So: typing never changes the category or the account;
only tapping a chip does, because that is the user's own action.

## Current state

- `src/lib/tx-options.ts` — server-only (`import 'server-only'`), builds the form's props from the
  database. It returns (after plan 023)
  `{ categories, suggest, merchants, subcategories, defaultAccount, defaultIncomeAccount, topCategoryIds }`.
  It gets the database with `const db = getDb();` (from `./db`). An existing query in it, as a style
  example:

```ts
  const recent = db
    .prepare("SELECT account FROM transactions WHERE type IN ('purchase','expense','payment') AND date >= date('now', '-30 days') GROUP BY account ORDER BY COUNT(*) DESC LIMIT 1")
    .get() as { account: string } | undefined;
```

- Table `transactions` (`src/lib/schema.ts:45`): `id`, `date TEXT` (`YYYY-MM-DD`), `amount INTEGER`
  (cents), `type TEXT` (`purchase` / `expense` / `payment` / `income` / `transfer`),
  `description TEXT NOT NULL`, `category_id INTEGER` (nullable), `account TEXT NOT NULL`,
  `payment_method TEXT NOT NULL`, and others.

- `src/components/transactions/TransactionForm.tsx` (client component). Relevant pieces:
  - `const accounts = useAccounts(...)` — the account ids the user has not hidden (array of `AccountId`).
  - state: `description` / `setDescription`, `categoryId` / `setCategoryId` (a string, `''` when
    none), `account` / `setAccount`, `accountTouched` / `setAccountTouched`, `kind`
    (`'spending' | 'income' | 'transfer'`), and the prop `transaction` (set only when editing).
  - the description field:

```tsx
      <Field label={t('tx.description')}>
        <input name="description" value={description} onChange={(e) => setDescription(e.target.value)} enterKeyHint="done" placeholder={categories.find((c) => String(c.id) === categoryId)?.label ?? t(`tx.kinds.${kind}`)} className="input" />
      </Field>
```

  - chips already used in this form for the top categories; copy their look (classes `chip` and
    `chip-active` are defined in `src/app/globals.css`):

```tsx
              <button key={c.id} type="button" aria-pressed={categoryId === String(c.id)} onClick={() => pickCategory(String(c.id))} className={`chip ${categoryId === String(c.id) ? 'chip-active' : ''}`}>
```

  - the merchant field inside "More details" shows how a `<datalist>` is used here:

```tsx
            <input name="merchant" list="merchants" enterKeyHint="done" value={merchant} onChange={(e) => setMerchant(e.target.value)} className="input" />
            <datalist id="merchants">
              {merchants.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
```

- `src/app/transactions/new/page.tsx` and `src/app/transactions/[id]/page.tsx` both render
  `<TransactionForm {...transactionFormOptions(t)} … />`, so a new property returned by
  `transactionFormOptions` reaches the form without editing the pages.

- Database tests use an in-memory database and the real schema. Pattern, from
  `tests/rules-db.test.ts`:

```ts
import Database from 'better-sqlite3';
import { SCHEMA } from '@/lib/schema';
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);
db.prepare("INSERT INTO categories (id, key, name, color, kind, builtin) VALUES (9, NULL, 'Custom', '#000', 'expense', 0)").run();
db.prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, category_id) VALUES ('2026-11-01', 100, 'purchase', 'x', 'ctt', 'card', 9)").run();
```

- Translations: `src/i18n/locales/en-US.json` and `pt-PT.json`, group `"tx"`; every key in both.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |

Never run `npm run dev` as it is: `data/nestfund.db` is the owner's real data. For a browser check, set
`DATA_DIR` to a new empty folder outside the repo and run `npx next dev -p 7788`.

## Scope

**In scope**:
- `src/lib/tx-recent.ts` (create)
- `tests/tx-recent.test.ts` (create)
- `src/lib/tx-options.ts`
- `src/components/transactions/TransactionForm.tsx`
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`

**Out of scope** (do NOT touch):
- `src/lib/categorize.ts` and the "Suggested category" button: it keeps working as today.
- Filling the amount from history (amounts differ; a wrong pre-filled amount is worse than none).
- A "Duplicate" action on the edit page (deferred, see Maintenance notes).
- The dashboard quick-transfer form, income and transfer tabs (chips are for spending only).
- The page files.

## Git workflow

- Branch: `advisor/026-repeat-recent`
- One commit, plain-sentence message, for example: `Offer recent purchases as one-tap chips on the new-transaction form`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The query, as a function that takes the database

Create `src/lib/tx-recent.ts` (no `server-only` import, so the test can load it; it only receives a
database handle):

```ts
import type Database from 'better-sqlite3';

/** A description the user logs often, with the category and account it had the last time. */
export interface RecentEntry {
  description: string;
  categoryId: number | null;
  account: string;
}

/**
 * The spending descriptions used most in the last 180 days (most used first), each with the category and account of its
 * latest use. Upper/lower case is ignored when grouping. With a single MAX() SQLite takes the other columns from that row.
 */
export function recentEntries(db: Database.Database, limit = 30): RecentEntry[] {
  return db
    .prepare(
      `SELECT description, category_id AS categoryId, account, COUNT(*) AS n, MAX(date || '#' || printf('%012d', id)) AS latest
       FROM transactions
       WHERE type IN ('purchase','expense','payment') AND TRIM(description) != '' AND date >= date('now', '-180 days')
       GROUP BY description COLLATE NOCASE
       ORDER BY n DESC, latest DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((r) => {
      const row = r as { description: string; categoryId: number | null; account: string };
      return { description: row.description, categoryId: row.categoryId, account: row.account };
    });
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Test the query

Create `tests/tx-recent.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SCHEMA } from '@/lib/schema';
import { recentEntries } from '@/lib/tx-recent';

function open() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  db.prepare("INSERT INTO categories (id, key, name, color, kind, builtin) VALUES (1, NULL, 'Groceries', '#000', 'expense', 0), (2, NULL, 'Coffee', '#000', 'expense', 0)").run();
  return db;
}
const add = (db: Database.Database, daysAgo: number, type: string, description: string, account: string, categoryId: number | null) =>
  db
    .prepare("INSERT INTO transactions (date, amount, type, description, account, payment_method, category_id) VALUES (date('now', ?), 100, ?, ?, ?, 'card', ?)")
    .run(`-${daysAgo} days`, type, description, account, categoryId);

describe('recent purchases offered for one-tap repeat', () => {
  it('orders by how often a description was used and ignores case', () => {
    const db = open();
    add(db, 3, 'purchase', 'Lidl', 'meal_card', 1);
    add(db, 2, 'purchase', 'lidl', 'meal_card', 1);
    add(db, 1, 'purchase', 'Cafe', 'revolut', 2);
    expect(recentEntries(db).map((r) => r.description.toLowerCase())).toEqual(['lidl', 'cafe']);
  });
  it('takes the category and account from the latest use', () => {
    const db = open();
    add(db, 9, 'purchase', 'Lidl', 'ctt', null);
    add(db, 1, 'purchase', 'Lidl', 'meal_card', 1);
    expect(recentEntries(db)).toEqual([{ description: 'Lidl', categoryId: 1, account: 'meal_card' }]);
  });
  it('leaves out income, transfers and anything older than 180 days', () => {
    const db = open();
    add(db, 1, 'income', 'Salary', 'ctt', null);
    add(db, 1, 'transfer', 'To savings', 'ctt', null);
    add(db, 200, 'purchase', 'Old shop', 'ctt', null);
    expect(recentEntries(db)).toEqual([]);
  });
  it('respects the limit', () => {
    const db = open();
    for (const d of ['a', 'b', 'c']) add(db, 1, 'purchase', d, 'ctt', null);
    expect(recentEntries(db, 2)).toHaveLength(2);
  });
});
```

**Verify**: `npm test -- tests/tx-recent.test.ts` → 4 tests pass.

### Step 3: Hand the list to the form

In `src/lib/tx-options.ts`: import `recentEntries` from `./tx-recent`, and add
`recents: recentEntries(db)` to the returned object.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Translation key

In both locale files, inside `"tx"`, add:

- `en-US.json`: `"recent": "Recent"`
- `pt-PT.json`: `"recent": "Recentes"`

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) console.log(require('./src/i18n/locales/'+f+'.json').tx.recent)"`
→ prints `Recent` then `Recentes`.

### Step 5: Chips and autocomplete in the form

In `src/components/transactions/TransactionForm.tsx`:

1. `import type { RecentEntry } from '@/lib/tx-recent';` and add a prop `recents = []` typed
   `recents?: RecentEntry[]` (destructuring and props type).
2. Below the other derived values (near `const yesterday = …`), add:

```tsx
  // One-tap repeat: only for a new expense, and only while nothing was typed yet.
  const recentChips = !transaction && kind === 'spending' && !description.trim() ? recents.slice(0, 5) : [];
  const useRecent = (r: RecentEntry) => {
    setDescription(r.description);
    if (r.categoryId != null && categories.some((c) => c.id === r.categoryId)) setCategoryId(String(r.categoryId));
    if (accounts.includes(r.account as AccountId)) {
      setAccount(r.account as AccountId);
      setAccountTouched(true);
    }
  };
```

   `useRecent` deliberately calls `setCategoryId` directly, not `pickCategory`: `pickCategory` would
   also pick the category's default account, and here the account comes from the user's own history.
   (If the linter complains that `useRecent` looks like a React hook, rename it `applyRecent`.)

3. Replace the description field with (only `list=…`, the `<datalist>` and the chip row are new):

```tsx
      <div>
        <Field label={t('tx.description')}>
          <input name="description" list="tx-descriptions" value={description} onChange={(e) => setDescription(e.target.value)} enterKeyHint="done" placeholder={categories.find((c) => String(c.id) === categoryId)?.label ?? t(`tx.kinds.${kind}`)} className="input" />
          <datalist id="tx-descriptions">
            {recents.map((r) => (
              <option key={r.description} value={r.description} />
            ))}
          </datalist>
        </Field>
        {recentChips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('tx.recent')}>
            <span className="muted text-xs">{t('tx.recent')}</span>
            {recentChips.map((r) => (
              <button key={r.description} type="button" onClick={() => useRecent(r)} className="chip max-w-[11rem]">
                <span className="truncate">{r.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
```

   Keep every existing attribute of the `<input>` exactly as it is in the file at that moment; if an
   earlier plan changed its `onChange`, keep that version and only add `list="tx-descriptions"`.

4. Do not change the suggestion logic, `pickCategory`, or the "More details" section.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

- `tests/tx-recent.test.ts` (4 tests, Step 2).
- `npm test` → all existing tests pass (`tests/performance.test.ts` exists; if it measures
  `transactionFormOptions` and now fails, that is a STOP condition, not something to tune).
- Optional browser check (throwaway `DATA_DIR`): log "Lidl" twice (category Groceries, account Meal
  card) and "Cafe" once (Restaurants, Revolut). Open `/transactions/new`: a row "Recent: Lidl, Cafe"
  appears under the description. Tap "Lidl": description "Lidl", category Groceries, account Meal
  card; the chip row disappears. Clear the description: the chips return. Type "ca" in the
  description: the browser offers "Cafe"; choosing it changes only the text (the existing "Suggested
  category" button may then offer Restaurants). On the Income tab and on an existing transaction's
  edit page there are no chips.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/tx-recent.test.ts` has 4 passing tests
- [ ] `grep -n 'list="tx-descriptions"' src/components/transactions/TransactionForm.tsx` → 1 match
- [ ] `grep -c '"recent"' src/i18n/locales/en-US.json src/i18n/locales/pt-PT.json` → at least 1 for each file (group `tx`)
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The second test in Step 2 ("takes the category and account from the latest use") fails: the SQLite
  build does not give the bare columns of the MAX() row. Do not paper over it; report (the fix is a
  window-function query and should be reviewed).
- A key `"recent"` already exists inside `"tx"` in a locale file with a different meaning.
- `tests/performance.test.ts` fails after Step 3.

## Maintenance notes

- The list is read on every load of the new/edit form (one grouped query over at most 180 days of
  spending; fine at personal scale, and the table has an index on `date`).
- Deferred on purpose: a "Duplicate" button on the edit page (copy everything including the amount
  into a new entry). It needs the form to accept a template that is not an existing transaction; worth
  its own plan if the chips turn out not to be enough.
- If the owner later wants typing an exact past description to fill the category too, that changes the
  "never applied on their own" rule quoted above and should be a deliberate decision.
