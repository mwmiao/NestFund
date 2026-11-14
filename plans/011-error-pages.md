# Plan 011: Show a friendly, translated error page with a retry button instead of Next.js's default error screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ed4209c..HEAD -- src/app/layout.tsx src/app/not-found.tsx src/app/loading.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plans 012 and 013 also add keys to the locale JSON files, in other groups; run the three in order 011, 012, 013 to avoid trivial merge conflicts)
- **Category**: UX / accessibility
- **Planned at**: commit `ed4209c`, 2026-11-14

## Why this matters

The app is self-hosted on small servers (often a NAS) and reads a SQLite database on every request. If a read or a
render throws — a locked or missing database, a full disk, a bug — the user sees Next.js's bare default error page: no
translation, no explanation, no way back. The app has `loading.tsx` and `not-found.tsx` but no error boundary. After this
plan a failure inside a page shows a short translated message with "Try again" and "Go to overview" buttons, and a failure
in the root layout (which also reads the database) shows a self-contained bilingual fallback.

## Current state

- `src/app/` contains only `layout.tsx`, `loading.tsx`, `not-found.tsx` and `page.tsx` at its root — no `error.tsx` and no `global-error.tsx`
  (verify: `ls src/app/*.tsx`).
- `src/app/layout.tsx` is an async server component wrapping everything in providers; it reads the database itself:

```tsx
// src/app/layout.tsx (relevant part)
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : ''}>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <AccountsProvider visible={visibleAccounts()}>   {/* reads the database */}
```
  An error thrown by `visibleAccounts()` happens in the layout itself, so a normal `error.tsx` (which renders *inside* the layout)
  cannot catch it; only `global-error.tsx` can.
- `src/app/not-found.tsx` is the exemplar for a small status page (match its look):

```tsx
import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-semibold">404</p>
      <Link href="/" className="btn-primary mt-6">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}
```
- i18n: client components use `const { t } = useI18n()` from `@/i18n/client`; translations are nested JSON in
  `src/i18n/locales/en-US.json` and `pt-PT.json` (same structure; add every key to **both**; keep formatting: 2-space indent, trailing
  newline, non-ASCII characters unescaped). `t('a.b', { n: 3 })` replaces `{n}`. Default language is Portuguese.
- Button/utility classes `btn-primary`, `btn-secondary`, `muted` are defined in `src/app/globals.css`; `globals.css` is imported by `layout.tsx`.
- Tests: Vitest, node environment, `@/` alias (pattern: `tests/page-titles.test.ts` reads source files and asserts structure).

Conventions: 2-space indent, single quotes, short English comments explaining *why*. Keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| New test | `npx vitest run tests/error-pages.test.ts` | pass |

## Scope

**In scope**:
- `src/app/error.tsx` (create)
- `src/app/global-error.tsx` (create)
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json` (add an `error` group)
- `tests/error-pages.test.ts` (create)

**Out of scope**:
- `layout.tsx`, `not-found.tsx`, `loading.tsx`, any page, any data-layer code. Do not add try/catch around database calls.
- Logging/monitoring services.

## Git workflow

- Branch: `advisor/011-error-pages`
- One commit, message in repo style (imperative, sentence case): `Add translated error pages with a retry button`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add translation keys (both locales)

Add a new top-level `error` object to each locale file (place it after the `common` group):

| key | en-US | pt-PT |
|---|---|---|
| `error.title` | `Something went wrong` | `Algo correu mal` |
| `error.hint` | `This page could not be loaded. Your data is not affected. Try again, and if it keeps happening check that the server and its storage are running.` | `Não foi possível carregar esta página. Os teus dados não foram afetados. Tenta outra vez e, se continuar, verifica se o servidor e o armazenamento estão a funcionar.` |
| `error.retry` | `Try again` | `Tentar outra vez` |
| `error.reference` | `Reference: {id}` | `Referência: {id}` |

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) { const o=require('./src/i18n/locales/'+f+'.json'); for (const k of ['title','hint','retry','reference']) if(!o.error||!o.error[k]) throw new Error(f+' missing error.'+k) }"` → exit 0, no output.

### Step 2: The in-page error boundary

Create `src/app/error.tsx` (Next.js requires a client component with this signature; it renders inside the root layout, so `useI18n` works):

```tsx
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useI18n } from '@/i18n/client';

/** Shown when a page throws while rendering. `reset` re-renders the failed segment. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-xl font-semibold">{t('error.title')}</h1>
      <p className="muted mt-2 text-sm">{t('error.hint')}</p>
      {error.digest && <p className="muted mt-2 text-xs">{t('error.reference', { id: error.digest })}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          {t('error.retry')}
        </button>
        <Link href="/" className="btn-secondary">
          {t('nav.dashboard')}
        </Link>
      </div>
    </div>
  );
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: The root-layout fallback

The root layout reads the database, so a failure there needs `src/app/global-error.tsx`. It replaces the whole document: it must render `<html>` and `<body>`, cannot use the app's providers (they are part of the failed layout) and does not get `globals.css` unless it imports it. Create:

```tsx
'use client';

import './globals.css';

/** Last resort when the root layout itself fails (for example the database cannot be opened). Static, bilingual, no providers. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-PT" className="dark">
      <body className="min-h-screen">
        <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Algo correu mal · Something went wrong</h1>
          <p className="muted mt-2 text-sm">Não foi possível carregar a aplicação. Os teus dados não foram afetados.</p>
          <p className="muted mt-1 text-sm">The app could not be loaded. Your data is not affected.</p>
          {error.digest && <p className="muted mt-2 text-xs">Ref: {error.digest}</p>}
          <button type="button" className="btn-primary mt-6" onClick={reset}>
            Tentar outra vez · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Add the regression test

Create `tests/error-pages.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('error pages', () => {
  it('error.tsx is a client component with a retry button using translated text', () => {
    const src = read('src/app/error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('onClick={reset}');
    for (const key of ['error.title', 'error.hint', 'error.retry']) expect(src).toContain(`'${key}'`);
  });

  it('global-error.tsx renders its own document, because the root layout is what failed', () => {
    const src = read('src/app/global-error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('<html');
    expect(src).toContain('<body');
    expect(src).toContain("import './globals.css'");
    expect(src).not.toContain('useI18n'); // providers live in the layout that failed
  });

  it('every error key exists in both locales', () => {
    for (const f of ['en-US', 'pt-PT']) {
      const dict = JSON.parse(read(`src/i18n/locales/${f}.json`));
      for (const k of ['title', 'hint', 'retry', 'reference']) expect(typeof dict.error?.[k], `${f} error.${k}`).toBe('string');
    }
  });
});
```

**Verify**: `npx vitest run tests/error-pages.test.ts` → 3 tests pass; then `npx vitest run` → all pass.

### Step 5 (optional manual check)

In development Next.js shows its own error overlay instead of `error.tsx`, so test against a production build:
`npm run build` then `DATA_DIR=<an existing, empty temp dir> npx next start -p 7801` and open `http://localhost:7801/`: it should load normally.
Then stop it and start again with `DATA_DIR` pointing at a path that cannot be created (for example a file path instead of a directory); the page
should show the bilingual `global-error` card instead of the default screen. Stop the server afterwards. If you cannot run a browser or a build, skip this
step and say so.

## Test plan

- `tests/error-pages.test.ts` (Step 4): structural checks only — the node test environment cannot render React. Pattern: `tests/page-titles.test.ts`.
- `npx vitest run` → all pass including 3 new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/error-pages.test.ts`
- [ ] `ls src/app/error.tsx src/app/global-error.tsx` lists both files
- [ ] the Step 1 key-check command exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `src/app` already has `error.tsx` or `global-error.tsx` (the audit found none; a new one means drift).
- `import './globals.css'` in `global-error.tsx` makes `tsc` or the build fail in a way you cannot fix by adjusting only that file.
- The `error` group already exists in a locale file with different keys.

## Maintenance notes

- New top-level groups of strings go in both locale files; the `global-error.tsx` text is deliberately hard-coded in both languages because it cannot rely on i18n.
- If a page later needs its own error handling (for example a failing Trading 212 call), add a nested `error.tsx` next to that page rather than changing this one.
- Reviewer: check the Portuguese wording reads naturally; `console.error` in the effect is intentional so the cause stays visible in the browser console.
