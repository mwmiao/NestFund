# Plan 006: Give every page its own translated browser title ("Orçamento mensal · NestFund")

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ca9a94..HEAD -- src/app src/i18n/server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M (mechanical, 19 pages)
- **Risk**: LOW
- **Depends on**: none (see "Order" in `plans/README.md`: run before 007 and 010 to keep merges trivial)
- **Category**: accessibility / UX
- **Planned at**: commit `3ca9a94`, 2026-11-14

## Why this matters

Every page of the app has the same document title, `NestFund`. WCAG 2.4.2 (Page Titled) requires a title that
describes the page: screen readers read the title when a page loads, browser tabs and history show it, and the
Next.js route announcer uses it for client-side navigations. Today a screen-reader user, or anyone with several tabs
open, cannot tell the Budget page from the Settings page. After this plan each page title is the page's own heading,
in the user's language, followed by ` · NestFund`.

## Current state

Files:
- `src/app/layout.tsx` — root layout; the only place a title is set:

```ts
// src/app/layout.tsx:16-18
export const metadata: Metadata = {
  title: 'NestFund',
  description: 'Personal finance dashboard for budgeting, expense tracking, savings goals and long-term investing.',
```

- `src/i18n/server.ts` — server-side translation helper (the app uses its own i18n, not next-intl):

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, dictionaries, isLocale, makeT, type Locale } from './config';

export async function getI18n() {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return { locale, dict, t: makeT(dict) };
}
```

- No page exports `metadata` or `generateMetadata` (verify: `grep -rn "generateMetadata\|export const metadata" src/app` shows only `layout.tsx:16`).
- Translations live in `src/i18n/locales/en-US.json` and `pt-PT.json`. `t('a.b')` looks up nested keys. Default locale is Portuguese.

Page → translation key to use (each is the key the page already passes to its `PageHeader`/`<h1>`, so title and heading always match):

| Page file | Key(s) |
|---|---|
| `src/app/page.tsx` | `dashboard.title` |
| `src/app/budget/page.tsx` | `budget.title` |
| `src/app/goals/page.tsx` | `goals.title` |
| `src/app/notifications/page.tsx` | `notifications.title` |
| `src/app/portfolio/page.tsx` | `portfolio.title` |
| `src/app/reports/page.tsx` | `reports.title` |
| `src/app/reports/over-time/page.tsx` | `reports.title`, `reports.view.time` |
| `src/app/settings/page.tsx` | `settings.title` |
| `src/app/settings/backup/page.tsx` | `backup.title` |
| `src/app/settings/backup/import/page.tsx` | `backup.previewTitle` |
| `src/app/settings/notifications/page.tsx` | `notifications.settingsTitle` |
| `src/app/setup/page.tsx` | `setup.title` |
| `src/app/simulators/page.tsx` | `sim.title` |
| `src/app/transactions/page.tsx` | `tx.title` |
| `src/app/transactions/new/page.tsx` | `tx.new` |
| `src/app/transactions/[id]/page.tsx` | `tx.editTitle` |
| `src/app/transactions/categories/page.tsx` | `categories.title` |
| `src/app/transactions/rules/page.tsx` | `rules.title` |
| `src/app/transactions/rules/apply/page.tsx` | `rules.previewTitle` |

`src/app/history/page.tsx` only redirects; it gets no title. `not-found.tsx` is out of scope.

Conventions: server components, `@/` path alias, 2-space indent, single quotes, short English comments that explain *why*.
Working-tree files may have CRLF line endings (Windows); keep each file's existing endings (do not reformat).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| One test file | `npx vitest run tests/page-titles.test.ts` | pass |
| Dev server (manual check) | `npm run dev` (port 7777) | "Ready" |

## Scope

**In scope**:
- `src/app/layout.tsx`
- `src/i18n/server.ts`
- the 19 page files in the table above (one added import + one added export each)
- `tests/page-titles.test.ts` (create)

**Out of scope**:
- Heading text, layout, any other metadata (description, icons, manifest).
- `src/app/history/page.tsx`, `src/app/not-found.tsx`.
- Translation JSON files — every key above already exists; do not add keys.

## Git workflow

- Branch: `advisor/006-unique-page-titles`
- One commit; message style matches `git log` (imperative, sentence case), e.g. `Give every page its own translated title`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a title template in the root layout

In `src/app/layout.tsx` replace `title: 'NestFund',` with:

```ts
  // Pages set their own title; the template appends the app name ("Orçamento mensal · NestFund").
  title: { default: 'NestFund', template: '%s · NestFund' },
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add the `pageTitle` helper

In `src/i18n/server.ts` add `import type { Metadata } from 'next';` at the top (after `'server-only'`), and append:

```ts
/**
 * `generateMetadata` for a page whose title is one or more translation keys, joined with " – ".
 * Use the same key as the page heading so the title and the heading never disagree.
 */
export const pageTitle =
  (...keys: string[]) =>
  async (): Promise<Metadata> => {
    const { t } = await getI18n();
    return { title: keys.map((k) => t(k)).join(' – ') };
  };
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Export a title from each page

For every page in the table: add `import { pageTitle } from '@/i18n/server';` (merge into the existing
`import { getI18n } from '@/i18n/server';` line when present, as `import { getI18n, pageTitle } from '@/i18n/server';`)
and, directly above `export default`, add:

```ts
export const generateMetadata = pageTitle('budget.title');
```

using the key(s) from the table (for `reports/over-time`: `pageTitle('reports.title', 'reports.view.time')`).
Do not change anything else in the page.

**Verify**: `npx tsc --noEmit` → exit 0, then
`grep -rLn "generateMetadata" src/app --include=page.tsx` → lists only `src/app/history/page.tsx`.

### Step 4: Add the regression test

Create `tests/page-titles.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// getI18n reads the locale cookie; pin it to English so expected titles are stable.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'en-US' }) }) }));

import { pageTitle } from '@/i18n/server';

function pageFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pageFiles(p) : e.name === 'page.tsx' ? [p] : [];
  });
}

// Redirect-only pages never render, so they need no title.
const REDIRECT_ONLY = [path.join('history', 'page.tsx')];

describe('page titles', () => {
  it('every rendered page sets its own title', () => {
    const missing = pageFiles(path.resolve('src/app'))
      .filter((f) => !REDIRECT_ONLY.some((r) => f.endsWith(r)))
      .filter((f) => !fs.readFileSync(f, 'utf8').includes('generateMetadata'));
    expect(missing).toEqual([]);
  });

  it('translates one key, and joins several with an en dash', async () => {
    expect(await pageTitle('nav.budget')()).toEqual({ title: 'Budget' });
    expect(await pageTitle('reports.title', 'reports.view.time')()).toEqual({ title: 'Reports – Over time' });
  });
});
```

**Verify**: `npx vitest run tests/page-titles.test.ts` → 2 tests pass. If the second test's literal strings differ, read
the current values of `nav.budget`, `reports.title`, `reports.view.time` in `src/i18n/locales/en-US.json` and fix the test
expectations, not the locale files.

### Step 5: Check it in a running app

Start `npm run dev`, then:
`curl -s http://localhost:7777/budget | grep -o "<title>[^<]*</title>"` → `<title>Orçamento mensal · NestFund</title>`
(the default language is Portuguese). Repeat for `/settings` (`Definições · NestFund`) and `/reports/over-time`
(`Relatórios – Ao longo do tempo · NestFund`). Stop the dev server afterwards.

## Test plan

- `tests/page-titles.test.ts` (Step 4): structural check that no page was forgotten, plus the helper's output in English.
  Structural pattern: `tests/service-worker.test.ts` / `tests/hidden-accounts.test.ts` for how the repo mocks and reads files.
- `npx vitest run` → everything passes (292 existing + 2 new).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/page-titles.test.ts`
- [ ] `grep -rLn "generateMetadata" src/app --include=page.tsx` prints only `src/app/history/page.tsx`
- [ ] `grep -n "template" src/app/layout.tsx` shows the title template
- [ ] `curl` check in Step 5 shows three distinct titles
- [ ] No files outside the in-scope list changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A page already exports `metadata` or `generateMetadata` (the audit found none; a new one means drift).
- `npx tsc` rejects `export const generateMetadata = pageTitle(...)` in a page that also exports a function named `generateMetadata` or uses `export const dynamic` in a way that conflicts — report the exact error.
- A translation key from the table is missing in either locale file (do not invent strings; report which).

## Maintenance notes

- New pages must export `generateMetadata = pageTitle('<heading key>')`; the structural test fails otherwise.
- Pages whose title depends on data (e.g. a transaction's description) could later pass a custom `generateMetadata`; the helper intentionally covers only the static case.
- Reviewer: confirm each page's key matches the key its `PageHeader` uses, so heading and title stay identical.
