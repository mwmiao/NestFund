# Plan 020: Translate the "Main" label of the two navigation landmarks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04d553f..HEAD -- src/components/layout src/i18n/locales`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: a11y / i18n
- **Planned at**: commit `04d553f`, 2026-11-15

## Why this matters

NestFund is bilingual (pt-PT and en-US) and every visible and accessible label goes through the translation helper. The two main navigation landmarks (desktop sidebar and mobile bottom bar) are the exception: they have a hard-coded English `aria-label="Main"`, so a screen reader in the Portuguese UI announces "Main, navigation" in English. After this plan the label is translated.

## Current state

`src/components/layout/Sidebar.tsx:44`:

```tsx
      <nav aria-label="Main" className="space-y-0.5">
```

`src/components/layout/BottomNav.tsx:66`:

```tsx
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
```

Both components already have `const { t } = useI18n();` in scope (`Sidebar.tsx:14`, `BottomNav.tsx:17`).

The `nav` group in both locale files, `src/i18n/locales/en-US.json:16` and `pt-PT.json:16`, starts with:

```json
    "skipToContent": "Skip to main content",          // en-US
    "skipToContent": "Saltar para o conteúdo",        // pt-PT
```

Existing tests: `tests/utils.test.ts:89` requires both locale files to have identical keys (so both must get the new key). `tests/nav.test.ts` is the exemplar for a small pure test file. Commit message style: short imperative sentence.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**: `src/components/layout/Sidebar.tsx`, `src/components/layout/BottomNav.tsx`, `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json`, new `tests/nav-label.test.ts`.

**Out of scope**: any other markup, the `skipToContent` key, link labels.

## Git workflow

- Branch: `advisor/020-translate-nav-label`
- One commit, e.g. `Translate the main navigation label`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the key

In the `nav` group of both locale files add, right after `"skipToContent"`:
- en-US: `"main": "Main"`
- pt-PT: `"main": "Principal"`

Keep the JSON valid (mind the commas).

**Verify**: `npm test` → all pass (the key-parity test in `tests/utils.test.ts` still passes).

### Step 2: Use it

Replace `aria-label="Main"` with `aria-label={t('nav.main')}` in both `Sidebar.tsx` and `BottomNav.tsx`.

**Verify**: `npm run typecheck` → exit 0; `grep -rn 'aria-label="' src/components/layout` prints nothing (no hard-coded labels left).

### Step 3: Test

Create `tests/nav-label.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';

describe('navigation landmark label', () => {
  it('is translated in both languages', () => {
    expect(en.nav.main).toBe('Main');
    expect(pt.nav.main).toBeTruthy();
    expect(pt.nav.main).not.toBe(en.nav.main);
  });
  it('is used by both navigation components instead of a hard-coded string', () => {
    for (const file of ['src/components/layout/Sidebar.tsx', 'src/components/layout/BottomNav.tsx']) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).toContain("aria-label={t('nav.main')}");
      expect(source, file).not.toMatch(/aria-label="[A-Za-z]/);
    }
  });
});
```

**Verify**: `npx vitest run tests/nav-label.test.ts` → passes. Then temporarily put `aria-label="Main"` back in one component and confirm the test **fails**; restore and re-run → passes. Finally `npm test` → all pass.

## Test plan

Step 3 (translation present and different per language; both components use it; a scan guards against a hard-coded label returning). Manual spot check if a dev server is running: switch to Portuguese and inspect the `nav` element: `aria-label="Principal"`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new test exists, fails with the hard-coded label and passes with the fix
- [ ] `git status` shows only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Either `nav` element no longer has `aria-label="Main"` or already uses a translation key (then the plan is stale).
- The component has no `t` in scope where the `nav` is rendered.
- An existing test fails and the fix would be to edit that test.

## Maintenance notes

- Any new landmark or icon-only control needs a translated `aria-label` the same way; the scan test only covers the two layout components.
- Reviewer: the hidden-by-CSS duplicate landmark (sidebar vs bottom bar) keeps the same label on purpose; only one is visible at any width.
