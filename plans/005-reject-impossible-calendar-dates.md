# Plan 005: Reject impossible calendar dates (such as 2026-02-31) everywhere dates are validated

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5fcba62..HEAD -- src/lib/dates.ts tests/utils.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5fcba62`, 2026-11-13

## Why this matters

`isISODate` decides whether a date string coming from a form, a CSV file, a JSON backup or a URL is acceptable. It only checks the shape (`YYYY-MM-DD`) and whether `Date.parse` returns a number. V8 (Node) accepts any day up to 31 in any month and silently rolls it over, so `2026-02-31`, `2026-04-31` and `2026-02-29` (not a leap year) all pass. A CSV row dated `31/02/2026` is therefore imported and stored as the literal string `2026-02-31`: it shows up in February's month filter, but code that turns it into a `Date` reads it as 3 March. After this plan, impossible dates are rejected like any other invalid date (the CSV row is reported as invalid, a backup record is skipped with "invalid date", forms fall back to today).

## Current state

Files:
- `src/lib/dates.ts` — date helpers (months `YYYY-MM`, dates `YYYY-MM-DD`, local time). Current code:

```ts
// src/lib/dates.ts:17-19
export function isISODate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

// src/lib/dates.ts:65-72
/** Accepts YYYY-MM-DD or DD/MM/YYYY (also with '-' or '.') and returns ISO, or null. */
export function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  if (isISODate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isISODate(iso) ? iso : null;
}
```

Verified behavior on Node (run `node -e "console.log(Date.parse('2026-02-31'), Date.parse('2026-13-01'))"` → a number, then `NaN`): month 13 and month 00 are rejected, but day 29–31 beyond the month's length is accepted.

- Callers of `isISODate` (all must keep working; none needs editing): `src/lib/dates.ts` (`parseFlexibleDate`), `src/lib/backup-format.ts` (lines ~145, 181, 236: `cleanTransaction`, snapshot and T212-day validation, each `bad('invalid date')`), `src/app/actions.ts` (~142, 222, 298: fall back to `todayISO()` or `null`), `src/app/api/backup/export/route.ts:34` (period filters).
- `src/lib/tx-csv.ts` — uses `parseFlexibleDate`; a `null` result makes the row `CsvInvalid` with reason `'date'`.
- `tests/utils.test.ts` — has `describe('dates', ...)` (lines 27–45) importing from `@/lib/dates`. This is the file to extend.

Conventions: pure functions in `src/lib/dates.ts`, no imports there; short English comments explaining *why*; tests use Vitest `describe/it/expect` (see `tests/utils.test.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| Dates tests | `npx vitest run tests/utils.test.ts` | all pass |
| All tests | `npm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/dates.ts` — `isISODate` only
- `tests/utils.test.ts` — add cases
- `tests/backup.test.ts` — one new case (Step 3)

**Out of scope** (do NOT touch):
- Every caller of `isISODate` and `parseFlexibleDate` — the fix is entirely inside the function.
- Existing stored data: do not add a migration or clean-up of rows already dated with an impossible day (see Maintenance notes).
- `isMonth` and any other helper.

## Git workflow

- Branch: `advisor/005-strict-dates`
- One commit, short imperative message (e.g. `Reject impossible calendar dates such as 2026-02-31`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `isISODate` check the calendar

Replace the body of `isISODate` with a round-trip through UTC: build a `Date` from the three numbers and confirm its parts are unchanged.

```ts
/** Real calendar date in YYYY-MM-DD form. Date.parse alone accepts "2026-02-31" (it rolls over to March), so the parts are re-checked. */
export function isISODate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
```

Note: `Date.UTC` treats years 0–99 as 1900–1999, so a year such as `0099` would round-trip to a different year and be rejected — that is acceptable (no real transaction has such a date) and must not be "fixed".

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add tests to `tests/utils.test.ts`

Import `isISODate` in the existing `@/lib/dates` import (line 8) and add inside `describe('dates', ...)`:

```ts
it('accepts real dates and rejects impossible ones', () => {
  expect(isISODate('2026-02-28')).toBe(true);
  expect(isISODate('2028-02-29')).toBe(true); // leap year
  expect(isISODate('2026-12-31')).toBe(true);
  for (const bad of ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-05', '', 'not a date'])
    expect(isISODate(bad)).toBe(false);
  expect(isISODate(20260228)).toBe(false);
  expect(isISODate(null)).toBe(false);
});
it('parseFlexibleDate rejects impossible dates in every accepted format', () => {
  expect(parseFlexibleDate('31/02/2026')).toBeNull();
  expect(parseFlexibleDate('31.04.2026')).toBeNull();
  expect(parseFlexibleDate('2026-02-31')).toBeNull();
  expect(parseFlexibleDate('29/02/2028')).toBe('2028-02-29');
  expect(parseFlexibleDate('3/11/2026')).toBe('2026-11-03'); // existing behavior unchanged
});
```

**Verify**: `npx vitest run tests/utils.test.ts` → all pass, including the 2 new tests. Then temporarily revert only Step 1 (`git stash push src/lib/dates.ts`), re-run, confirm the 2 new tests **fail**, then `git stash pop`.

### Step 3: Cover the two import paths

- In `tests/backup.test.ts` (it already has `tx()` and `wrap()` helpers and a `validateBackup` suite), add one test: a backup whose transactions are `[tx(), { ...tx(), date: '2026-02-31' }]` yields `r.ok === true`, `r.file.data.transactions` has length 1, and `r.invalid` contains one entry for `transactions#1`.
- CSV: in the same new test file section or in `tests/utils.test.ts`'s `csv` describe, call `parseTransactionsCsv` (from `@/lib/tx-csv`) with the text `date,amount,description\n31/02/2026,10,Lunch\n28/02/2026,10,Lunch` and a resolver `() => null`; expect 1 transaction (`date: '2026-02-28'`) and `invalid` equal to `[{ line: 2, reason: 'date' }]`.

**Verify**: `npx vitest run tests/backup.test.ts tests/utils.test.ts` → all pass.

### Step 4: Full suite

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

Covered in Steps 2–3: unit tests for `isISODate` and `parseFlexibleDate`, a backup-validation case and a CSV-import case. Patterns: `tests/utils.test.ts` (dates, csv) and `tests/backup.test.ts` (`validateBackup`). Verification: `npm test` → all pass, with the new tests included.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new tests exist and pass
- [ ] The new `isISODate` and `parseFlexibleDate` tests fail when Step 1 is reverted (checked in Step 2)
- [ ] `sed -n '/export function isISODate/,/^}/p' src/lib/dates.ts` shows a body that does not call `Date.parse`
- [ ] `git status` shows only `src/lib/dates.ts`, `tests/utils.test.ts`, `tests/backup.test.ts` modified
- [ ] `plans/README.md` status row for 005 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match `src/lib/dates.ts` (drift).
- Any existing test fails after Step 1 because it uses an impossible date as a fixture — report the test and date; do not edit the fixture silently.
- You find a caller that passes dates in a format other than `YYYY-MM-DD` to `isISODate` (the regex would reject them; they were already rejected before, but report it).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Rows already stored with an impossible date (only possible via a past CSV/JSON import) are not changed by this plan; they keep working as before. If someone wants a clean-up, it needs a separate, backed-up migration — flag it rather than adding it here.
- New code that accepts a date from outside should call `isISODate` / `parseFlexibleDate`, never `Date.parse` directly.
- Reviewers: check that the function stays free of imports and that the `0099`-style year behavior is not "improved" into accepting ambiguous years.
