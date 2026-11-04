'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { MOBILE_MORE, MOBILE_TABS, NAV_ICONS, isActive } from './nav';

export const MORE_EVENT = 'nestfund:more';

/** Mobile/tablet navigation (below lg): the five main tabs, a floating add button and a "More" sheet opened from the header. */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(MORE_EVENT, toggle);
    return () => window.removeEventListener(MORE_EVENT, toggle);
  }, []);
  // The form screens have their own sticky save bar; the add button would only get in the way.
  const hideAdd = /^\/transactions\/(new|\d+)/.test(pathname) || pathname.startsWith('/setup');

  return (
    <>
      {open && (
        <>
          <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-16 z-50 rounded-card border border-line bg-surface p-2 shadow-pop lg:hidden" role="menu">
            <div className="grid grid-cols-2 gap-1">
              {MOBILE_MORE.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  role="menuitem"
                  className={`flex min-h-12 items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition hover:bg-raised ${
                    isActive(pathname, i.href) ? 'bg-raised text-ink' : 'text-subtle'
                  }`}
                >
                  <Icon d={i.icon} className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t(i.key)}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      {!hideAdd && (
        <Link
          href="/transactions/new"
          aria-label={t('common.quickAdd')}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-pop transition active:scale-95 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden"
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
        </div>
      </nav>
    </>
  );
}
