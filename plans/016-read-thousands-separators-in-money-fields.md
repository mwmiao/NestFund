# Plan 016: Read "1.500" and "1,500" as one thousand five hundred in money fields (not €1.50)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0a31f89..HEAD -- src/lib/format.ts src/app/actions.ts src/lib/tx-csv.ts src/components/income/IncomeForm.tsx tests/security.test.ts tests/utils.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW code / MED behavior (changes how a few typed strings are read; see "Decision for the operator")
- **Depends on**: none
- **Category**: bug (data correctness)
- **Planned at**: commit `0a31f89`, 2026-11-15

## Why this matters

NestFund is a Portuguese app that prints money as `1.750,00 €` (dot = thousands). A user who types `1.500` in an amount field (a salary, a rent payment, a balance) gets **€1.50 saved with no warning**: `parseDecimal` sees a single dot and reads it as a decimal point. The same happens with `1,500` (read as €1.50). Money has two decimals, so a separator followed by exactly three digits can only be a thousands separator. After this plan, money fields read that shape as thousands, while non-money fields (days worked, percentages, simulators) keep today's behavior, because `2,125 %` really is a decimal.

## Current state

`src/lib/format.ts:38-60` — the only parser; used by server actions, the CSV import and some client components:

```ts
export function parseDecimal(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && Math.abs(input) <= MAX_AMOUNT ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[€\s ]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  ...
}
```

`"1.500"`: no comma, so nothing is replaced, the regex passes, result `1.5`. `"1,500"`: comma becomes dot, result `1.5`.

`AMOUNT_PATTERN` (`src/lib/format.ts:67`) is the HTML `pattern` for amount inputs. It already accepts `1.500` and `1,500` (as `\d+(?:[.,]\d+)?`), so **do not change it**: the browser keeps accepting them, only the reading changes. A test (`tests/security.test.ts`, "never accepts a string parseDecimal rejects") requires that anything the pattern accepts is still readable; the new function must keep that true.

Call sites of `parseDecimal` (verified at `0a31f89`):

| File:line | Used for | Money? |
|---|---|---|
| `src/app/actions.ts:56-57` | helpers `num` / `optNum`, used for amounts, salary, meal, per-day rates, transport, bonus, goal target/current/monthly, snapshot value, pay days (integers) | yes, **except** `days()` at `actions.ts:227` (days worked, may be 0.5) |
| `src/app/actions.ts:376` | onboarding fixed-expense amount | yes |
| `src/lib/tx-csv.ts:72` | CSV import amount column | yes |
| `src/components/income/IncomeForm.tsx:42-45` | client preview: `normal` / `holiday` are days, `salaryDay` / `mealDay` are per-day money | mixed |
| `src/app/interest-actions.ts:10` | annual rate % and tax rate % | **no — leave alone** |
| `src/components/simulators/NumberField.tsx:18` | simulator fields (€, %, years) | **no — leave alone** |

Existing tests that pin current behavior and must keep passing: `tests/utils.test.ts:11-19` (`'39.90'` → 39.9, `'12,50'` → 12.5, `'1.234,56'`, `'1,234.56'`, `'9 242,30 €'`, `'-5'`) and `tests/security.test.ts:25-60`.

Repo conventions: pure helpers live in `src/lib/*.ts` with vitest tests in `tests/*.test.ts` (model after the `describe('amounts', …)` block in `tests/security.test.ts`). Comments explain intent in plain English. Commit messages are short imperative sentences (example from `git log`: `Snapshot receipts with Create backup now`).

## Decision for the operator

The rule applied to money fields: after removing the euro sign and spaces, a string that is an optional minus, **1–3 digits not starting with 0**, one `.` or `,`, then **exactly three digits** is a whole number of thousands (`1.500` → 1500, `12,345` → 12345, `-2.000` → -2000). Everything else is read exactly as before. Consequence: someone who types `1.234` meaning one euro and 234 thousandths (not a real money amount) now gets 1234. `0.125` is unchanged (leading zero is excluded). If you prefer to *reject* the ambiguous shape instead of choosing, change Step 1 to return `null`; the rest of the plan stays the same.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Tests (all) | `npm test` | all pass |
| Tests (filter) | `npx vitest run tests/security.test.ts tests/utils.test.ts` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/format.ts` (add `parseMoney`)
- `src/app/actions.ts` (switch `num`, `optNum`, line 376 to `parseMoney`; keep `days()` on plain parsing)
- `src/lib/tx-csv.ts` (line 72)
- `src/components/income/IncomeForm.tsx` (per-day money fields only)
- `tests/security.test.ts` (add tests)

**Out of scope** (do NOT touch):
- `parseDecimal` itself — its behavior must not change (percentages and days depend on it).
- `src/app/interest-actions.ts`, `src/components/simulators/*` — percentages and mixed fields.
- `AMOUNT_PATTERN` — see above.
- Any translation file or form markup.

## Git workflow

- Branch: `advisor/016-money-thousands`
- One commit at the end, message like `Read 1.500 as one thousand five hundred in money fields`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `parseMoney` to `src/lib/format.ts`

Add, right after `parseDecimal`:

```ts
/**
 * Like parseDecimal, for amounts of money. Money has two decimals, so "1.500" or "1,500" (one separator, exactly three
 * digits after it) can only be a thousands separator: it is read as 1500, not 1.5. Everything else is read as parseDecimal does.
 * Use parseDecimal (not this) for fields that are not money, such as percentages and days worked.
 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'string') {
    const s = input.trim().replace(/[€\s ]/g, '');
    const m = s.match(/^(-?)([1-9]\d{0,2})[.,](\d{3})$/);
    if (m) return parseDecimal(`${m[1]}${m[2]}${m[3]}`);
  }
  return parseDecimal(input);
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use it for money in the server actions

In `src/app/actions.ts`:
1. Change the import to `import { parseDecimal, parseMoney } from '@/lib/format';`.
2. Lines 56-57: make `num` and `optNum` call `parseMoney` instead of `parseDecimal`.
3. In `saveMonthIncomeAction`, the `days` helper (currently `Math.min(Math.max(num(fd, k), 0), 31)`) must keep reading days as plain decimals: change it to `Math.min(Math.max(parseDecimal(str(fd, k)) ?? 0, 0), 31)`.
4. Line 376 (`setupFixedAction`): `const amount = parseMoney(amounts[i] ?? '');`.

**Verify**: `npm run typecheck` → exit 0; `grep -n "parseDecimal" src/app/actions.ts` → exactly the import line and the one use inside `days`.

### Step 3: CSV import and the income preview

1. `src/lib/tx-csv.ts`: import `parseMoney` instead of `parseDecimal` and use it at line 72 (`const rawAmount = parseMoney(col(row, 'amount'));`).
2. `src/components/income/IncomeForm.tsx`: keep `parseDecimal` for `normal` and `holiday` (days), but use `parseMoney` for `salaryDay` and `mealDay` (lines 44-45) so the live preview matches what the server saves. Update the import line.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass (existing tests unchanged).

### Step 4: Tests

Add to `tests/security.test.ts` (import `parseMoney` next to `parseDecimal`):

```ts
describe('parseMoney', () => {
  it('reads a separator followed by exactly three digits as thousands', () => {
    expect(parseMoney('1.500')).toBe(1500);
    expect(parseMoney('1,500')).toBe(1500);
    expect(parseMoney('12.345')).toBe(12345);
    expect(parseMoney('-2.000')).toBe(-2000);
    expect(parseMoney('€ 1.500')).toBe(1500);
  });
  it('reads everything else exactly like parseDecimal', () => {
    for (const s of ['12,50', '39.90', '1.234,56', '1,234.56', '0.125', '1.5', '1.50', '1.5000', '1234.567', '25', '-5', '9 242,30 €']) expect(parseMoney(s), s).toBe(parseDecimal(s));
    for (const bad of ['abc', '', '1,2,3']) expect(parseMoney(bad), bad).toBeNull();
  });
  it('still reads whatever the amount field pattern accepts', () => {
    const field = new RegExp(`^(?:${AMOUNT_PATTERN})$`);
    const alphabet = ['0', '1', '5', ',', '.', ' '];
    const build = (len: number): string[] => (len === 0 ? [''] : build(len - 1).flatMap((s) => alphabet.map((c) => s + c)));
    for (let len = 1; len <= 6; len++) for (const s of build(len)) if (field.test(s)) expect(parseMoney(s), JSON.stringify(s)).not.toBeNull();
  });
  it('leaves parseDecimal alone, so percentages keep their decimals', () => {
    expect(parseDecimal('2,125')).toBe(2.125);
    expect(parseDecimal('1.500')).toBe(1.5);
  });
});
```

**Verify**: `npx vitest run tests/security.test.ts tests/utils.test.ts` → all pass; then `npm test` → all pass.

## Test plan

Covered in Step 4 (4 new tests). Structural pattern: the `describe('amounts', …)` block already in `tests/security.test.ts`. Manual spot check (optional, only if a dev server is running): enter `1.500` as a transaction amount; the list shows `1.500,00 €`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the 4 new `parseMoney` tests exist and pass; no existing test was edited
- [ ] `grep -rn "parseDecimal" src/app/interest-actions.ts src/components/simulators/NumberField.tsx` still shows the original calls (untouched)
- [ ] `git status` shows only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The call-site table above does not match the code (for example a new money field now calls `parseDecimal` directly): list the extra sites and ask.
- An existing test fails after the change and the fix would be to edit that test.
- You find the pattern test needs `AMOUNT_PATTERN` changed.
- You discover a field currently using `num`/`optNum` that holds a percentage or a count with decimals (for example a new "rate" field): it must stay on `parseDecimal`; stop and report which one.

## Maintenance notes

- Any new money input should use `parseMoney` (server and client); any new percentage/count input should use `parseDecimal`. A comment on both functions says so.
- The simulators (`NumberField.tsx`) mix € and % fields in one component and were left on `parseDecimal` on purpose: a follow-up could pass a `money` flag to `NumberField`.
- Reviewer: check the `days` helper in `saveMonthIncomeAction` really stayed on plain parsing, and that nothing else was moved to `parseMoney`.
