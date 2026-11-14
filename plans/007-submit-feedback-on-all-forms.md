# Plan 007: Show progress and block double-submits on every server-action form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat de39052..HEAD -- src/components src/app`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (about 30 one-line button swaps plus one new component)
- **Risk**: LOW
- **Depends on**: none (run after 006 only to keep merges trivial; both touch page files)
- **Category**: UX / accessibility
- **Planned at**: commit `3ca9a94`, 2026-11-14; line numbers refreshed at `de39052` (after plan 006 added a title export to each page)

## Why this matters

The app is self-hosted, often on a slow NAS. When a form is submitted, only three places show that anything is
happening (the transaction form, the dashboard account panel, the Trading 212 forms). Every other form — budget lines,
goals, income, setup steps, portfolio balances, categories, rules, backups — gives no feedback, so people tap "Save"
again and create duplicates or double-apply an action. After this plan every server-action submit button disables
itself, shows a spinner and announces busy state while the request runs.

## Current state

- `src/components/transactions/TransactionForm.tsx:44-52` — a local `SubmitButton` that already does this for one form:

```tsx
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary min-h-12 flex-[2] sm:flex-none" disabled={pending}>
      {pending ? <Spinner /> : label}
    </button>
  );
}
```

- `src/components/dashboard/AccountsPanel.tsx:36-43` — a second local copy named `Save`:
  `<button className="btn-primary !px-3 !py-2" disabled={pending}>{pending ? <Spinner /> : label}</button>`
- `src/components/settings/T212Connection.tsx:9-16` — a third copy, `Submit`, showing `'…'`. **Leave this one alone**
  (it sits next to `useActionState` messaging).
- `src/components/ConfirmButton.tsx` — destructive button that asks `window.confirm`; it has no pending state:

```tsx
<button type="submit" formAction={formAction} formNoValidate className={className}
  onClick={(e) => { if (!window.confirm(t('common.confirmDelete'))) e.preventDefault(); }}>
  {children}
</button>
```

- `Spinner` is exported from `src/components/ui.tsx` (`export function Spinner({ className = 'h-4 w-4' })`).
- `useFormStatus()` (from `react-dom`) only reports `pending: true` for a form whose `action` is a **function**
  (a server action). For `method="get"` forms or a string `action="/api/..."` it is always false, so those must not be touched.

Plain submit buttons that exist today (output of `grep -rn "<button" src --include=*.tsx | grep -v 'type="button"'`):

```
src/app/budget/page.tsx:65, 367
src/app/notifications/page.tsx:86, 95
src/app/portfolio/page.tsx:201
src/app/settings/backup/import/page.tsx:142, 147
src/app/settings/backup/page.tsx:37, 106           (74 and 89 are the GET download form — leave)
src/app/settings/page.tsx:155
src/app/setup/page.tsx:41, 176
src/app/transactions/categories/page.tsx:40, 61
src/app/transactions/rules/apply/page.tsx:80
src/app/transactions/rules/page.tsx:63, 104, 111, 118, 140
src/components/dashboard/SetupPanel.tsx:20
src/components/goals/GoalForm.tsx:74
src/components/income/IncomeForm.tsx:128
src/components/portfolio/InterestSection.tsx:147
src/components/setup/FixedExpensesForm.tsx:44
src/components/transactions/ImportCsvForm.tsx:19
```

Leave these as they are (not server-action forms): `src/app/reports/page.tsx:103` and `src/app/transactions/page.tsx:155`
(GET filter forms), `src/app/settings/backup/page.tsx:74,89` (GET download of a file).

Conventions: components in `src/components/*.tsx`, `'use client'` first line, `@/` alias, Tailwind utility classes
(`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` defined in `src/app/globals.css`), 2-space indent.
Keep each file's existing line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| Remaining plain buttons | `grep -rn "<button className=" src --include=*.tsx` | see Done criteria |

## Scope

**In scope**:
- `src/components/SubmitButton.tsx` (create)
- `src/components/ConfirmButton.tsx`
- every file in the list above, only to swap the `<button …>` element for `<SubmitButton …>` and add its import
- `src/components/transactions/TransactionForm.tsx` and `src/components/dashboard/AccountsPanel.tsx` (replace their local copies)

**Out of scope**:
- `src/components/settings/T212Connection.tsx` — keeps its own `Submit`.
- The GET forms and download buttons named above; `AutoSubmitForm`; `type="button"` buttons.
- Server actions, form fields, labels, translations.

## Git workflow

- Branch: `advisor/007-submit-feedback`
- Commit after Step 3 and after Step 4; messages in the repo's style, e.g. `Show progress on every form submit button`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared button

Create `src/components/SubmitButton.tsx`:

```tsx
'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui';

/**
 * Submit button for a form with a server action: while the action runs it is disabled (no double-submit),
 * shows a spinner in place of the label (same size, so the layout does not jump) and is announced as busy.
 * Must be rendered inside the <form>. Extra props (name, value, aria-*, formAction) pass through.
 */
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

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Use it in `ConfirmButton`

In `src/components/ConfirmButton.tsx` add `import { useFormStatus } from 'react-dom';`, call
`const { pending } = useFormStatus();` inside the component, and add `disabled={pending}` and
`aria-busy={pending || undefined}` to the `<button>`. Keep everything else (the `confirm`, `formNoValidate`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Replace the two local copies

- `TransactionForm.tsx`: delete the local `SubmitButton` function; import `{ SubmitButton } from '@/components/SubmitButton'`;
  change its use to
  `<SubmitButton className="btn-primary min-h-12 flex-[2] sm:flex-none">{t('common.save')}</SubmitButton>`.
  Remove `Spinner` from its `@/components/ui` import if now unused, and `useFormStatus` from its imports if unused.
- `AccountsPanel.tsx`: delete the local `Save` function; use
  `<SubmitButton className="btn-primary !px-3 !py-2">{label}</SubmitButton>` at its call sites (`<Save label={…} />` →
  `<SubmitButton className="btn-primary !px-3 !py-2">{…}</SubmitButton>`); fix unused imports the same way.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -n "function SubmitButton\|function Save" src/components -r` → only `SubmitButton.tsx` matches.

### Step 4: Swap the remaining submit buttons

For each file:line in the "Plain submit buttons" list (except the exclusions): first confirm the enclosing `<form>` has
`action={someFunction}` (a server action or a function from `@/app/*-actions`). If it does, replace
`<button className="…">label</button>` with `<SubmitButton className="…">label</SubmitButton>` (same classes, same children,
same other attributes such as `aria-pressed`, `disabled`, `aria-label`, `title`), and add
`import { SubmitButton } from '@/components/SubmitButton';`. If the form is `method="get"` or has a string `action`, leave
the button and note the line in your final report.

Notes:
- `src/app/transactions/rules/page.tsx:103,110,117` are per-rule toggle/move buttons with `aria-pressed` / `disabled` /
  `aria-label`: `SubmitButton` passes these through.
- `src/app/settings/backup/import/page.tsx:146` and `src/app/setup/page.tsx:175` are secondary buttons ("cancel",
  "later"); convert them only if their form has a function action, otherwise leave.
- Several buttons are inside server components: that is fine, `SubmitButton` is a client component and can be imported there.

**Verify** (after every few files): `npx tsc --noEmit` → exit 0.

### Step 5: Manual check

Run `npm run dev`. In the browser open `/budget`, press a "Save"/"Add" button on a form: the button must show a
spinner and be disabled until the page reloads. (If you cannot run a browser, state that you could not and rely on the
Done criteria.)

## Test plan

No component tests exist or can run here (Vitest runs with `environment: 'node'`, no DOM). Verification is typecheck, the
grep gates below, and the manual check. Run `npx vitest run` to confirm nothing regressed.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0
- [ ] `grep -rn "<button className=" src --include=*.tsx` lists **only** `src/app/reports/page.tsx`, `src/app/transactions/page.tsx`, `src/components/settings/T212Connection.tsx`, and any lines you explicitly listed in your report as non-server-action forms
- [ ] `grep -rn "useFormStatus" src --include=*.tsx -l` lists exactly `SubmitButton.tsx`, `ConfirmButton.tsx`, `T212Connection.tsx`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A form's `action` is not a function and also not obviously a GET form (report the file and line instead of guessing).
- After the swap, a button inside a form that triggers a **file download** via a server action would stay disabled
  forever (pending never clears because the page does not navigate). None are expected — downloads here use GET routes.
  If you find one, leave that button as a plain button and report it.
- `tsc` reports a type error you cannot fix by adjusting only the swapped JSX.

## Maintenance notes

- New forms with a server action should use `SubmitButton` (and `ConfirmButton` for deletes) — reviewers should reject new bare `<button className=…>` inside action forms.
- `AutoSubmitForm` forms (filters) are GET forms and deliberately not covered.
- Reviewer: check that no button lost an attribute (`aria-pressed`, `disabled`, `title`) during the swap; `git diff` on the rules page is the most likely place.
