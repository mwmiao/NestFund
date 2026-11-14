# Plan 008: Replace the hidden mobile hamburger with a labelled, keyboard-accessible "More" tab

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ca9a94..HEAD -- src/components/layout`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (visible navigation change on phones and tablets)
- **Depends on**: none
- **Category**: UX / accessibility
- **Planned at**: commit `3ca9a94`, 2026-11-14

## Why this matters

On phones and tablets (below the `lg` breakpoint) Reports, Simulators, Categories, Rules and Settings are reachable only
through an unlabelled hamburger icon in the top-right of the header, which opens a sheet. That is hard to discover, and
the sheet is not accessible: it declares `role="menu"`/`role="menuitem"` without any menu keyboard behaviour, cannot be
closed with Escape, does not manage focus, and its opener has no `aria-expanded`. After this plan the sheet is opened by
a labelled "More" tab in the bottom bar, behaves as a modal dialog (Escape closes it, Tab stays inside, focus returns to
the tab), and the header hamburger is gone.

## Current state

- `src/components/layout/Header.tsx` — mobile/tablet top bar. It owns the opener, which fires a window event:

```tsx
// src/components/layout/Header.tsx (relevant parts)
import { MORE_EVENT } from './BottomNav';
import { NAV_ICONS } from './nav';
...
<button type="button" className="btn-ghost !p-2" title={t('nav.more')} aria-label={t('nav.more')} onClick={() => window.dispatchEvent(new Event(MORE_EVENT))}>
  <Icon d={NAV_ICONS.more} className="h-[18px] w-[18px]" />
</button>
```

- `src/components/layout/BottomNav.tsx` — bottom tab bar + sheet. Current structure:

```tsx
export const MORE_EVENT = 'nestfund:more';
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => { const toggle = () => setOpen((o) => !o); window.addEventListener(MORE_EVENT, toggle); return () => window.removeEventListener(MORE_EVENT, toggle); }, []);
  const hideAdd = /^\/transactions\/(new|\d+)/.test(pathname) || pathname.startsWith('/setup');
  return (<>
    {open && (<>
      <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-3 top-16 z-50 rounded-card border border-line bg-surface p-2 shadow-pop lg:hidden" role="menu">
        {NAV_GROUPS.map((g) => ( ... <Link role="menuitem" ...> ... ))}
      </div></>)}
    {!hideAdd && (<Link href="/transactions/new" aria-label={t('common.quickAdd')} className="fixed right-4 z-40 ... bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden">…</Link>)}
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-xl">
        {MOBILE_TABS.map((i) => { …<Link className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium min-[380px]:text-[11px] ${active ? 'text-brand-500' : 'text-subtle'}`}> … })}
      </div></nav></>);
}
```
  (Read the live file first — it is the source of truth; the excerpt above is abbreviated.)

- `src/components/layout/nav.ts` — navigation data. Relevant exports: `PRIMARY_NAV`, `ANALYSE_NAV`, `SETUP_NAV`,
  `NAV_GROUPS: { labelKey: string; items: NavItem[] }[]` (Analyse = Reports, Simulators; Setup = Categories, Rules, Settings),
  `NAV_ICONS` (includes `more`), `MOBILE_TABS = PRIMARY_NAV`, `isActive(pathname, href)`.
- Translation keys that already exist: `nav.more` ("More"), `common.close`, `nav.groupAnalyse`, `nav.groupSetup`.
- Tests run in Vitest with `environment: 'node'` (no DOM); see `tests/hidden-accounts.test.ts` for the file style.

Conventions: client components start with `'use client'`; `@/` alias; Tailwind classes; 2-space indent; keep line endings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Tests | `npx vitest run` | all pass |
| New test | `npx vitest run tests/nav.test.ts` | pass |
| Dev server | `npm run dev` (port 7777) | "Ready" |

## Scope

**In scope**:
- `src/components/layout/nav.ts`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/Header.tsx`
- `tests/nav.test.ts` (create)

**Out of scope**:
- `Sidebar.tsx` (desktop), nav groups/labels, routes, translations (no new keys).
- The floating "+" add button's behaviour (keep it as is).

## Git workflow

- Branch: `advisor/008-more-menu`
- One commit, message in repo style: `Add a labelled More tab with an accessible dialog on mobile`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `isMoreActive` to `nav.ts`

Append (after `isActive`):

```ts
/** True on pages that live in the "More" sheet (Reports, Simulators, Categories, Rules, Settings). */
export function isMoreActive(pathname: string) {
  return NAV_GROUPS.some((g) => g.items.some((i) => isActive(pathname, i.href)));
}
```

Create `tests/nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isMoreActive } from '@/components/layout/nav';

describe('isMoreActive', () => {
  it('is true on pages reached through the More sheet', () => {
    for (const p of ['/reports', '/reports/over-time', '/simulators', '/settings', '/settings/backup', '/transactions/categories', '/transactions/rules'])
      expect(isMoreActive(p), p).toBe(true);
  });
  it('is false on the five main tabs', () => {
    for (const p of ['/', '/transactions', '/transactions/new', '/transactions/12', '/budget', '/goals', '/portfolio']) expect(isMoreActive(p), p).toBe(false);
  });
});
```

**Verify**: `npx vitest run tests/nav.test.ts` → 2 tests pass.

### Step 2: Rewrite `BottomNav.tsx`

Keep the add button and the five tabs as they are. Make these changes:

1. Remove `MORE_EVENT` and its `useEffect` listener. State stays in `BottomNav`.
2. Add refs and a close helper, and a focus/keyboard effect:

```tsx
const moreRef = useRef<HTMLButtonElement>(null);
const sheetRef = useRef<HTMLDivElement>(null);
const returnFocus = useRef(false);
const close = (refocus = false) => {
  returnFocus.current = refocus;
  setOpen(false);
};
const FOCUSABLE = 'a[href], button:not([disabled])';

useEffect(() => {
  if (!open) return;
  const sheet = sheetRef.current;
  sheet?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close(true);
    if (e.key !== 'Tab' || !sheet) return;
    const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    if (returnFocus.current) moreRef.current?.focus();
  };
}, [open]);
```

   (`close` is defined in the component body; because the effect only needs the latest `close` through closure of refs and
   `setOpen`, this is safe. If a lint/type rule complains about missing deps, move `close` above and wrap with `useCallback`.)
3. Replace the sheet markup. Backdrop: `<button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => close(true)} />`.
   Sheet: anchor it above the tab bar and make it a dialog:

```tsx
<div
  ref={sheetRef}
  id="more-sheet"
  role="dialog"
  aria-modal="true"
  aria-label={t('nav.more')}
  className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 rounded-card border border-line bg-surface p-2 shadow-pop lg:hidden"
>
  {NAV_GROUPS.map((g) => (
    <nav key={g.labelKey} aria-label={t(g.labelKey)} className="mb-1">
      <div className="eyebrow px-3 pb-1 pt-2">{t(g.labelKey)}</div>
      <div className="grid grid-cols-2 gap-1">
        {g.items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={isActive(pathname, i.href) ? 'page' : undefined} className={/* same classes as today */}>
            <Icon d={i.icon} className="h-5 w-5 shrink-0" />
            <span className="truncate">{t(i.key)}</span>
          </Link>
        ))}
      </div>
    </nav>
  ))}
</div>
```
   Remove `role="menu"` / `role="menuitem"`.
4. After the `MOBILE_TABS.map(...)` tabs inside the bottom `<nav>`, add the More tab with the same classes as a tab:

```tsx
<button
  ref={moreRef}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-controls="more-sheet"
  onClick={() => (open ? close(true) : setOpen(true))}
  className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium min-[380px]:text-[11px] ${open || isMoreActive(pathname) ? 'text-brand-500' : 'text-subtle'}`}
>
  <Icon d={NAV_ICONS.more} className="h-[22px] w-[22px] shrink-0" />
  <span className="max-w-full truncate">{t('nav.more')}</span>
</button>
```
5. Update imports: add `useRef`; from `./nav` import `MOBILE_TABS, NAV_GROUPS, NAV_ICONS, isActive, isMoreActive`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Remove the header hamburger

In `src/components/layout/Header.tsx` delete the More `<button>`, the imports of `MORE_EVENT`, `Icon`, `NAV_ICONS`, and
`useI18n`/`t` if they are no longer used. Keep the logo, `LanguageSwitcher`, `ThemeToggle`, `NotificationBell`.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -rn "MORE_EVENT" src` → no matches.

### Step 4: Manual check at phone width

Run `npm run dev`, open `http://localhost:7777` with a 375 px wide viewport (browser devtools device mode):
- The bottom bar shows six tabs; the last is "More" (labels must not overlap: at 360 px the Portuguese labels truncate with "…" rather than wrapping).
- Tapping More opens the dialog; the first link has focus; Tab cycles inside; Escape closes it and focus is back on "More".
- Tapping a link navigates and closes the sheet; on `/settings` the More tab is highlighted.
- The header has no hamburger. Desktop width (≥1024 px) is unchanged.

## Test plan

- `tests/nav.test.ts` as above (pure function). Pattern: `tests/hidden-accounts.test.ts`.
- DOM behaviour (focus, Escape) cannot run in the repo's node test environment; it is covered by Step 4. Do not add a DOM test library.
- `npx vitest run` → all pass including 2 new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0 and includes `tests/nav.test.ts`
- [ ] `grep -rn "MORE_EVENT\|role=\"menu\"\|role=\"menuitem\"" src` returns no matches
- [ ] `grep -n "aria-expanded" src/components/layout/BottomNav.tsx` matches the More button
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Six tabs do not fit at 360 px (labels overlap or are clipped to nothing): report with a screenshot description instead of shrinking the font below 10 px or dropping a tab.
- The live `BottomNav.tsx` differs materially from the structure described above.
- Escape or focus return works only by adding a new dependency — do not add dependencies.

## Maintenance notes

- Any new top-level destination belongs in `PRIMARY_NAV` (bottom bar) or a `NAV_GROUPS` group (More sheet); `isMoreActive` follows `NAV_GROUPS` automatically.
- The floating add button sits at `bottom-[calc(4.5rem+…)]`; if the bottom bar height changes, adjust both it and the sheet's `bottom` offset.
- Reviewer: check keyboard behaviour (Tab wrap, Escape, focus return) by hand; automated coverage is not available.
