# Plan 013: Add a "Skip to main content" link so keyboard users do not tab through the whole menu on every page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ed4209c..HEAD -- src/app/layout.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (shares the locale JSON files with plans 011 and 012, in a different group; run 011, 012, 013 in order)
- **Category**: accessibility
- **Planned at**: commit `ed4209c`, 2026-11-14

## Why this matters

On desktop the sidebar has about 14 focusable controls (logo, quick-add, five main links, two groups of links, language, notifications, theme)
before the page content. A keyboard or switch user must press Tab that many times on every single page (WCAG 2.4.1 Bypass Blocks).
After this plan the first Tab on any page reveals a "Skip to main content" link; activating it moves focus to the content.

## Current state

- `src/app/layout.tsx` — the root layout (server component); `t` comes from `getI18n()`; the sidebar and header are siblings before `<main>`:

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  …
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : ''}>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <AccountsProvider visible={visibleAccounts()}>
          <Sidebar theme={theme} />
          <Header theme={theme} />
          <div className="lg:pl-60">
            <main className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
            <footer className="muted mx-auto hidden max-w-5xl px-10 pb-8 text-xs lg:block">{t('app.disclaimer')}</footer>
          </div>
```
- `src/app/globals.css` defines one global keyboard-focus style, `:focus-visible { @apply outline-none ring-2 ring-brand-500/70 ring-offset-2 ring-offset-canvas; }`,
  and the button class `.btn-primary` (green button, white text). Tailwind's `sr-only` / `focus:not-sr-only` utilities are available (the repo already uses `sr-only`).
- Translations: nested JSON in `src/i18n/locales/en-US.json` and `pt-PT.json`; the `nav` group exists (keys such as `nav.more`, `nav.dashboard`). Add the key to **both**
  (keep 2-space indent, trailing newline, non-ASCII unescaped).
- Tests: Vitest, node environment, `@/` alias; `tests/page-titles.test.ts` is the pattern for reading source files and asserting structure.

Conventions: 2-space indent; single quotes; keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| New test | `npx vitest run tests/skip-link.test.ts` | pass |

## Scope

**In scope**:
- `src/app/layout.tsx`
- `src/i18n/locales/en-US.json`, `src/i18n/locales/pt-PT.json` (one key in the `nav` group)
- `tests/skip-link.test.ts` (create)

**Out of scope**:
- `Sidebar.tsx`, `Header.tsx`, `BottomNav.tsx`, `globals.css`, any page.
- Landmark roles elsewhere.

## Git workflow

- Branch: `advisor/013-skip-link`
- One commit, message in repo style: `Add a skip to main content link`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the translation key (both locales)

Add to the `nav` group: `nav.skipToContent` — en-US `Skip to main content`, pt-PT `Saltar para o conteúdo`.

**Verify**: `node -e "for (const f of ['en-US','pt-PT']) { const o=require('./src/i18n/locales/'+f+'.json'); if(typeof o.nav.skipToContent!=='string') throw new Error(f+' missing nav.skipToContent') }"` → exit 0, no output.

### Step 2: Add the link and the target in `layout.tsx`

Inside `<body>`, as the very first element (before `<I18nProvider>`, so it is the first Tab stop), add:

```tsx
<a
  href="#main-content"
  className="btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]"
>
  {t('nav.skipToContent')}
</a>
```

and give `<main>` an id and make it programmatically focusable without showing the global focus ring around the whole page:

```tsx
<main id="main-content" tabIndex={-1} className="… existing classes … outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
```

(Keep every existing class on `<main>`; only add the new attributes and the three classes.)

**Verify**: `npx tsc --noEmit` → exit 0; `grep -n 'main-content' src/app/layout.tsx` → two matches (the `href` and the `id`).

### Step 3: Add the regression test

Create `tests/skip-link.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');

describe('skip link', () => {
  it('points at a main element that has the matching id and can take focus', () => {
    expect(layout).toContain('href="#main-content"');
    expect(layout).toMatch(/<main[^>]*id="main-content"[^>]*tabIndex=\{-1\}/);
  });

  it('is the first element in the body, before the providers and navigation', () => {
    const body = layout.indexOf('<body');
    expect(layout.indexOf('href="#main-content"')).toBeGreaterThan(body);
    expect(layout.indexOf('href="#main-content"')).toBeLessThan(layout.indexOf('<I18nProvider'));
  });

  it('has a label in both languages', () => {
    for (const f of ['en-US', 'pt-PT']) {
      const dict = JSON.parse(fs.readFileSync(`src/i18n/locales/${f}.json`, 'utf8'));
      expect(typeof dict.nav.skipToContent, f).toBe('string');
    }
  });
});
```

**Verify**: `npx vitest run tests/skip-link.test.ts` → 3 tests pass; then `npx vitest run` → all pass.

### Step 4 (optional manual check)

With `DATA_DIR=<temp dir> npx next dev -p 7803`, open `http://localhost:7803/` at desktop width, press Tab once: a green "Saltar para o conteúdo" button appears at the top-left. Press Enter: focus moves to the page content (the next Tab lands on the first control inside the page, not in the sidebar), and no large focus ring appears around the whole content area. If you cannot drive a browser, say so.

## Test plan

- `tests/skip-link.test.ts` (Step 3): structure checks (no DOM available). Pattern: `tests/page-titles.test.ts`.
- `npx vitest run` → all pass including 3 new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/skip-link.test.ts`
- [ ] `grep -c 'main-content' src/app/layout.tsx` prints `2`
- [ ] the Step 1 key-check command exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `layout.tsx` no longer has a single `<main>` element wrapping `{children}`, or a skip link already exists.
- The skip link would have to be placed inside a client component to work (it should not: it is a plain anchor in the server layout).

## Maintenance notes

- If the layout gains another landmark before `<main>` (for example a banner), keep the skip link first in `<body>`.
- The target is `<main>` with `tabIndex={-1}`; do not remove that or the link will scroll but not move keyboard focus.
- Reviewer: tab through a page with the keyboard once; the skip link must be the first stop and must disappear when focus leaves it.
