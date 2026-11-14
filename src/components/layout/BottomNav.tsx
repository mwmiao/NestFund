'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { MOBILE_TABS, NAV_GROUPS, NAV_ICONS, isActive, isMoreActive } from './nav';

const FOCUSABLE = 'a[href], button:not([disabled])';

/** Mobile/tablet navigation (below lg): the five main tabs, a floating add button and a "More" tab that opens a dialog sheet. */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const close = (refocus = false) => {
    returnFocus.current = refocus;
    setOpen(false);
  };
  useEffect(() => setOpen(false), [pathname]);
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
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnFocus.current) moreRef.current?.focus();
      returnFocus.current = false;
    };
  }, [open]);
  // The form screens have their own sticky save bar; the add button would only get in the way.
  const hideAdd = /^\/transactions\/(new|\d+)/.test(pathname) || pathname.startsWith('/setup');

  return (
    <>
      {open && (
        <>
          <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => close(true)} />
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
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={isActive(pathname, i.href) ? 'page' : undefined}
                      className={`flex min-h-12 items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition hover:bg-raised ${
                        isActive(pathname, i.href) ? 'bg-raised text-ink' : 'text-subtle'
                      }`}
                    >
                      <Icon d={i.icon} className="h-5 w-5 shrink-0" />
                      <span className="truncate">{t(i.key)}</span>
                    </Link>
                  ))}
                </div>
              </nav>
            ))}
          </div>
        </>
      )}
      {!hideAdd && (
        <Link
          href="/transactions/new"
          aria-label={t('common.quickAdd')}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-pop transition active:scale-95 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden"
        >
          <Icon d={NAV_ICONS.plus} className="h-7 w-7" />
        </Link>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl">
          {MOBILE_TABS.map((i) => {
            const active = isActive(pathname, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium min-[380px]:text-[11px] ${active ? 'text-brand-500' : 'text-subtle'}`}
              >
                <Icon d={i.icon} className="h-[22px] w-[22px] shrink-0" />
                <span className="max-w-full truncate">{t(i.key)}</span>
              </Link>
            );
          })}
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
        </div>
      </nav>
    </>
  );
}
