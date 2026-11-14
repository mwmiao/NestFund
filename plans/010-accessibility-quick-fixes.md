# Plan 010: Accessibility quick fixes — contrast, placeholders, reduced motion, progress bars, hints, small text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ca9a94..HEAD -- src/app/globals.css src/components src/app/page.tsx src/app/budget/page.tsx src/app/portfolio/page.tsx src/app/setup/page.tsx`
> Plans 007 and 008 edit some of these files (buttons, `BottomNav.tsx`, `AccountsPanel.tsx`), so differences from
> them are expected: compare the specific excerpts below against the live code, not the diff size.

## Status

- **Priority**: P2
- **Effort**: S–M (six small, independent edits)
- **Risk**: LOW (some visible colour/size changes)
- **Depends on**: 007 and 008 (only because all three plans edit `AccountsPanel.tsx`, `BottomNav.tsx` and `TransactionForm.tsx`; there is no logical dependency)
- **Category**: accessibility
- **Planned at**: commit `3ca9a94`, 2026-11-14

## Why this matters

Six small WCAG failures, each cheap to fix:
1. **Contrast (1.4.3)**: white text on the green brand colour `brand-600` (`#059669`) is 3.77:1, below the 4.5:1 needed for normal text. This is every primary button, every link in light mode and several badges.
2. **Placeholders (1.4.3)**: placeholder text is `text-subtle/70`, about 3.05:1 on white.
3. **Reduced motion (2.3.3)**: spinners, pulse animations and transitions ignore `prefers-reduced-motion`.
4. **Progress bars (4.1.2)**: when spending passes 100 % the bar reports `aria-valuenow` above its `aria-valuemax`, which is invalid, and has no readable value.
5. **"i" hints**: the new `Hint` shows its text only as a hover `title`, so touch and keyboard users never see it.
6. **Small text (1.4.4/readability)**: information such as "of which meal card" and "of planned" is set at 10–11 px.

## Current state

- `src/app/globals.css` (Tailwind `@apply` in `@layer`s). Tokens in `:root` and `.dark` as space-separated RGB (`--subtle: 101 101 110;`).
  Relevant rules:

```css
/* line ~102 */ .input { @apply w-full … placeholder:text-subtle/70 focus:border-brand-500 … dark:bg-canvas; }
/* line ~111 */ .btn-primary { @apply btn bg-brand-600 text-white shadow-sm hover:bg-brand-500; }
/* line ~142 */ .link { @apply text-sm font-medium text-brand-600 hover:underline dark:text-brand-400; }
```
- `tailwind.config.ts`: `brand: { 50 '#ecfdf5', 100 '#d1fae5', 300 '#6ee7b7', 400 '#34d399', 500 '#10b981', 600 '#059669', 700 '#047857' }`.
  Measured contrast: white on `#059669` = 3.77:1; white on `#047857` = 5.48:1.
- White-on-`brand-600` text elsewhere (all need `bg-brand-700`): `src/app/setup/page.tsx:69`, `src/components/dashboard/SetupPanel.tsx:33`,
  `src/components/layout/BottomNav.tsx` (floating add button, `bg-brand-600 text-white`), `src/components/layout/LanguageSwitcher.tsx:30`,
  `src/components/layout/NotificationBell.tsx:31`, `src/components/transactions/TransactionForm.tsx:216`.
  Leave `src/components/settings/ToggleRow.tsx:13` (`peer-checked:bg-brand-600`, a non-text control needing only 3:1).
- `src/components/ui.tsx` — `ProgressBar` (around lines 70-110):

```tsx
const ratio = Number.isFinite(value) ? value : 0;
const pct = Math.min(Math.max(ratio, 0), 1) * 100;
…
<div … role="progressbar" aria-label={label} aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
```
  and `Hint` (around line 145):

```tsx
export function Hint({ text }: { text: string }) {
  return (
    <span tabIndex={0} role="note" title={text} aria-label={text}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line align-middle text-[10px] font-semibold normal-case leading-none text-subtle outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      i
    </span>
  );
}
```
  `Hint` is imported from `@/components/ui` in many files (keep that import path working).
- Small-text spots (information the user reads): `src/app/budget/page.tsx:159`, `src/app/page.tsx:127,132,141,142`,
  `src/app/portfolio/page.tsx:245`, `src/components/dashboard/AccountsPanel.tsx:169,214`, `src/components/income/IncomeCard.tsx:68,73`,
  `src/components/AccountBadge.tsx:14` (the `xs` size), `src/components/ui.tsx:120` (`Badge`). Each uses `text-[11px]` or `text-[10px]`.
  **Do not change**: `BottomNav.tsx` tab labels (`text-[10px] min-[380px]:text-[11px]`), `NotificationBell.tsx:31` count badge,
  `TransactionList.tsx:64` (decorative initials, `aria-hidden`), `setup/page.tsx:69` and `SetupPanel.tsx:33` (step numbers in a 20 px circle).
- Tests run in Vitest (`environment: 'node'`, `@/` alias). `useI18n()` (client) gives `{ t }`; translations live in
  `src/i18n/locales/en-US.json` and `pt-PT.json` (same nested structure; add new keys to both).

Conventions: 2-space indent, single quotes, short English comments saying *why*. Keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| Contrast test | `npx vitest run tests/contrast.test.ts` | pass |

## Scope

**In scope**: `src/app/globals.css`, `src/components/ui.tsx`, `src/components/Hint.tsx` (create), the single-line colour/size edits in the
files named above, both locale JSON files (one key), `tests/contrast.test.ts` (create).

**Out of scope**: layout, spacing, copy, any other colour, the tab-bar labels and decorative text listed above, dark-mode tokens (they already pass).

## Git workflow

- Branch: `advisor/010-a11y-quick-fixes`; one commit per numbered step is fine, messages in repo style (e.g. `Raise brand button contrast to AA`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Brand contrast, with a test that pins it

Edits:
- `globals.css`: `.btn-primary` → `bg-brand-700 text-white shadow-sm hover:bg-brand-600`; `.link` → `text-brand-700` (keep `dark:text-brand-400`).
- Replace `bg-brand-600` with `bg-brand-700` in the six white-text locations listed under "Current state". (For the add button and badges keep every other class.)

Create `tests/contrast.test.ts`. It reads the tokens from `src/app/globals.css` and `tailwind.config.ts` so it cannot drift from them:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync('src/app/globals.css', 'utf8');
const tw = fs.readFileSync('tailwind.config.ts', 'utf8');

type RGB = [number, number, number];
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};
const token = (b: string, name: string): RGB => {
  const m = b.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const brand = (shade: number): RGB => {
  const m = tw.match(new RegExp(`${shade}:\\s*'#([0-9a-fA-F]{6})'`));
  if (!m) throw new Error(`brand ${shade} not found`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB;
};
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const light = block(':root');
const dark = block('.dark');
const WHITE: RGB = [255, 255, 255];

describe('text contrast (WCAG AA, 4.5:1)', () => {
  it('white text on primary buttons and badges', () => expect(ratio(WHITE, brand(700))).toBeGreaterThanOrEqual(4.5));
  it('links in light mode', () => expect(ratio(brand(700), token(light, 'surface'))).toBeGreaterThanOrEqual(4.5));
  it('links in dark mode', () => expect(ratio(brand(400), token(dark, 'surface'))).toBeGreaterThanOrEqual(4.5));
  for (const [mode, b] of [['light', light], ['dark', dark]] as const) {
    for (const fg of ['subtle', 'positive', 'caution', 'negative', 'info']) {
      for (const bg of ['surface', 'canvas']) {
        it(`${fg} text on ${bg} (${mode})`, () => expect(ratio(token(b, fg), token(b, bg))).toBeGreaterThanOrEqual(4.5));
      }
    }
  }
});
```

**Verify**: `npx vitest run tests/contrast.test.ts` → all pass. If a *token* pair other than brand fails, do not change tokens: STOP and report the pair and ratio.

### Step 2: Placeholder contrast

In `globals.css` `.input`, change `placeholder:text-subtle/70` to `placeholder:text-subtle`.

**Verify**: `grep -n "placeholder:text-subtle" src/app/globals.css` → shows `placeholder:text-subtle ` with no `/70`.

### Step 3: Respect reduced motion

Append at the end of the `@layer base` block in `globals.css` (inside it, after the `@media (pointer: coarse)` rule):

```css
  /* Calm the interface for people who ask for less motion; the spinner keeps turning so progress stays visible. */
  @media (prefers-reduced-motion: reduce) {
    *:not(.animate-spin),
    *:not(.animate-spin)::before,
    *:not(.animate-spin)::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
```

**Verify**: `npm run build` is not required; run `npx tsc --noEmit` (exit 0) and confirm with `grep -n "prefers-reduced-motion" src/app/globals.css` → one match.

### Step 4: Valid progress-bar semantics

In `ProgressBar` (`src/components/ui.tsx`) replace `aria-valuenow={Math.round(ratio * 100)}` with:

```tsx
aria-valuenow={Math.round(pct)}
aria-valuetext={`${Math.round(ratio * 100)} %`}
```

(`pct` is already clamped to 0–100; `aria-valuetext` still tells the user the real figure, e.g. "120 %".)

**Verify**: `grep -n "aria-valuenow\|aria-valuetext" src/components/ui.tsx` → both lines present; `npx tsc --noEmit` → exit 0.

### Step 5: A `Hint` that works on touch and keyboard

Add to both locale files under `common`: `"moreInfo"`: en-US `"More information"`, pt-PT `"Mais informação"`.

Create `src/components/Hint.tsx`:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';

/**
 * Small "i" next to a term. Tap or press Enter to show the explanation (hover and focus also show it);
 * Escape or a tap elsewhere hides it. The text is always in the page for assistive technology.
 */
export function Hint({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative ml-1 inline-block align-middle normal-case" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={t('common.moreInfo')}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs font-semibold leading-none text-subtle hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={open ? 'absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-control border border-line bg-surface p-2 text-xs font-normal leading-snug text-ink shadow-pop' : 'sr-only'}
      >
        {text}
      </span>
    </span>
  );
}
```

In `src/components/ui.tsx` delete the old `Hint` function and add, near the other exports:

```tsx
export { Hint } from '@/components/Hint';
```

**Verify**: `npx tsc --noEmit` → exit 0; `grep -rn "role=\"note\"" src` → no matches.

### Step 6: Readable small text

In exactly the files and lines listed under "Small-text spots", replace `text-[11px]` and `text-[10px]` with `text-xs`
(and `!text-[11px]` with `!text-xs`). Read each line first: for `AccountBadge.tsx:14` only the `xs` branch uses `text-[10px]`; change that
branch only. Do not touch the excluded spots.

**Verify**: `grep -rn "text-\[1[01]px\]" src --include=*.tsx` → only these remain: `BottomNav.tsx` (tab labels), `NotificationBell.tsx`, `TransactionList.tsx`, `setup/page.tsx`, `SetupPanel.tsx`. Then `npx tsc --noEmit` → exit 0.

## Test plan

- `tests/contrast.test.ts` (Step 1) pins brand and token contrast; it reads the CSS so a future colour change that breaks AA fails the suite.
- Steps 2–6 are markup/CSS with no node-testable logic; they are covered by the grep gates. Run `npx vitest run` → everything passes.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/contrast.test.ts`
- [ ] `grep -rn "bg-brand-600" src --include=*.tsx --include=*.css` shows only `ToggleRow.tsx` and the `hover:bg-brand-600` in `.btn-primary`
- [ ] `grep -n "placeholder:text-subtle/70" src/app/globals.css` → no match
- [ ] `grep -n "prefers-reduced-motion" src/app/globals.css` → one match
- [ ] `grep -n "aria-valuetext" src/components/ui.tsx` → one match
- [ ] `grep -rn "role=\"note\"" src` → no match, and `src/components/Hint.tsx` exists
- [ ] the Step 6 grep shows only the five allowed files
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A token pair in the contrast test fails other than the brand pairs (report the pair and ratio; do not edit tokens).
- A line number above no longer matches its description (another plan or commit moved it): find it by the text, and if you cannot identify it unambiguously, skip that line and report it.
- Importing `Hint` from `ui.tsx` causes a "client component imported in server file" build error you cannot resolve by the `export { Hint } from` form — report instead of converting `ui.tsx` to a client file.

## Maintenance notes

- New white-on-green UI must use `brand-700` or darker; the contrast test guards the tokens but not ad-hoc class pairs.
- `Hint` now needs a translated "More information" label; keep `common.moreInfo` in both locales.
- Reviewer: look at the dashboard in light mode for the darker green, and tap a hint on a phone-width viewport.
